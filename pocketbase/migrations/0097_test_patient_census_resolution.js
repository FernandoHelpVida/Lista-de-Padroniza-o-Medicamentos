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

      // Vamos testar:
      // 1. Quando chamamos /get/prescriptions com initial_dt=2026-07-01 00:00:00 & final_dt=2026-07-31 23:59:59:
      //    quantas prescrições vêm? A 75147 está lá?
      // 2. Quando chamamos /get/prescriptions com initial_dt=2026-01-01 00:00:00 & final_dt=2026-09-30 23:59:59 na página 138:
      //    quais são as datas (creation_dt, initial_dt, final_dt) dos itens da página 138?
      // 3. E como o SpinCare ordena as prescrições?
      //    Por creation_dt ASC, creation_dt DESC, id ASC, ou initial_dt ASC?
      //    Vamos ler a página 138 onde 75147 foi achada!

      const res138 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?token=' +
          encodeURIComponent(token) +
          '&page_number=138&page_size=100',
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const d138 = res138.json || JSON.parse(res138.raw || '[]')
      const items138 = Array.isArray(d138) ? d138 : d138 && d138.items ? d138.items : []
      const p75147 = items138.find((x) => String(x.prescription_number || x.id) === '75147')

      // E como buscar as prescrições do paciente Ademir Rostirolla diretamente?
      // Se o usuário digitou "ADEMIR ROSTIROLLA":
      // Como o backend descobre o patient_id=418?
      // Na tabela ou no censo de pacientes, em qual página de /get/patients está o paciente 418?
      // O censo de pacientes tem quantos pacientes? ~539 pacientes (apenas 6 páginas de 100)!
      // Em 6 páginas de 100 de /get/patients, encontramos TODOS os pacientes do SpinCare em 2 segundos!
      // Vamos verificar: em qual página de /get/patients está o paciente 418?
      let ademirPat = null
      let ademirPatPage = -1
      for (let p = 1; p <= 7; p++) {
        const resP = $http.send({
          url:
            baseUrl +
            '/integration-engine/get/patients?page_number=' +
            p +
            '&page_size=100&token=' +
            encodeURIComponent(token),
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          timeout: 15,
        })
        const dP = resP.json || JSON.parse(resP.raw || '[]')
        const pList = Array.isArray(dP) ? dP : dP && dP.items ? dP.items : []
        const found = pList.find((x) => {
          const n = (x.name || x.nome || '').toUpperCase()
          return n.includes('ADEMIR') && n.includes('ROSTIROLLA')
        })
        if (found) {
          ademirPat = { id: found.id, name: found.name || found.nome, active: found.active }
          ademirPatPage = p
          break
        }
        if (pList.length < 100) break
      }

      const out = {
        has75147_in_p138_no_date_filter: Boolean(p75147),
        p75147_creation_dt: p75147 ? p75147.creation_dt : null,
        p75147_initial_dt: p75147 ? p75147.initial_dt : null,
        p75147_final_dt: p75147 ? p75147.final_dt : null,
        p75147_patient_id: p75147 ? p75147.patient_id : null,
        p75147_patient_name: p75147 ? p75147.patient_name : null,
        ademirPat,
        ademirPatPage,
      }

      cfg.set('last_test_message', 'M97_DISCOVERY: ' + JSON.stringify(out))
      app.save(cfg)
    } catch (err) {
      console.error('M97_ERR:', err)
    }
  },
  (app) => {},
)
