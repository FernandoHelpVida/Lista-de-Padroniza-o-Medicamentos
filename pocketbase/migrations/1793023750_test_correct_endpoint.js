/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]
      const baseUrl = (
        cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfg.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      // Diagnostic probe:
      // 1. Let's call get/prescriptions with initial_dt='2026-09-01 00:00:00'&final_dt='2026-09-30 23:59:59'
      // 2. Let's also call get/prescriptions with initial_dt='2026-09-01 00:00:00' (no final_dt)
      // 3. Let's also check if #75147 has patient_name populated or if patient_name is missing!
      // 4. Let's inspect the actual raw fields of #75147 when fetched directly or from period!

      // First: fetch #75147 via patient_id=418 to see its exact fields
      const resP418 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 20,
      })
      const dP418 = resP418.json || JSON.parse(resP418.raw || '[]')
      const p418Items = Array.isArray(dP418) ? dP418 : dP418 && dP418.items ? dP418.items : []
      const p75147Direct = p418Items.find((x) => String(x.prescription_number || x.id) === '75147')

      // Second: fetch page 1-4 of initial_dt=2026-09-01 00:00:00&final_dt=2026-09-30 23:59:59
      let allPeriodPrescs = []
      for (let p = 1; p <= 5; p++) {
        const resPer = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?page_number=' +
            p +
            '&page_size=100&initial_dt=' +
            encodeURIComponent('2026-09-01 00:00:00') +
            '&final_dt=' +
            encodeURIComponent('2026-09-30 23:59:59') +
            '&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        if (resPer.statusCode !== 200) break
        const dPer = resPer.json || JSON.parse(resPer.raw || '[]')
        const items = Array.isArray(dPer) ? dPer : dPer && dPer.items ? dPer.items : []
        allPeriodPrescs = allPeriodPrescs.concat(items)
        if (items.length < 100) break
      }

      const p75147InPeriod = allPeriodPrescs.find(
        (x) => String(x.prescription_number || x.id) === '75147',
      )

      // Third: fetch without final_dt with limit 100 or initial_dt=2026-09-01 00:00:00&final_dt=2026-10-05 23:59:59
      let p75147InWidePeriod = null
      let widePeriodCount = 0
      for (let p = 1; p <= 6; p++) {
        const resWide = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/prescriptions?page_number=' +
            p +
            '&page_size=100&initial_dt=' +
            encodeURIComponent('2026-09-01 00:00:00') +
            '&final_dt=' +
            encodeURIComponent('2026-10-05 23:59:59') +
            '&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 25,
        })
        if (resWide.statusCode !== 200) break
        const dWide = resWide.json || JSON.parse(resWide.raw || '[]')
        const items = Array.isArray(dWide) ? dWide : dWide && dWide.items ? dWide.items : []
        widePeriodCount += items.length
        const found = items.find((x) => String(x.prescription_number || x.id) === '75147')
        if (found) {
          p75147InWidePeriod = found
          break
        }
        if (items.length < 100) break
      }

      const summary = {
        p75147Direct: p75147Direct
          ? {
              id: p75147Direct.id,
              prescription_number: p75147Direct.prescription_number,
              patient_id: p75147Direct.patient_id,
              patient_name: p75147Direct.patient_name,
              nm_paciente: p75147Direct.nm_paciente,
              allKeys: Object.keys(p75147Direct),
              initial_dt: p75147Direct.initial_dt,
              final_dt: p75147Direct.final_dt,
              professional_name: p75147Direct.professional_name,
              itemsCount: (p75147Direct.items || []).length,
              lantus: (p75147Direct.items || []).find((it) =>
                JSON.stringify(it).toLowerCase().includes('lantus'),
              ),
            }
          : null,
        periodExactCount: allPeriodPrescs.length,
        has75147InExactPeriod: Boolean(p75147InPeriod),
        widePeriodCount,
        has75147InWidePeriod: Boolean(p75147InWidePeriod),
      }

      console.log('M1793023750_RESULT: ' + JSON.stringify(summary))

      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('colecao', 'spincare_middleware')
      auditRec.set('registro_id', 'm1793023750_probe')
      auditRec.set('acao', 'PROBE_EXACT_PERIOD')
      auditRec.set('usuario_nome', 'Migration 1793023750')
      auditRec.set('status_novo', String(summary.has75147InExactPeriod))
      auditRec.set('detalhes', JSON.stringify(summary).slice(0, 3990))
      app.save(auditRec)
    } catch (err) {
      console.error('M1793023750_ERR: ', err)
    }
  },
  (app) => {},
)
