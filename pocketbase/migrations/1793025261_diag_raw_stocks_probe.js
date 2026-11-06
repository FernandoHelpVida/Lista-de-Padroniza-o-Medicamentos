/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let rawStoredToken = (cfgRec.getString('api_token') || '').trim()
      let apiToken = rawStoredToken.startsWith('Bearer ')
        ? rawStoredToken.substring(7).trim()
        : rawStoredToken

      // Testar get/stocks para 2915 e 2917
      const testIds = [2915, 2917, 2916, 2578]
      const resultDump = {}

      for (let idx = 0; idx < testIds.length; idx++) {
        const pid = testIds[idx]
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(apiToken) +
          '&product_id=' +
          pid +
          '&page_number=1&page_size=100'
        const resp = $http.send({ url: url, method: 'GET', timeout: 25 })
        let items = []
        try {
          items = resp.json || JSON.parse(resp.raw || '[]')
        } catch (_) {}
        if (!Array.isArray(items) && items && Array.isArray(items.items)) items = items.items

        const total = Array.isArray(items) ? items.length : 0
        const sample = Array.isArray(items) ? items.slice(0, 5) : []
        const lastSample = Array.isArray(items) && items.length > 5 ? items.slice(-5) : []

        // Separar operações
        const opTypes = {}
        const opDs = {}
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const it = items[i]
            const ot = it.operation_type || 'null'
            opTypes[ot] = (opTypes[ot] || 0) + 1
            const od = it.operation_ds || 'null'
            opDs[od] = (opDs[od] || 0) + 1
          }
        }

        resultDump['p_' + pid] = {
          statusCode: resp.statusCode,
          total: total,
          firstSample: sample,
          lastSample: lastSample,
          opTypes: opTypes,
          opDs: opDs,
        }
      }

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('colecao', 'produtos_spincare')
      auditRec.set('registro_id', 'diag_raw_stocks_dump')
      auditRec.set('acao', 'DIAG_RAW_STOCKS_DUMP')
      auditRec.set('detalhes', JSON.stringify(resultDump))
      app.save(auditRec)
    } catch (err) {
      console.error('[Diag Raw Stocks Dump] Erro:', err)
    }
  },
  (app) => {},
)
