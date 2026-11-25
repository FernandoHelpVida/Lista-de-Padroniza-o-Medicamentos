/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — CASO 3711 (PEPTAMEN 400G) — v2
 * ============================================================================
 * Divergências reportadas entre a tela do SpinCare e a nossa base:
 * - Última compra: tela deles R$160,00 × nossa base 188,02 (last_buy_value)
 * - Custo médio:   tela deles R$182,347563 × nossa base 187,87 (medium_cost)
 * - Curva calculada: tela deles "C" × nossa Classe A
 *
 * Esta migração NÃO altera produtos — só coleta EVIDÊNCIA e grava em
 * audit_logs (detalhes em fatias de ~180 chars; o campo corta na exibição):
 *
 * PARTE 1 (DIAG3711_BASE): estado do registro 3711 no banco + payload bruto
 *          da API de produtos (decodificado do array de bytes) em fatias.
 * PARTE 2 (DIAG3711_COMPRA): chama a API REAL com as credenciais de
 *          spincare_config: /get/stocks do 3711 (todas as movimentações com
 *          dt/operação/NF/custo) + sondas /get/purchases e /get/product_costs
 *          (resposta crua em fatias, para provar onde está 160,00).
 * PARTE 3 (DIAG3711_CUSTO): procura 182.347563 / 182.35 / 160 nos JSONs
 *          capturados e lista os cost_unit_price distintos com contagem.
 * PARTE 4 (DIAG3711_CURVA): consumo do 3711 em dispensacoes_spincare (qt
 *          dispensada total e valor × nosso custo médio), para confrontar com
 *          "Curva calculada: C" da tela deles.
 * A varredura de DIMENSÃO (oficiais × carimbo das movimentações) roda em cron
 * temporário próprio (DIAG3711_DIMENSAO), em lotes, para não estourar a janela
 * de apply da migração.
 * Idempotente: reexecutar só regrava logs de auditoria.
 * ============================================================================
 */

migrate(
  (app) => {
    // ---- helpers -----------------------------------------------------------
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

    const gravarFatias = (app, acao, registroId, texto) => {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const CHUNK = 180
      const numChunks = Math.max(1, Math.ceil(texto.length / CHUNK))
      for (let c = 0; c < numChunks; c++) {
        const recLog = new Record(auditCol)
        recLog.set('colecao', 'produtos_spincare')
        recLog.set('registro_id', registroId + '_' + c)
        recLog.set('acao', acao)
        recLog.set('usuario_nome', 'Migracao Diag 3711')
        recLog.set('usuario_email', 'diag@helpvida.internal')
        recLog.set('usuario_role', 'sistema')
        recLog.set('status_novo', 'sucesso')
        recLog.set('detalhes', texto.substring(c * CHUNK, (c + 1) * CHUNK))
        app.save(recLog)
      }
    }

    // =========================================================================
    // PARTE 1 — estado do banco + payload decodificado do 3711
    // =========================================================================
    let rec3711 = null
    try {
      rec3711 = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
        id: 3711,
      })
    } catch (_) {
      rec3711 = null
    }
    if (rec3711) {
      const dec = decodePayload(rec3711)
      if (dec.json) {
        const keys = []
        for (const k in dec.json) keys.push(k)
        const evid = {
          spincare_id: 3711,
          synced_at: rec3711.getString('synced_at'),
          fonte_preco: rec3711.getString('fonte_preco'),
          db_ultima_compra: rec3711.getFloat('ultima_compra_price'),
          db_custo_medio: rec3711.getFloat('custo_medio_price'),
          payload_last_buy_value:
            dec.json.last_buy_value !== undefined ? dec.json.last_buy_value : 'AUSENTE',
          payload_medium_cost:
            dec.json.medium_cost !== undefined ? dec.json.medium_cost : 'AUSENTE',
          payload_price: dec.json.price,
          payload_keys: keys.join(','),
        }
        gravarFatias(app, 'DIAG3711_BASE', 'diag3711_base', JSON.stringify(evid))
        // Payload bruto em fatias (prova material do que a API de produtos declarou)
        gravarFatias(app, 'DIAG3711_PAYLOAD', 'diag3711_payload', dec.rawStr)
      } else {
        gravarFatias(app, 'DIAG3711_BASE', 'diag3711_base', JSON.stringify({ erro: dec.erro }))
      }
    } else {
      gravarFatias(
        app,
        'DIAG3711_BASE',
        'diag3711_base',
        JSON.stringify({ erro: 'REGISTRO_3711_NAO_ENCONTRADO' }),
      )
    }

    // =========================================================================
    // PARTE 2/3 — sondas na API REAL (mesmo padrão do spincare_backfill_az_temp)
    // =========================================================================
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
            console.error('[Diag3711] Erro ao renovar token:', authErr)
          }
          return ''
        }
        if (!apiToken) apiToken = fetchFreshToken()

        const parseMoney = (v) => {
          if (typeof v === 'number') return v
          let s = String(v || '')
            .trim()
            .replace(/[^\d.,-]/g, '')
          if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0)
            s = s.split('.').join('').replace(',', '.')
          else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
          return parseFloat(s) || 0
        }

        const requestStocks = (prodId) => {
          let all = []
          for (let p = 1; p <= 5; p++) {
            let resp = null
            try {
              resp = $http.send({
                url:
                  baseUrl +
                  '/integration-engine/get/stocks?token=' +
                  encodeURIComponent(apiToken) +
                  '&product_id=' +
                  prodId +
                  '&page_number=' +
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
                      '&product_id=' +
                      prodId +
                      '&page_number=' +
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
              all = all.concat(list)
              if (list.length < 500) break
            } else if (list && Array.isArray(list.items)) {
              all = all.concat(list.items)
              if (list.items.length < 500) break
            } else {
              break
            }
          }
          return all
        }

        // ---- /get/stocks 3711: todas as movimentações, resumo compacto ----
        const stocks3711 = requestStocks(3711)
        const movs = stocks3711
          .filter(
            (x) =>
              x &&
              Number(x.product_id !== undefined ? x.product_id : (x.product || {}).id) === 3711,
          )
          .slice()
          .sort((a, b) => {
            const dA = String(a.movement_dt || '')
            const dB = String(b.movement_dt || '')
            if (dB !== dA) return dB.localeCompare(dA)
            return (Number(b.id) || 0) - (Number(a.id) || 0)
          })
        const movsCompacto = movs.slice(0, 80).map((m) => ({
          id: m.id,
          dt: m.movement_dt,
          op: m.operation_type,
          op_ds: m.operation_ds,
          nf: m.invoice_number !== undefined ? m.invoice_number : m.nf,
          cost: m.cost_unit_price,
          qt: m.quantity !== undefined ? m.quantity : m.qt,
        }))
        gravarFatias(
          app,
          'DIAG3711_COMPRA',
          'diag3711_stocks',
          JSON.stringify({
            total_movimentacoes: movs.length,
            entradas_compra: movs.filter(
              (m) =>
                m.operation_type === 'Entrada' &&
                String(m.operation_ds || '').indexOf('Nota fiscal - Compra') >= 0,
            ).length,
            movs: movsCompacto,
          }),
        )

        // ---- Endpoints candidatos a "histórico de compras"/custo ----
        const sondas = [
          { nome: 'purchases', url: '/integration-engine/get/purchases?product_id=3711' },
          { nome: 'product_costs', url: '/integration-engine/get/product_costs?product_id=3711' },
        ]
        for (let s = 0; s < sondas.length; s++) {
          let out = { nome: sondas[s].nome, status: 0, corpo: '' }
          try {
            const resp = $http.send({
              url: baseUrl + sondas[s].url + '&token=' + encodeURIComponent(apiToken),
              method: 'GET',
              headers: { Accept: 'application/json' },
              timeout: 15,
            })
            out.status = resp.statusCode
            out.corpo = String(resp.raw || '').slice(0, 1200)
          } catch (sErr) {
            out.corpo = 'ERRO: ' + String(sErr)
          }
          gravarFatias(
            app,
            'DIAG3711_COMPRA',
            'diag3711_sonda_' + sondas[s].nome,
            JSON.stringify(out),
          )
        }

        // ---- PROCURAR 182.347563 / 160.00 nos JSONs capturados ----
        const stocksStr = JSON.stringify(stocks3711)
        const custosVistos = {}
        for (let i = 0; i < stocks3711.length; i++) {
          const c = parseMoney(stocks3711[i].cost_unit_price)
          if (c > 0) custosVistos[String(c)] = (custosVistos[String(c)] || 0) + 1
        }
        const custosLista = []
        for (const k in custosVistos) custosLista.push(k + 'x' + custosVistos[k])
        gravarFatias(
          app,
          'DIAG3711_CUSTO',
          'diag3711_custo',
          JSON.stringify({
            stocks_total: stocks3711.length,
            contem_182347563: stocksStr.indexOf('182.347563') >= 0,
            contem_182_35: stocksStr.indexOf('182.35') >= 0,
            contem_160: stocksStr.indexOf('160') >= 0,
            custos_distintos: custosLista,
          }),
        )
      } else {
        gravarFatias(
          app,
          'DIAG3711_COMPRA',
          'diag3711_sonda',
          JSON.stringify({ erro: 'SEM_SPINCARE_CONFIG' }),
        )
      }
    } catch (eApi) {
      gravarFatias(
        app,
        'DIAG3711_COMPRA',
        'diag3711_sonda_erro',
        JSON.stringify({ erro: String(eApi) }),
      )
    }

    // =========================================================================
    // PARTE 4 — curva: consumo do 3711 nas dispensações locais
    // =========================================================================
    try {
      let totalQt = 0
      let totalDisps = 0
      if (rec3711) {
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
        const cm = rec3711.getFloat('custo_medio_price')
        const valor = Math.round(totalQt * cm * 100) / 100
        gravarFatias(
          app,
          'DIAG3711_CURVA',
          'diag3711_curva',
          JSON.stringify({
            dispensacoes_3711: totalDisps,
            qt_total_dispensada: totalQt,
            valor_nosso_cm: valor,
            nota_classe:
              'classe depende do percentil sobre valorTotal no periodo (A<=80%,B<=95%,C resto)',
          }),
        )
      }
    } catch (eCurva) {
      gravarFatias(
        app,
        'DIAG3711_CURVA',
        'diag3711_curva_erro',
        JSON.stringify({ erro: String(eCurva) }),
      )
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
