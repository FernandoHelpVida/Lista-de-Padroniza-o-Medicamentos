/**
 * ============================================================================
 * DIAG3711_PROVA — fechamento do diagnóstico do caso 3711 (PEPTAMEN 400G)
 * ============================================================================
 * Estado do diagnóstico (evidência já gravada em audit_logs por
 * 1793100024_diag_3711_v2.js, ações DIAG3711_BASE / DIAG3711_PAYLOAD /
 * DIAG3711_COMPRA / DIAG3711_CUSTO / DIAG3711_CURVA):
 *
 * 1. A API oficial de produtos declara last_buy_value=188.02 e
 *    medium_cost=187.87 para o 3711 (payload bruto gravado em
 *    DIAG3711_PAYLOAD_0..3) — a nossa base está FIEL ao payload oficial.
 * 2. Na API de estoques (/get/stocks, 688 movimentações, 64 NFs de compra),
 *    o custo carimbado na movimentação mais recente é 187.87 e a última
 *    Entrada "Nota fiscal - Compra" (NF 7269, id 877089) carimba 188.02.
 *    NENHUMA movimentação carimba 160,00 — o valor 160 NÃO existe como custo
 *    de compra do 3711 nos dados que a API expõe (custos distintos já
 *    gravados em DIAG3711_CUSTO_0..4; entre eles não há 160.00 exato —
 *    só 160.51, 158.x, 162.79, 188.02, 187.87...).
 *
 * Esta migração fecha as duas provas finais:
 * A) DIAG3711_PROVA — consome o JSON do Swagger da API real
 *    (integration.spincare.com.br/.../swagger/v1/swagger.json) com o token
 *    de spincare_config e grava:
 *    - lista completa de caminhos expostos (para documentar se existe algum
 *      endpoint de compras/NF/curva/ABC além de stocks/products/dispensations);
 *    - o schema completo do objeto Stock (todos os campos da movimentação,
 *      para provar se há algum campo de curva/classe que não estamos lendo);
 *    - sonda de qualquer endpoint cujo path contenha compra/purchase/nf/
 *      nota/cost/curva/class/abc (resposta crua em fatias);
 * B) DIAG3711_PROVA — varredura final do JSON de stocks do 3711 procurando
 *    160.00 exato e o par "160" adjacente (para provar se existe alguma
 *    movimentação com custo 160,00 que a tela deles possa exibir).
 *
 * NÃO altera produtos_spincare, não muda fórmula, não troca classe.
 * Idempotente: reexecutar só regrava logs de auditoria.
 * ============================================================================
 */

migrate(
  (app) => {
    const CHUNK = 180

    const gravarFatias = (app, acao, registroId, texto) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const numChunks = Math.max(1, Math.ceil(texto.length / CHUNK))
      for (let c = 0; c < numChunks; c++) {
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', registroId + '_' + c)
        recLog.set('acao', acao)
        recLog.set('usuario_nome', 'Migracao Diag 3711 PROVA')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', 'sucesso')
        recLog.set('detalhes', texto.substring(c * CHUNK, (c + 1) * CHUNK))
        app.save(recLog)
      }
    }

    const decodePayload = (rec) => {
      const raw = rec.get('payload')
      let payloadStr = ''
      try {
        if (raw instanceof Array || (raw && typeof raw === 'object' && raw.length !== undefined)) {
          const bytes = []
          for (let i = 0; i < raw.length; i++) {
            const v = raw[i]
            if (typeof v === 'number') bytes.push(v)
            else bytes.push(String(v).charCodeAt(0))
          }
          payloadStr = decodeURIComponent(
            bytes
              .map(function (b) {
                return '%' + ('00' + b.toString(16)).slice(-2)
              })
              .join(''),
          )
        } else if (typeof raw === 'string') {
          payloadStr = raw
        } else if (raw) {
          payloadStr = JSON.stringify(raw)
        }
      } catch (decErr) {
        return { erro: 'ERRO_DECODE: ' + String(decErr), json: null, rawStr: '' }
      }
      try {
        return { erro: '', json: JSON.parse(payloadStr), rawStr: payloadStr }
      } catch (_) {
        return { erro: 'ERRO_PARSE', json: null, rawStr: payloadStr }
      }
    }

    // ========================================================================
    // A) Swagger: consumir o JSON real da API para listar TODOS os endpoints
    // ========================================================================
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (records && records.length > 0) {
        const cfgRec = records[0]
        const baseUrl = (
          cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
        )
          .trim()
          .replace(/\/+$/, '')
        const login = (cfgRec.getString('api_login') || '').trim()
        const password = (cfgRec.getString('api_password') || '').trim()
        let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
        let apiToken = rawStoredToken.startsWith('Bearer ')
          ? rawStoredToken.substring(7).trim()
          : rawStoredToken

        const fetchFreshToken = () => {
          if (!login || !password) return ''
          try {
            const resToken = $http.send({
              url:
                baseUrl +
                '/token/v1?login=' +
                encodeURIComponent(login) +
                '&password=' +
                encodeURIComponent(password),
              method: 'GET',
              headers: { Accept: '*/*' },
              timeout: 15,
            })
            if (resToken.statusCode === 200) {
              let t = ''
              if (typeof resToken.json === 'string') t = resToken.json
              else if (resToken.json && typeof resToken.json === 'object') {
                t = resToken.json.token || resToken.json.access_token || ''
              }
              if (!t && resToken.raw) t = resToken.raw.replace(/^"|"$/g, '').trim()
              if (t) {
                if (t.startsWith('Bearer ')) t = t.substring(7).trim()
                apiToken = t
                cfgRec.set('api_token', t)
                app.save(cfgRec)
                return t
              }
            }
          } catch (authErr) {
            console.error('[Diag3711 PROVA] Erro ao renovar token:', authErr)
          }
          return ''
        }
        if (!apiToken) apiToken = fetchFreshToken()

        // -------- A1. Swagger JSON (lista de endpoints + schemas) ----------
        let swagger = null
        let swaggerStr = ''
        const swaggerUrls = [
          baseUrl + '/swagger/v1/swagger.json',
          baseUrl + '/swagger/v1/swagger.json?schemaKey=stock',
          baseUrl.replace('/spincare_integration', '') + '/swagger/v1/swagger.json',
        ]
        let swErr = ''
        for (let i = 0; i < swaggerUrls.length; i++) {
          try {
            const r = $http.send({
              url: swaggerUrls[i],
              method: 'GET',
              headers: { Accept: 'application/json' },
              timeout: 20,
            })
            if (r.statusCode === 200 && r.raw) {
              swaggerStr = r.raw
              try {
                swagger = JSON.parse(r.raw)
                break
              } catch (_) {
                /* tenta próxima URL */
              }
            } else {
              swErr += 'URL' + i + '=' + r.statusCode + ';'
            }
          } catch (swE) {
            swErr += 'URL' + i + '=EXC:' + String(swE).slice(0, 60) + ';'
          }
        }

        const candidatosCurva = []
        const schemaStockResumo = {}
        if (swagger && swagger.paths) {
          const todos = []
          for (const p in swagger.paths) {
            todos.push(p)
            const low = p.toLowerCase()
            if (
              low.indexOf('compra') >= 0 ||
              low.indexOf('purchase') >= 0 ||
              low.indexOf('nota') >= 0 ||
              low.indexOf('nf') >= 0 ||
              low.indexOf('cost') >= 0 ||
              low.indexOf('curva') >= 0 ||
              low.indexOf('class') >= 0 ||
              low.indexOf('abc') >= 0 ||
              low.indexOf('invoice') >= 0 ||
              low.indexOf('moviment') >= 0 ||
              low.indexOf('balance') >= 0
            ) {
              candidatosCurva.push(p)
            }
          }
          // schema Stock completo (todos os campos da movimentação)
          if (swagger.definitions) {
            for (const d in swagger.definitions) {
              const low = d.toLowerCase()
              if (low === 'stock' || low.indexOf('stock') >= 0 || low.indexOf('movement') >= 0) {
                const props = swagger.definitions[d].properties || {}
                schemaStockResumo[d] = Object.keys(props).join(',')
              }
            }
          }
          gravarFatias(
            app,
            'DIAG3711_PROVA',
            'diag3711_swagger_endpoints',
            JSON.stringify({
              total_endpoints: todos.length,
              candidatos_curva_compra: candidatosCurva,
              schemas_stock: schemaStockResumo,
              erro_swagger_urls: swErr,
            }),
          )

          // -------- A2. Sondas nos endpoints candidatos --------------------
          // (apenas GET e um GET por grupo — sondas de leitura, sem alteração)
          const sondados = {}
          for (let i = 0; i < candidatosCurva.length && i < 6; i++) {
            const path = candidatosCurva[i]
            if (sondados[path]) continue
            sondados[path] = true
            const fullUrl =
              baseUrl +
              path +
              (path.indexOf('?') >= 0 ? '&' : '?') +
              'token=' +
              encodeURIComponent(apiToken)
            let out = { path: path, status: 0, corpo: '' }
            try {
              const r = $http.send({
                url: fullUrl,
                method: 'GET',
                headers: { Accept: 'application/json' },
                timeout: 15,
              })
              out.status = r.statusCode
              out.corpo = String(r.raw || '').slice(0, 900)
            } catch (sE) {
              out.corpo = 'ERRO: ' + String(sE).slice(0, 200)
            }
            gravarFatias(app, 'DIAG3711_PROVA', 'diag3711_sonda_' + i, JSON.stringify(out))
          }
        } else {
          gravarFatias(
            app,
            'DIAG3711_PROVA',
            'diag3711_swagger_endpoints',
            JSON.stringify({
              erro: 'SWAGGER_INDISPONIVEL',
              detalhe: swErr || 'nenhuma URL respondeu 200 com JSON',
              nota: 'swagger JSON não acessível do JSVM — endpoints conhecidos da integração real: get/products, get/stocks, get/dispensations, get/budgets, get/patients, token/v1',
            }),
          )
        }

        // -------- A3. Varredura final do stocks do 3711 por 160,00 ---------
        try {
          let allStocks = []
          for (let p = 1; p <= 5; p++) {
            let resp = null
            try {
              resp = $http.send({
                url:
                  baseUrl +
                  '/integration-engine/get/stocks?token=' +
                  encodeURIComponent(apiToken) +
                  '&product_id=3711&page_number=' +
                  p +
                  '&page_size=500',
                method: 'GET',
                headers: { Accept: 'application/json' },
                timeout: 20,
              })
            } catch (_) {
              break
            }
            if (resp && resp.statusCode === 401) {
              const fresh = fetchFreshToken()
              if (fresh) {
                try {
                  resp = $http.send({
                    url:
                      baseUrl +
                      '/integration-engine/get/stocks?token=' +
                      encodeURIComponent(fresh) +
                      '&product_id=3711&page_number=' +
                      p +
                      '&page_size=500',
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    timeout: 20,
                  })
                } catch (_) {
                  break
                }
              }
            }
            if (!resp || resp.statusCode !== 200) break
            let list = []
            try {
              list = resp.json || JSON.parse(resp.raw || '[]')
            } catch (_) {
              list = []
            }
            if (Array.isArray(list)) {
              allStocks = allStocks.concat(list)
              if (list.length < 500) break
            } else if (list && Array.isArray(list.items)) {
              allStocks = allStocks.concat(list.items)
              if (list.items.length < 500) break
            } else {
              break
            }
          }

          const prodStocks = allStocks.filter(
            (x) =>
              x &&
              Number(x.product_id !== undefined ? x.product_id : (x.product || {}).id) === 3711,
          )
          // movimentações cujo JSON contém "160" (custo, qt ou outra ocorrência)
          const hits160 = []
          for (let i = 0; i < prodStocks.length; i++) {
            const s = prodStocks[i]
            const sStr = JSON.stringify(s)
            if (
              sStr.indexOf('"160"') >= 0 ||
              sStr.indexOf(':160,') >= 0 ||
              sStr.indexOf(':160}') >= 0 ||
              sStr.indexOf('"160.00"') >= 0
            ) {
              hits160.push({
                id: s.id,
                dt: s.movement_dt,
                op: s.operation_type,
                op_ds: s.operation_ds,
                nf: s.invoice_number !== undefined ? s.invoice_number : s.nf,
                cost: s.cost_unit_price,
                qt: s.quantity !== undefined ? s.quantity : s.qt,
              })
            }
          }
          // movimentações com cost_unit_price entre 159 e 161 (mais próximo de 160)
          const custoProximo160 = prodStocks
            .filter((x) => {
              const c = Number(x.cost_unit_price)
              return c >= 159 && c <= 161
            })
            .slice(0, 10)
            .map((x) => ({
              id: x.id,
              dt: x.movement_dt,
              op: x.operation_type,
              op_ds: x.operation_ds,
              nf: x.invoice_number !== undefined ? x.invoice_number : x.nf,
              cost: x.cost_unit_price,
              qt: x.quantity !== undefined ? x.quantity : x.qt,
            }))

          gravarFatias(
            app,
            'DIAG3711_PROVA',
            'diag3711_busca_160',
            JSON.stringify({
              total_movimentacoes: prodStocks.length,
              hits_160_exato: hits160.length,
              hits_160: hits160.slice(0, 15),
              custos_proximos_160: custoProximo160,
              stocks_contem_160_00:
                JSON.stringify(allStocks).indexOf('160.00') >= 0 ||
                JSON.stringify(allStocks).indexOf('160,00') >= 0,
            }),
          )
        } catch (e160) {
          gravarFatias(
            app,
            'DIAG3711_PROVA',
            'diag3711_busca_160_erro',
            JSON.stringify({ erro: String(e160) }),
          )
        }
      } else {
        gravarFatias(
          app,
          'DIAG3711_PROVA',
          'diag3711_erro',
          JSON.stringify({ erro: 'SEM_SPINCARE_CONFIG' }),
        )
      }
    } catch (eApi) {
      gravarFatias(app, 'DIAG3711_PROVA', 'diag3711_erro', JSON.stringify({ erro: String(eApi) }))
    }

    // ========================================================================
    // B) Estado do banco 3711 + 2940/2944 — prova de que NADA foi alterado
    // ========================================================================
    try {
      const ids = ['3711', '2940', '2944']
      const estado = {}
      for (let i = 0; i < ids.length; i++) {
        try {
          const r = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
            id: Number(ids[i]),
          })
          estado[ids[i]] = {
            ultima_compra_price: r.getFloat('ultima_compra_price'),
            custo_medio_price: r.getFloat('custo_medio_price'),
            fonte_preco: r.getString('fonte_preco'),
          }
        } catch (_) {
          estado[ids[i]] = { erro: 'NAO_ENCONTRADO' }
        }
      }
      gravarFatias(
        app,
        'DIAG3711_PROVA',
        'diag3711_estado_banco',
        JSON.stringify({
          estado: estado,
          nota: 'prova de integridade: 2940 deve ser 0.24/0.39 e 2944 1.56/1.52; 3711 188.02/187.87 oficial',
        }),
      )
    } catch (eEstado) {
      gravarFatias(
        app,
        'DIAG3711_PROVA',
        'diag3711_estado_erro',
        JSON.stringify({ erro: String(eEstado) }),
      )
    }

    // ========================================================================
    // C) Curva calculada: consumo do 3711 vs distribuição de todos os produtos
    //    (evidência para confrontar com a classe C da tela deles)
    // ========================================================================
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 3711')
      let totalQt = 0
      let totalDisps = 0
      if (rec) {
        const disps = app.findRecordsByFilter('dispensacoes_spincare', 'payload ~ "3711"', '', 0, 0)
        for (let i = 0; i < disps.length; i++) {
          const dec = decodePayload(disps[i])
          const itens = dec.json && Array.isArray(dec.json.items) ? dec.json.items : []
          for (let k = 0; k < itens.length; k++) {
            const it = itens[k] || {}
            if (Number(it.product_id) !== 3711) continue
            totalQt += Number(
              it.sent_qt !== undefined && it.sent_qt !== null ? it.sent_qt : it.qt || 0,
            )
            totalDisps++
          }
        }
        const cm = rec.getFloat('custo_medio_price')
        gravarFatias(
          app,
          'DIAG3711_PROVA',
          'diag3711_curva_consumo',
          JSON.stringify({
            dispensacoes_3711: totalDisps,
            qt_total_dispensada: totalQt,
            valor_nosso_cm: Math.round(totalQt * cm * 100) / 100,
            nota: 'curva calculada: nenhum campo curva/classe exposto pela API (payload de produto gravado em DIAG3711_PAYLOAD_0..3 nao tem curvaCalculada); classe deles e calculada pela tela deles',
          }),
        )
      }
    } catch (eCurva) {
      gravarFatias(
        app,
        'DIAG3711_PROVA',
        'diag3711_curva_erro',
        JSON.stringify({ erro: String(eCurva) }),
      )
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
