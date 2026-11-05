/**
 * ============================================================================
 * SPINCARE PRODUTOS & DISPENSAÇÕES — HELP VIDA ATENÇÃO DOMICILIAR
 * ============================================================================
 * Sincronização (CDC) do catálogo de produtos e das dispensações do SpinCare,
 * replicadas no banco local para a página de Produtos e o relatório de Curva
 * ABC. Mesmo padrão do spincare_middleware.js: a lógica vive INLINE dentro de
 * cada callback (cron e rotas), porque a JSVM do PocketBase executa callbacks
 * em VMs isoladas — declarações de topo não são visíveis em tempo de execução.
 *
 * ENDPOINTS REAIS DA SPICARE (confirmados por sondagem na rodada anterior):
 * - Produtos:      GET /integration-engine/get/products?token=...&ds=&insurance_id=0
 *                  &page_number=N&page_size=400 (página além do fim responde 404)
 * - Dispensações:  GET /integration-engine/get/dispensations?token=...&initial_dt=...
 *                  &final_dt=...&page_number=N&page_size=500 (~400+/mês)
 * - Autenticação:  GET /token/v1?login=...&password=...
 *
 * NOTA sobre a Curva ABC: os itens de dispensação não trazem valor monetário.
 * O valor do movimento = quantidade dispensada × preço do produto (coleção
 * produtos_spincare), cuja ÚLTIMA COMPRA vem do campo last_buy_value do
 * payload da API (fallback: imported_prices). Convênio da dispensação vem dos
 * campos health_insurance_id / health_insurance_name.
 * ============================================================================
 */

// ============================================================================
// CRON DIÁRIO DE PRODUTOS/DISPENSAÇÕES (03:00 — mesmo horário do cron de prescrições)
// ============================================================================
cronAdd('spincare_products_daily_sync', '0 3 * * *', () => {
  console.log(
    '[Cron Produtos] Iniciando sincronização diária de produtos/dispensações SpinCare (03:00)...',
  )
  const startTime = new Date().getTime()
  try {
    const app = typeof $app !== 'undefined' ? $app : null
    if (!app) {
      console.error('[Cron Produtos] $app não está disponível.')
      return
    }

    // Normaliza valores monetários vindos como número ou como texto
    // ("1.234,56" / "1234.56") — definido DENTRO do callback (escopo da JSVM).
    const parseMoney = (v) => {
      if (typeof v === 'number') return v
      let s = String(v || '')
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    const BASE_FALLBACK = 'https://integration.spincare.com.br/spincare_integration'

    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!records || records.length === 0) {
      console.error('[Cron Produtos] Configuração do SpinCare não encontrada.')
      return
    }
    const cfgRec = records[0]
    const baseUrl = (cfgRec.getString('base_url') || BASE_FALLBACK).trim().replace(/\/+$/, '')
    const login = (cfgRec.getString('api_login') || '').trim()
    const password = (cfgRec.getString('api_password') || '').trim()
    let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
    let apiToken = rawStoredToken.startsWith('Bearer ')
      ? rawStoredToken.substring(7).trim()
      : rawStoredToken

    const fetchFreshToken = () => {
      if (!login || !password) return ''
      try {
        const tokenUrl =
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password)
        const resToken = $http.send({
          url: tokenUrl,
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
        console.error('[Cron Produtos] Exceção ao obter token:', authErr)
      }
      return ''
    }
    if (!apiToken) apiToken = fetchFreshToken()

    const requestPage = (path, params, token) => {
      let url = baseUrl + path + '?token=' + encodeURIComponent(token)
      for (const key in params) url += '&' + key + '=' + encodeURIComponent(params[key])
      try {
        const resp = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-SpinCare-Products/1.0' },
          timeout: 30,
        })
        return { statusCode: resp.statusCode, resp: resp }
      } catch (netErr) {
        return { statusCode: 0, resp: null }
      }
    }

    const parseItems = (resp) => {
      let rawData = []
      try {
        rawData = resp.json || JSON.parse(resp.raw || '[]')
      } catch (_) {
        rawData = []
      }
      if (Array.isArray(rawData)) return rawData
      if (rawData && Array.isArray(rawData.items)) return rawData.items
      if (rawData && Array.isArray(rawData.data)) return rawData.data
      if (rawData && typeof rawData === 'object') return [rawData]
      return []
    }

    // ---- Trava anti-simultânea (60s) ----
    const lastAudit = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && acao = "SPINCARE_PRODUCT_SYNC_IN_PROGRESS"',
      '-created',
      1,
      0,
    )
    if (lastAudit && lastAudit.length > 0) {
      const lastCreated = new Date(lastAudit[0].getString('created')).getTime()
      if (startTime - lastCreated < 60000) {
        console.log('[Cron Produtos] Sincronização já em andamento — pulando execução.')
        return
      }
    }
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const inProgressRec = new Record(auditCol)
      inProgressRec.set('colecao', 'produtos_spincare')
      inProgressRec.set('registro_id', 'sync_cdc_products')
      inProgressRec.set('acao', 'SPINCARE_PRODUCT_SYNC_IN_PROGRESS')
      inProgressRec.set('usuario_nome', 'Cron Scheduler')
      inProgressRec.set('usuario_email', 'cron@helpvida.internal')
      inProgressRec.set('usuario_role', 'sistema')
      inProgressRec.set('status_novo', 'in_progress')
      app.save(inProgressRec)
    } catch (_) {}

    // ---- Sync de produtos (catálogo completo, upsert por spincare_id) ----
    const resProd = {
      totalFetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
      pagesProcessed: 0,
      syncedAt: new Date().toISOString(),
    }
    let prodCol = null
    try {
      prodCol = app.findCollectionByNameOrId('produtos_spincare')
    } catch (_) {}
    if (prodCol) {
      const nowProd = new Date().toISOString()
      const pageSizeProd = 400
      const maxPagesProd = 50 // cap de segurança: 50 × 400 = até 20.000 produtos
      for (let p = 1; p <= maxPagesProd; p++) {
        let req = requestPage(
          '/integration-engine/get/products',
          {
            ds: '',
            insurance_id: '0',
            page_number: String(p),
            page_size: String(pageSizeProd),
          },
          apiToken,
        )
        if (req.statusCode === 401) {
          const fresh = fetchFreshToken()
          if (fresh)
            req = requestPage(
              '/integration-engine/get/products',
              {
                ds: '',
                insurance_id: '0',
                page_number: String(p),
                page_size: String(pageSizeProd),
              },
              fresh,
            )
        }
        // 404 na página além do fim: parada normal do catálogo
        if (req.statusCode === 404) break
        if (req.statusCode < 200 || req.statusCode >= 300) {
          console.error('[Cron Produtos] Falha HTTP ao buscar página ' + p + ': ' + req.statusCode)
          break
        }
        const items = parseItems(req.resp)
        if (!items || items.length === 0) break
        resProd.pagesProcessed++
        resProd.totalFetched += items.length
        for (let i = 0; i < items.length; i++) {
          const raw = items[i]
          const spincareId = parseInt(String(raw.id || '').trim(), 10)
          const description = String(raw.description || raw.ds || '').trim()
          if (!spincareId || isNaN(spincareId) || !description) {
            resProd.ignored++
            continue
          }
          let syncRec = null
          try {
            syncRec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
              id: spincareId,
            })
          } catch (_) {
            syncRec = null
          }
          const isNew = !syncRec
          if (isNew) {
            syncRec = new Record(prodCol)
            syncRec.set('spincare_id', spincareId)
          }
          syncRec.set('code', String(raw.code || '').trim())
          syncRec.set('description', description)
          syncRec.set('group_description', String(raw.group_description || '').trim())
          syncRec.set('type_description', String(raw.type_description || '').trim())
          syncRec.set('active', raw.active !== false && raw.active !== 'false')
          let price = 0
          if (typeof raw.price === 'number') price = raw.price
          else if (typeof raw.price === 'string') {
            price = parseFloat(raw.price.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
          }
          syncRec.set('price', price)

          // Última compra do produto:
          // 1. Campo explícito last_buy_value (ou aninhado em last_buy / last_buy_info).
          // 2. Fallback na API SpinCare real: imported_prices (itens com pfb_value / pmc_value / price).
          //    pfb_value = Preço Fábrica (custo base da tabela Brasíndice/Simpro/Própria).
          let ultimaCompra = 0
          if (raw.last_buy_value !== undefined && raw.last_buy_value !== null) {
            ultimaCompra = parseMoney(raw.last_buy_value)
          } else {
            const lb = raw.last_buy || raw.last_buy_info || null
            if (lb && typeof lb === 'object') {
              ultimaCompra = parseMoney(
                lb.value !== undefined
                  ? lb.value
                  : lb.last_buy_value !== undefined
                    ? lb.last_buy_value
                    : lb.price,
              )
            }
          }
          if (!(ultimaCompra > 0)) {
            const importedPrices = raw.imported_prices
            if (Array.isArray(importedPrices) && importedPrices.length > 0) {
              for (let k = 0; k < importedPrices.length; k++) {
                const ip = importedPrices[k] || {}
                // Prioriza pfb_value (preço fábrica/custo), depois price, depois pmc_value
                const val = parseMoney(
                  ip.pfb_value !== undefined && ip.pfb_value !== null
                    ? ip.pfb_value
                    : ip.price !== undefined && ip.price !== null
                      ? ip.price
                      : ip.pmc_value,
                )
                if (val > 0) {
                  ultimaCompra = val
                  break
                }
              }
            }
          }
          // Custo médio: média aritmética dos valores de preço disponíveis do produto
          // (imported_prices: pfb_value, price, pmc_value + preço de catálogo).
          let precosDisponiveis = []
          if (ultimaCompra > 0) precosDisponiveis.push(ultimaCompra)
          const importedArr = Array.isArray(raw.imported_prices) ? raw.imported_prices : []
          for (let k = 0; k < importedArr.length; k++) {
            const ip = importedArr[k] || {}
            const pfb = parseMoney(ip.pfb_value)
            const pr = parseMoney(ip.price)
            const pmc = parseMoney(ip.pmc_value)
            if (pfb > 0 && !precosDisponiveis.includes(pfb)) precosDisponiveis.push(pfb)
            if (pr > 0 && !precosDisponiveis.includes(pr)) precosDisponiveis.push(pr)
            if (pmc > 0 && !precosDisponiveis.includes(pmc)) precosDisponiveis.push(pmc)
          }
          if (price > 0 && !precosDisponiveis.includes(price)) precosDisponiveis.push(price)

          let custoMedio = 0
          if (precosDisponiveis.length > 0) {
            const somaPrecos = precosDisponiveis.reduce((acc, v) => acc + v, 0)
            custoMedio = Number((somaPrecos / precosDisponiveis.length).toFixed(4))
          } else if (price > 0) {
            custoMedio = price
          }

          syncRec.set('ultima_compra_price', ultimaCompra)
          syncRec.set('custo_medio_price', custoMedio)
          syncRec.set('measure_unit', String(raw.measure_unit || '').trim())
          syncRec.set(
            'prescription_measure_unit',
            String(raw.prescription_measure_unit || '').trim(),
          )
          syncRec.set(
            'prescription_conversion_qt',
            typeof raw.prescription_conversion_qt === 'number' ? raw.prescription_conversion_qt : 0,
          )
          syncRec.set('barcode', String(raw.barcode || '').trim())
          syncRec.set(
            'company_id',
            typeof raw.company_id === 'number'
              ? raw.company_id
              : parseInt(String(raw.company_id || '0'), 10) || 0,
          )
          syncRec.set('payload', raw)
          syncRec.set('synced_at', nowProd)
          try {
            app.save(syncRec)
            if (isNew) resProd.created++
            else resProd.updated++
          } catch (_) {
            resProd.ignored++
          }
        }
        if (items.length < pageSizeProd) break
      }
    } else {
      console.error('[Cron Produtos] Coleção produtos_spincare não encontrada.')
    }

    // ---- Sync de dispensações (janelas mensais 2026-01-01 até hoje) ----
    const resDisp = {
      totalFetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
      windowsProcessed: 0,
      syncedAt: new Date().toISOString(),
    }
    const budgetConvenioCache = new Map()
    let dispCol = null
    try {
      dispCol = app.findCollectionByNameOrId('dispensacoes_spincare')
    } catch (_) {}
    if (dispCol) {
      const nowDisp = new Date().toISOString()
      const pageSizeDisp = 500
      const maxPagesDisp = 40 // cap de segurança por janela mensal
      const toIsoYmd = (val) => {
        if (!val || val === '—') return ''
        const s = String(val).trim().split(' ')[0]
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3)
            return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
        } else if (s.includes('-')) {
          const parts = s.split('-')
          if (parts.length === 3) {
            if (parts[0].length === 4)
              return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
            if (parts[2].length === 4)
              return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
          }
        }
        return ''
      }
      const todayIso = new Date().toISOString().slice(0, 10)
      let year = 2026
      let month = 1
      while (true) {
        const windowStart = year + '-' + String(month).padStart(2, '0') + '-01'
        if (windowStart > todayIso) break
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
        let windowEnd =
          year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
        if (windowEnd > todayIso) windowEnd = todayIso
        resDisp.windowsProcessed++
        for (let p = 1; p <= maxPagesDisp; p++) {
          let req = requestPage(
            '/integration-engine/get/dispensations',
            {
              initial_dt: windowStart,
              final_dt: windowEnd,
              page_number: String(p),
              page_size: String(pageSizeDisp),
            },
            apiToken,
          )
          if (req.statusCode === 401) {
            const fresh = fetchFreshToken()
            if (fresh)
              req = requestPage(
                '/integration-engine/get/dispensations',
                {
                  initial_dt: windowStart,
                  final_dt: windowEnd,
                  page_number: String(p),
                  page_size: String(pageSizeDisp),
                },
                fresh,
              )
          }
          // 404 marca fim da paginação nesta janela
          if (req.statusCode === 404) break
          if (req.statusCode < 200 || req.statusCode >= 300) {
            console.error(
              '[Cron Produtos] Falha HTTP dispensações ' +
                windowStart +
                ' pág. ' +
                p +
                ': ' +
                req.statusCode,
            )
            break
          }
          const items = parseItems(req.resp)
          if (!items || items.length === 0) break
          resDisp.totalFetched += items.length
          for (let i = 0; i < items.length; i++) {
            const raw = items[i]
            const spincareId = parseInt(String(raw.id || raw.record_id || '').trim(), 10)
            if (!spincareId || isNaN(spincareId)) {
              resDisp.ignored++
              continue
            }
            let syncRec = null
            try {
              syncRec = app.findFirstRecordByFilter(
                'dispensacoes_spincare',
                'spincare_id = {:id}',
                { id: spincareId },
              )
            } catch (_) {
              syncRec = null
            }
            const isNew = !syncRec
            if (isNew) {
              syncRec = new Record(dispCol)
              syncRec.set('spincare_id', spincareId)
            }
            const rawItens = raw.items || raw.itens || raw.products || []
            let itensList = []
            let totalEnviadoCasa = 0
            if (Array.isArray(rawItens)) {
              for (let k = 0; k < rawItens.length; k++) {
                const it = rawItens[k]
                const sq = Number(it.sent_qt || 0)
                totalEnviadoCasa += sq
                itensList.push({
                  record_id: String(it.record_id || ''),
                  product_id: it.product_id !== undefined ? Number(it.product_id) || 0 : 0,
                  product_ds: String(it.product_ds || it.description || '').trim(),
                  qt: Number(it.qt || 0),
                  sent_qt: sq,
                  returned_qt: Number(it.returned_qt || 0),
                  status: String(it.status || '').trim(),
                  consumption_qt: Number(it.consumption_qt || 0),
                })
              }
            }
            syncRec.set('budget_id', Number(raw.budget_id || 0) || 0)
            syncRec.set('prescription_id', Number(raw.prescription_id || 0) || 0)
            syncRec.set('patient_id', Number(raw.patient_id || 0) || 0)
            syncRec.set('patient_name', String(raw.patient_name || raw.nm_paciente || '').trim())
            syncRec.set('expected_deliver_dt', toIsoYmd(raw.expected_deliver_dt || raw.initial_dt))
            syncRec.set('returned_dt', toIsoYmd(raw.returned_dt))
            syncRec.set('stock_location', String(raw.stock_location || '').trim())
            syncRec.set('send_reason', String(raw.send_reason || '').trim())
            syncRec.set('status', String(raw.status || '').trim())
            syncRec.set('status_id', Number(raw.status_id || 0) || 0)
            syncRec.set('priority', String(raw.priority || '').trim())
            // Convênio da dispensação (para o filtro da Curva ABC).
            // O endpoint get/dispensations não traz health_insurance diretamente.
            // Derivamos de:
            // 1. Campo direto no payload da dispensação (se existir em alguma versão da API).
            // 2. Vínculo budget_id com a coleção orcamentos_sync (que já possui convenio e payload.insurance_id/insurance_name).
            // 3. Fallback: chamada ao vivo à API do SpinCare get/budgets?id={budget_id} com cache em memória.
            let resolvedInsuranceId =
              Number(raw.health_insurance_id || raw.health_insurance || raw.insurance_id || 0) || 0
            let resolvedInsuranceName = String(
              raw.health_insurance_name || raw.insurance_name || raw.insurance_ds || '',
            ).trim()

            const bId = Number(raw.budget_id || 0) || 0
            if (!resolvedInsuranceName && bId > 0) {
              if (budgetConvenioCache.has(bId)) {
                const cached = budgetConvenioCache.get(bId)
                resolvedInsuranceId = cached.id
                resolvedInsuranceName = cached.name
              } else {
                let foundOrc = null
                try {
                  const orcRecs = app.findRecordsByFilter(
                    'orcamentos_sync',
                    'spincare_id = "' + bId + '"',
                    '',
                    1,
                    0,
                  )
                  if (orcRecs && orcRecs.length > 0) foundOrc = orcRecs[0]
                } catch (_) {}

                if (foundOrc) {
                  const nome = foundOrc.getString('convenio').trim()
                  let insId = 0
                  try {
                    const py = JSON.parse(foundOrc.getString('payload') || '{}')
                    insId = Number(py.insurance_id || py.health_insurance_id || 0) || 0
                  } catch (_) {}
                  resolvedInsuranceId = insId
                  resolvedInsuranceName = nome
                  budgetConvenioCache.set(bId, { id: insId, name: nome })
                } else if (apiToken) {
                  // Consulta ao vivo para orçamentos que ainda não estão em orcamentos_sync
                  try {
                    const bUrl =
                      baseUrl +
                      '/integration-engine/get/budgets?token=' +
                      encodeURIComponent(apiToken) +
                      '&id=' +
                      bId +
                      '&page_number=1&page_size=1'
                    const bResp = $http.send({ url: bUrl, method: 'GET', timeout: 5 })
                    if (bResp && bResp.statusCode === 200) {
                      const bData = bResp.json || JSON.parse(bResp.raw || 'null')
                      if (bData && typeof bData === 'object') {
                        const insName = String(
                          bData.insurance_name || bData.health_insurance_name || '',
                        ).trim()
                        const insId =
                          Number(bData.insurance_id || bData.health_insurance_id || 0) || 0
                        resolvedInsuranceId = insId
                        resolvedInsuranceName = insName
                        budgetConvenioCache.set(bId, { id: insId, name: insName })
                      }
                    }
                  } catch (_) {
                    budgetConvenioCache.set(bId, { id: 0, name: '' })
                  }
                }
              }
            }

            syncRec.set('insurance_id', resolvedInsuranceId)
            syncRec.set('insurance_name', resolvedInsuranceName)
            // Fim do bloco de convênio
            syncRec.set('total_enviado_casa', totalEnviadoCasa)
            syncRec.set('itens', itensList)
            syncRec.set('payload', raw)
            syncRec.set('synced_at', nowDisp)
            try {
              app.save(syncRec)
              if (isNew) resDisp.created++
              else resDisp.updated++
            } catch (_) {
              resDisp.ignored++
            }
          }
          if (items.length < pageSizeDisp) break
        }
        if (windowStart >= todayIso) break
        if (month === 12) {
          year++
          month = 1
        } else {
          month++
        }
      }
    } else {
      console.error('[Cron Produtos] Coleção dispensacoes_spincare não encontrada.')
    }

    const durationMs = new Date().getTime() - startTime
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'sync_cdc_products')
      auditRecord.set('acao', 'SPINCARE_PRODUCT_SYNC_CRON')
      auditRecord.set('usuario_nome', 'Cron Scheduler')
      auditRecord.set('usuario_email', 'cron@helpvida.internal')
      auditRecord.set('usuario_role', 'sistema')
      auditRecord.set('status_novo', 'sucesso')
      auditRecord.set(
        'detalhes',
        'Replicação CDC de produtos/dispensações concluída (cron 03:00): produtos buscados=' +
          resProd.totalFetched +
          ', criados=' +
          resProd.created +
          ', atualizados=' +
          resProd.updated +
          '; dispensações buscadas=' +
          resDisp.totalFetched +
          ', criadas=' +
          resDisp.created +
          ', atualizadas=' +
          resDisp.updated +
          ', duração=' +
          Math.round(durationMs / 1000) +
          's',
      )
      app.save(auditRecord)
    } catch (_) {}

    console.log(
      '[Cron Produtos] Concluído: produtos criados=' +
        resProd.created +
        ', atualizados=' +
        resProd.updated +
        '; dispensações criadas=' +
        resDisp.created +
        ', atualizadas=' +
        resDisp.updated +
        ', duração=' +
        Math.round(durationMs / 1000) +
        's',
    )
  } catch (err) {
    console.error('[Cron Produtos] Erro na sincronização diária:', err)
  }
})

// ============================================================================
// ROTA: POST /backend/v1/spincare/products/sync (gatilho manual)
// ============================================================================
routerAdd('POST', '/backend/v1/spincare/products/sync', (e) => {
  try {
    const app = e.app
    const authUser = e.auth
    if (authUser) {
      const role = authUser.getString('role') || 'comum'
      if (role === 'medico_visitador') {
        return e.forbiddenError(
          'Acesso restrito: Médicos Visitadores não possuem autorização para disparar sincronização.',
        )
      }
    }

    // Normaliza valores monetários vindos como número ou como texto
    // ("1.234,56" / "1234.56") — definido DENTRO do callback (escopo da JSVM).
    const parseMoney = (v) => {
      if (typeof v === 'number') return v
      let s = String(v || '')
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    const BASE_FALLBACK = 'https://integration.spincare.com.br/spincare_integration'
    const startTime = new Date().getTime()

    const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!records || records.length === 0) {
      return e.json(503, {
        success: false,
        message: 'Configuração do SpinCare não encontrada.',
      })
    }
    const cfgRec = records[0]
    const baseUrl = (cfgRec.getString('base_url') || BASE_FALLBACK).trim().replace(/\/+$/, '')
    const login = (cfgRec.getString('api_login') || '').trim()
    const password = (cfgRec.getString('api_password') || '').trim()
    let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
    let apiToken = rawStoredToken.startsWith('Bearer ')
      ? rawStoredToken.substring(7).trim()
      : rawStoredToken

    const fetchFreshToken = () => {
      if (!login || !password) return ''
      try {
        const tokenUrl =
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password)
        const resToken = $http.send({
          url: tokenUrl,
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
      } catch (_) {}
      return ''
    }
    if (!apiToken) apiToken = fetchFreshToken()

    const requestPage = (path, params, token) => {
      let url = baseUrl + path + '?token=' + encodeURIComponent(token)
      for (const key in params) url += '&' + key + '=' + encodeURIComponent(params[key])
      try {
        const resp = $http.send({
          url: url,
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'HelpVida-SpinCare-Products/1.0' },
          timeout: 30,
        })
        return { statusCode: resp.statusCode, resp: resp }
      } catch (netErr) {
        return { statusCode: 0, resp: null }
      }
    }

    const parseItems = (resp) => {
      let rawData = []
      try {
        rawData = resp.json || JSON.parse(resp.raw || '[]')
      } catch (_) {
        rawData = []
      }
      if (Array.isArray(rawData)) return rawData
      if (rawData && Array.isArray(rawData.items)) return rawData.items
      if (rawData && Array.isArray(rawData.data)) return rawData.data
      if (rawData && typeof rawData === 'object') return [rawData]
      return []
    }

    // Trava anti-simultânea (60s), mesmo padrão das rotas de orçamentos
    const lastAudit = app.findRecordsByFilter(
      'audit_logs',
      'colecao = "produtos_spincare" && acao = "SPINCARE_PRODUCT_SYNC_IN_PROGRESS"',
      '-created',
      1,
      0,
    )
    if (lastAudit && lastAudit.length > 0) {
      const lastCreated = new Date(lastAudit[0].getString('created')).getTime()
      if (startTime - lastCreated < 60000) {
        return e.json(409, {
          success: false,
          alreadyRunning: true,
          message: 'Uma sincronização de produtos já está em andamento. Aguarde a conclusão.',
        })
      }
    }

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const inProgressRec = new Record(auditCol)
      inProgressRec.set('colecao', 'produtos_spincare')
      inProgressRec.set('registro_id', 'sync_cdc_products')
      inProgressRec.set('acao', 'SPINCARE_PRODUCT_SYNC_IN_PROGRESS')
      inProgressRec.set('usuario', authUser ? authUser.id : '')
      inProgressRec.set('usuario_nome', authUser ? authUser.getString('name') || '' : 'sistema')
      inProgressRec.set('usuario_email', authUser ? authUser.getString('email') || '' : '')
      inProgressRec.set('usuario_role', authUser ? authUser.getString('role') || 'admin' : 'admin')
      inProgressRec.set('status_novo', 'in_progress')
      app.save(inProgressRec)
    } catch (_) {}

    // ---- Sync de produtos (catálogo completo, upsert por spincare_id) ----
    const resProd = {
      totalFetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
      pagesProcessed: 0,
      syncedAt: new Date().toISOString(),
    }
    let prodCol = null
    try {
      prodCol = app.findCollectionByNameOrId('produtos_spincare')
    } catch (_) {}
    if (prodCol) {
      const nowProd = new Date().toISOString()
      const pageSizeProd = 400
      const maxPagesProd = 50
      for (let p = 1; p <= maxPagesProd; p++) {
        let req = requestPage(
          '/integration-engine/get/products',
          {
            ds: '',
            insurance_id: '0',
            page_number: String(p),
            page_size: String(pageSizeProd),
          },
          apiToken,
        )
        if (req.statusCode === 401) {
          const fresh = fetchFreshToken()
          if (fresh)
            req = requestPage(
              '/integration-engine/get/products',
              {
                ds: '',
                insurance_id: '0',
                page_number: String(p),
                page_size: String(pageSizeProd),
              },
              fresh,
            )
        }
        if (req.statusCode === 404) break
        if (req.statusCode < 200 || req.statusCode >= 300) {
          console.error('[Products Sync] Falha HTTP ao buscar página ' + p + ': ' + req.statusCode)
          break
        }
        const items = parseItems(req.resp)
        if (!items || items.length === 0) break
        resProd.pagesProcessed++
        resProd.totalFetched += items.length
        for (let i = 0; i < items.length; i++) {
          const raw = items[i]
          const spincareId = parseInt(String(raw.id || '').trim(), 10)
          const description = String(raw.description || raw.ds || '').trim()
          if (!spincareId || isNaN(spincareId) || !description) {
            resProd.ignored++
            continue
          }
          let syncRec = null
          try {
            syncRec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
              id: spincareId,
            })
          } catch (_) {
            syncRec = null
          }
          const isNew = !syncRec
          if (isNew) {
            syncRec = new Record(prodCol)
            syncRec.set('spincare_id', spincareId)
          }
          syncRec.set('code', String(raw.code || '').trim())
          syncRec.set('description', description)
          syncRec.set('group_description', String(raw.group_description || '').trim())
          syncRec.set('type_description', String(raw.type_description || '').trim())
          syncRec.set('active', raw.active !== false && raw.active !== 'false')
          let price = 0
          if (typeof raw.price === 'number') price = raw.price
          else if (typeof raw.price === 'string') {
            price = parseFloat(raw.price.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
          }
          syncRec.set('price', price)

          // Última compra do produto:
          // 1. Campo explícito last_buy_value (ou aninhado em last_buy / last_buy_info).
          // 2. Fallback na API SpinCare real: imported_prices (itens com pfb_value / pmc_value / price).
          //    pfb_value = Preço Fábrica (custo base da tabela Brasíndice/Simpro/Própria).
          let ultimaCompra = 0
          if (raw.last_buy_value !== undefined && raw.last_buy_value !== null) {
            ultimaCompra = parseMoney(raw.last_buy_value)
          } else {
            const lb = raw.last_buy || raw.last_buy_info || null
            if (lb && typeof lb === 'object') {
              ultimaCompra = parseMoney(
                lb.value !== undefined
                  ? lb.value
                  : lb.last_buy_value !== undefined
                    ? lb.last_buy_value
                    : lb.price,
              )
            }
          }
          if (!(ultimaCompra > 0)) {
            const importedPrices = raw.imported_prices
            if (Array.isArray(importedPrices) && importedPrices.length > 0) {
              for (let k = 0; k < importedPrices.length; k++) {
                const ip = importedPrices[k] || {}
                // Prioriza pfb_value (preço fábrica/custo), depois price, depois pmc_value
                const val = parseMoney(
                  ip.pfb_value !== undefined && ip.pfb_value !== null
                    ? ip.pfb_value
                    : ip.price !== undefined && ip.price !== null
                      ? ip.price
                      : ip.pmc_value,
                )
                if (val > 0) {
                  ultimaCompra = val
                  break
                }
              }
            }
          }
          // Custo médio: média aritmética dos valores de preço disponíveis do produto
          let precosDisponiveis = []
          if (ultimaCompra > 0) precosDisponiveis.push(ultimaCompra)
          const importedArr = Array.isArray(raw.imported_prices) ? raw.imported_prices : []
          for (let k = 0; k < importedArr.length; k++) {
            const ip = importedArr[k] || {}
            const pfb = parseMoney(ip.pfb_value)
            const pr = parseMoney(ip.price)
            const pmc = parseMoney(ip.pmc_value)
            if (pfb > 0 && !precosDisponiveis.includes(pfb)) precosDisponiveis.push(pfb)
            if (pr > 0 && !precosDisponiveis.includes(pr)) precosDisponiveis.push(pr)
            if (pmc > 0 && !precosDisponiveis.includes(pmc)) precosDisponiveis.push(pmc)
          }
          if (price > 0 && !precosDisponiveis.includes(price)) precosDisponiveis.push(price)

          let custoMedio = 0
          if (precosDisponiveis.length > 0) {
            const somaPrecos = precosDisponiveis.reduce((acc, v) => acc + v, 0)
            custoMedio = Number((somaPrecos / precosDisponiveis.length).toFixed(4))
          } else if (price > 0) {
            custoMedio = price
          }

          syncRec.set('ultima_compra_price', ultimaCompra)
          syncRec.set('custo_medio_price', custoMedio)
          syncRec.set('measure_unit', String(raw.measure_unit || '').trim())
          syncRec.set(
            'prescription_measure_unit',
            String(raw.prescription_measure_unit || '').trim(),
          )
          syncRec.set(
            'prescription_conversion_qt',
            typeof raw.prescription_conversion_qt === 'number' ? raw.prescription_conversion_qt : 0,
          )
          syncRec.set('barcode', String(raw.barcode || '').trim())
          syncRec.set(
            'company_id',
            typeof raw.company_id === 'number'
              ? raw.company_id
              : parseInt(String(raw.company_id || '0'), 10) || 0,
          )
          syncRec.set('payload', raw)
          syncRec.set('synced_at', nowProd)
          try {
            app.save(syncRec)
            if (isNew) resProd.created++
            else resProd.updated++
          } catch (_) {
            resProd.ignored++
          }
        }
        if (items.length < pageSizeProd) break
      }
    } else {
      console.error('[Products Sync] Coleção produtos_spincare não encontrada.')
    }

    // ---- Sync de dispensações (janelas mensais 2026-01-01 até hoje) ----
    const resDisp = {
      totalFetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
      windowsProcessed: 0,
      syncedAt: new Date().toISOString(),
    }
    const budgetConvenioCache = new Map()
    let dispCol = null
    try {
      dispCol = app.findCollectionByNameOrId('dispensacoes_spincare')
    } catch (_) {}
    if (dispCol) {
      const nowDisp = new Date().toISOString()
      const pageSizeDisp = 500
      const maxPagesDisp = 40
      const toIsoYmd = (val) => {
        if (!val || val === '—') return ''
        const s = String(val).trim().split(' ')[0]
        if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3)
            return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
        } else if (s.includes('-')) {
          const parts = s.split('-')
          if (parts.length === 3) {
            if (parts[0].length === 4)
              return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0')
            if (parts[2].length === 4)
              return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0')
          }
        }
        return ''
      }
      const todayIso = new Date().toISOString().slice(0, 10)
      let year = 2026
      let month = 1
      while (true) {
        const windowStart = year + '-' + String(month).padStart(2, '0') + '-01'
        if (windowStart > todayIso) break
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
        let windowEnd =
          year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
        if (windowEnd > todayIso) windowEnd = todayIso
        resDisp.windowsProcessed++
        for (let p = 1; p <= maxPagesDisp; p++) {
          let req = requestPage(
            '/integration-engine/get/dispensations',
            {
              initial_dt: windowStart,
              final_dt: windowEnd,
              page_number: String(p),
              page_size: String(pageSizeDisp),
            },
            apiToken,
          )
          if (req.statusCode === 401) {
            const fresh = fetchFreshToken()
            if (fresh)
              req = requestPage(
                '/integration-engine/get/dispensations',
                {
                  initial_dt: windowStart,
                  final_dt: windowEnd,
                  page_number: String(p),
                  page_size: String(pageSizeDisp),
                },
                fresh,
              )
          }
          if (req.statusCode === 404) break
          if (req.statusCode < 200 || req.statusCode >= 300) {
            console.error(
              '[Products Sync] Falha HTTP dispensações ' +
                windowStart +
                ' pág. ' +
                p +
                ': ' +
                req.statusCode,
            )
            break
          }
          const items = parseItems(req.resp)
          if (!items || items.length === 0) break
          resDisp.totalFetched += items.length
          for (let i = 0; i < items.length; i++) {
            const raw = items[i]
            const spincareId = parseInt(String(raw.id || raw.record_id || '').trim(), 10)
            if (!spincareId || isNaN(spincareId)) {
              resDisp.ignored++
              continue
            }
            let syncRec = null
            try {
              syncRec = app.findFirstRecordByFilter(
                'dispensacoes_spincare',
                'spincare_id = {:id}',
                { id: spincareId },
              )
            } catch (_) {
              syncRec = null
            }
            const isNew = !syncRec
            if (isNew) {
              syncRec = new Record(dispCol)
              syncRec.set('spincare_id', spincareId)
            }
            const rawItens = raw.items || raw.itens || raw.products || []
            let itensList = []
            let totalEnviadoCasa = 0
            if (Array.isArray(rawItens)) {
              for (let k = 0; k < rawItens.length; k++) {
                const it = rawItens[k]
                const sq = Number(it.sent_qt || 0)
                totalEnviadoCasa += sq
                itensList.push({
                  record_id: String(it.record_id || ''),
                  product_id: it.product_id !== undefined ? Number(it.product_id) || 0 : 0,
                  product_ds: String(it.product_ds || it.description || '').trim(),
                  qt: Number(it.qt || 0),
                  sent_qt: sq,
                  returned_qt: Number(it.returned_qt || 0),
                  status: String(it.status || '').trim(),
                  consumption_qt: Number(it.consumption_qt || 0),
                })
              }
            }
            syncRec.set('budget_id', Number(raw.budget_id || 0) || 0)
            syncRec.set('prescription_id', Number(raw.prescription_id || 0) || 0)
            syncRec.set('patient_id', Number(raw.patient_id || 0) || 0)
            syncRec.set('patient_name', String(raw.patient_name || raw.nm_paciente || '').trim())
            syncRec.set('expected_deliver_dt', toIsoYmd(raw.expected_deliver_dt || raw.initial_dt))
            syncRec.set('returned_dt', toIsoYmd(raw.returned_dt))
            syncRec.set('stock_location', String(raw.stock_location || '').trim())
            syncRec.set('send_reason', String(raw.send_reason || '').trim())
            syncRec.set('status', String(raw.status || '').trim())
            syncRec.set('status_id', Number(raw.status_id || 0) || 0)
            syncRec.set('priority', String(raw.priority || '').trim())
            // Convênio da dispensação (para o filtro da Curva ABC).
            // O endpoint get/dispensations não traz health_insurance diretamente.
            // Derivamos de:
            // 1. Campo direto no payload da dispensação (se existir em alguma versão da API).
            // 2. Vínculo budget_id com a coleção orcamentos_sync (que já possui convenio e payload.insurance_id/insurance_name).
            // 3. Fallback: chamada ao vivo à API do SpinCare get/budgets?id={budget_id} com cache em memória.
            let resolvedInsuranceId =
              Number(raw.health_insurance_id || raw.health_insurance || raw.insurance_id || 0) || 0
            let resolvedInsuranceName = String(
              raw.health_insurance_name || raw.insurance_name || raw.insurance_ds || '',
            ).trim()

            const bId = Number(raw.budget_id || 0) || 0
            if (!resolvedInsuranceName && bId > 0) {
              if (budgetConvenioCache.has(bId)) {
                const cached = budgetConvenioCache.get(bId)
                resolvedInsuranceId = cached.id
                resolvedInsuranceName = cached.name
              } else {
                let foundOrc = null
                try {
                  const orcRecs = app.findRecordsByFilter(
                    'orcamentos_sync',
                    'spincare_id = "' + bId + '"',
                    '',
                    1,
                    0,
                  )
                  if (orcRecs && orcRecs.length > 0) foundOrc = orcRecs[0]
                } catch (_) {}

                if (foundOrc) {
                  const nome = foundOrc.getString('convenio').trim()
                  let insId = 0
                  try {
                    const py = JSON.parse(foundOrc.getString('payload') || '{}')
                    insId = Number(py.insurance_id || py.health_insurance_id || 0) || 0
                  } catch (_) {}
                  resolvedInsuranceId = insId
                  resolvedInsuranceName = nome
                  budgetConvenioCache.set(bId, { id: insId, name: nome })
                } else if (apiToken) {
                  // Consulta ao vivo para orçamentos que ainda não estão em orcamentos_sync
                  try {
                    const bUrl =
                      baseUrl +
                      '/integration-engine/get/budgets?token=' +
                      encodeURIComponent(apiToken) +
                      '&id=' +
                      bId +
                      '&page_number=1&page_size=1'
                    const bResp = $http.send({ url: bUrl, method: 'GET', timeout: 5 })
                    if (bResp && bResp.statusCode === 200) {
                      const bData = bResp.json || JSON.parse(bResp.raw || 'null')
                      if (bData && typeof bData === 'object') {
                        const insName = String(
                          bData.insurance_name || bData.health_insurance_name || '',
                        ).trim()
                        const insId =
                          Number(bData.insurance_id || bData.health_insurance_id || 0) || 0
                        resolvedInsuranceId = insId
                        resolvedInsuranceName = insName
                        budgetConvenioCache.set(bId, { id: insId, name: insName })
                      }
                    }
                  } catch (_) {
                    budgetConvenioCache.set(bId, { id: 0, name: '' })
                  }
                }
              }
            }

            syncRec.set('insurance_id', resolvedInsuranceId)
            syncRec.set('insurance_name', resolvedInsuranceName)
            syncRec.set('total_enviado_casa', totalEnviadoCasa)
            syncRec.set('itens', itensList)
            syncRec.set('payload', raw)
            syncRec.set('synced_at', nowDisp)
            try {
              app.save(syncRec)
              if (isNew) resDisp.created++
              else resDisp.updated++
            } catch (_) {
              resDisp.ignored++
            }
          }
          if (items.length < pageSizeDisp) break
        }
        if (windowStart >= todayIso) break
        if (month === 12) {
          year++
          month = 1
        } else {
          month++
        }
      }
    } else {
      console.error('[Products Sync] Coleção dispensacoes_spincare não encontrada.')
    }

    const durationMs = new Date().getTime() - startTime

    // Trilha de auditoria LGPD
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRecord = new Record(auditCol)
      auditRecord.set('colecao', 'produtos_spincare')
      auditRecord.set('registro_id', 'sync_cdc_products')
      auditRecord.set('acao', 'SPINCARE_PRODUCT_SYNC_MANUAL')
      auditRecord.set('usuario', authUser ? authUser.id : '')
      auditRecord.set('usuario_nome', authUser ? authUser.getString('name') || '' : 'sistema')
      auditRecord.set('usuario_email', authUser ? authUser.getString('email') || '' : '')
      auditRecord.set('usuario_role', authUser ? authUser.getString('role') || 'admin' : 'admin')
      auditRecord.set('status_novo', 'sucesso')
      auditRecord.set(
        'detalhes',
        'Replicação CDC de produtos/dispensações concluída (manual): produtos buscados=' +
          resProd.totalFetched +
          ', criados=' +
          resProd.created +
          ', atualizados=' +
          resProd.updated +
          '; dispensações buscadas=' +
          resDisp.totalFetched +
          ', criadas=' +
          resDisp.created +
          ', atualizadas=' +
          resDisp.updated +
          ', duração=' +
          Math.round(durationMs / 1000) +
          's',
      )
      app.save(auditRecord)
    } catch (_) {}

    console.log(
      '[Products Sync Manual] Concluído: produtos criados=' +
        resProd.created +
        ', atualizados=' +
        resProd.updated +
        '; dispensações criadas=' +
        resDisp.created +
        ', atualizadas=' +
        resDisp.updated,
    )

    return e.json(200, {
      success: true,
      trigger: 'manual',
      produtos: {
        pagesProcessed: resProd.pagesProcessed,
        totalFetched: resProd.totalFetched,
        created: resProd.created,
        updated: resProd.updated,
        ignored: resProd.ignored,
      },
      dispensacoes: {
        windowsProcessed: resDisp.windowsProcessed,
        totalFetched: resDisp.totalFetched,
        created: resDisp.created,
        updated: resDisp.updated,
        ignored: resDisp.ignored,
      },
      syncedAt: resProd.syncedAt,
      durationMs: durationMs,
    })
  } catch (err) {
    console.error('Erro na rota POST /spincare/products/sync:', err)
    return e.json(500, {
      success: false,
      message: 'Não foi possível concluir a sincronização de produtos agora: ' + String(err),
    })
  }
})

// ============================================================================
// ROTA: GET /backend/v1/spincare/products/sync-status
// ============================================================================
routerAdd(
  'GET',
  '/backend/v1/spincare/products/sync-status',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado.')
      }

      const totalProdutos = e.app.countRecords('produtos_spincare')
      const totalDispensacoes = e.app.countRecords('dispensacoes_spincare')

      let lastSyncedAt = ''
      try {
        const lastProd = e.app.findRecordsByFilter(
          'produtos_spincare',
          'synced_at != ""',
          '-synced_at',
          1,
          0,
        )
        if (lastProd && lastProd.length > 0) lastSyncedAt = lastProd[0].getString('synced_at')
      } catch (_) {}

      let lastDispensacaoSyncedAt = ''
      try {
        const lastDisp = e.app.findRecordsByFilter(
          'dispensacoes_spincare',
          'synced_at != ""',
          '-synced_at',
          1,
          0,
        )
        if (lastDisp && lastDisp.length > 0) {
          lastDispensacaoSyncedAt = lastDisp[0].getString('synced_at')
        }
      } catch (_) {}

      let isRunning = false
      try {
        const lastAudit = e.app.findRecordsByFilter(
          'audit_logs',
          'colecao = "produtos_spincare" && acao = "SPINCARE_PRODUCT_SYNC_IN_PROGRESS"',
          '-created',
          1,
          0,
        )
        if (lastAudit && lastAudit.length > 0) {
          const diff = new Date().getTime() - new Date(lastAudit[0].getString('created')).getTime()
          if (diff < 60000) isRunning = true
        }
      } catch (_) {}

      return e.json(200, {
        isRunning: isRunning,
        totalProdutos: totalProdutos,
        totalDispensacoes: totalDispensacoes,
        lastSyncedAt: lastSyncedAt,
        lastDispensacaoSyncedAt: lastDispensacaoSyncedAt,
      })
    } catch (err) {
      return e.json(500, { error: String(err) })
    }
  },
  $apis.requireAuth(),
)
