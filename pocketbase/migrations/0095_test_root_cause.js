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
      // 1. O que retornou em patByName?
      // 2. O que retornou em pSearch, pPatName, pName?
      // 3. E se chamarmos /get/prescriptions com initial_dt=2026-09-01 00:00:00 e final_dt=2026-09-30 23:59:59?
      //    Por que no log diz:
      //    [check-medication] Varredura ampla de prescrições para vigência: 2026-01-01 00:00:00 até 2026-09-30 23:59:59 (período pesquisado pelo usuário: 2026-09-01 a 2026-09-30 )
      //    Por que o scan foi de 2026-01-01 até 2026-09-30 em vez de 2026-09-01 até 2026-09-30?!
      //    Olhe as linhas 613-618 de spincare_middleware.js:
      //    let scanStartYear = '2026'
      //    if (isoStart && isoStart.length >= 4) scanStartYear = isoStart.substring(0, 4)
      //    const scanQueryInitParam = scanStartYear + '-01-01 00:00:00'
      //    const scanQueryFinalParam = (isoEnd ? isoEnd : scanStartYear + '-12-31') + ' 23:59:59'
      //
      //    E a API SpinCare no endpoint get/prescriptions tem 138 páginas entre 2026-01-01 e 2026-09-30!
      //    E o loop só vai até 35 páginas (linhas 653: for (let p = 1; p <= 35; p++))!
      //    E 35 páginas pararam em Março/Abril ou Julho! E a 75147 está na página 138!
      //    MAS se você passar initial_dt=2026-09-01 00:00:00 & final_dt=2026-09-30 23:59:59 direto para get/prescriptions:
      //    quantas páginas tem? A 75147 está lá?! OU a 75147 NÃO tem creation_dt em setembro?
      //    Vejamos: qual é o filtro do endpoint get/prescriptions da SpinCare?
      //    initial_dt e final_dt na SpinCare filtram por CREATION_DT ou INITIAL_DT?

      // Teste A: get/prescriptions com initial_dt=2026-09-01 00:00:00 & final_dt=2026-09-30 23:59:59
      const resA = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?initial_dt=2026-09-01%2000%3A00%3A00&final_dt=2026-09-30%2023%3A59%3A59&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dA = resA.json || JSON.parse(resA.raw || '[]')
      const itemsA = Array.isArray(dA) ? dA : dA && dA.items ? dA.items : []
      const has75147_in_A = itemsA.some((x) => String(x.prescription_number || x.id) === '75147')

      // Teste B: Como achar o paciente Ademir?
      // O que retornou get/patients?name=Ademir?
      const resB = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?name=' +
          encodeURIComponent('Ademir') +
          '&page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dB = resB.json || JSON.parse(resB.raw || '[]')
      const itemsB = Array.isArray(dB) ? dB : dB && dB.items ? dB.items : []

      // Teste C: get/patients com name=ADEMIR ROSTIROLLA
      const resC = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/patients?name=' +
          encodeURIComponent('ADEMIR ROSTIROLLA') +
          '&page_number=1&page_size=10&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      const dC = resC.json || JSON.parse(resC.raw || '[]')
      const itemsC = Array.isArray(dC) ? dC : dC && dC.items ? dC.items : []

      // Teste D: get/prescriptions com patient_id=418
      // Quantas prescrições o 418 tem no total?
      // E dessas prescrições do 418, quais tem initial_dt em setembro de 2026?
      const resD1 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=1&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dD1 = resD1.json || JSON.parse(resD1.raw || '[]')
      const itemsD1 = Array.isArray(dD1) ? dD1 : dD1 && dD1.items ? dD1.items : []

      const resD2 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=2&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dD2 = resD2.json || JSON.parse(resD2.raw || '[]')
      const itemsD2 = Array.isArray(dD2) ? dD2 : dD2 && dD2.items ? dD2.items : []

      const resD3 = $http.send({
        url:
          baseUrl +
          '/integration-engine/get/prescriptions?patient_id=418&page_number=3&page_size=100&token=' +
          encodeURIComponent(token),
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        timeout: 25,
      })
      const dD3 = resD3.json || JSON.parse(resD3.raw || '[]')
      const itemsD3 = Array.isArray(dD3) ? dD3 : dD3 && dD3.items ? dD3.items : []

      const all418 = [].concat(itemsD1, itemsD2, itemsD3)
      const p75147_in_418 = all418.find((x) => String(x.prescription_number || x.id) === '75147')

      const result = {
        testA_count: itemsA.length,
        testA_sample_dates: itemsA[0]
          ? { creation: itemsA[0].creation_dt, initial: itemsA[0].initial_dt }
          : null,
        testA_has75147: has75147_in_A,
        testB_patients_name_ademir: itemsB.map((p) => ({ id: p.id, name: p.name || p.nome })),
        testC_patients_name_rostirolla: itemsC.map((p) => ({ id: p.id, name: p.name || p.nome })),
        total418: all418.length,
        has75147_in_all418: Boolean(p75147_in_418),
        p75147_dates: p75147_in_418
          ? {
              initial_dt: p75147_in_418.initial_dt,
              final_dt: p75147_in_418.final_dt,
              creation_dt: p75147_in_418.creation_dt,
              prescription_number: p75147_in_418.prescription_number,
              patient_name: p75147_in_418.patient_name || p75147_in_418.nm_paciente,
              professional_name: p75147_in_418.professional_name || p75147_in_418.nm_profissional,
              itemsCount: (p75147_in_418.items || []).length,
              item0_desc:
                p75147_in_418.items && p75147_in_418.items[0]
                  ? p75147_in_418.items[0].description || p75147_in_418.items[0].ds_produto
                  : null,
              item0_dose:
                p75147_in_418.items && p75147_in_418.items[0]
                  ? p75147_in_418.items[0].dose_qt || p75147_in_418.items[0].dosage
                  : null,
              item0_via:
                p75147_in_418.items && p75147_in_418.items[0]
                  ? p75147_in_418.items[0].admin_route || p75147_in_418.items[0].route
                  : null,
              item0_fp:
                p75147_in_418.items && p75147_in_418.items[0]
                  ? p75147_in_418.items[0].supplied_type || p75147_in_418.items[0].funding_source
                  : null,
            }
          : null,
      }

      cfg.set('last_test_message', 'M95_RESULT: ' + JSON.stringify(result).slice(0, 950))
      app.save(cfg)
    } catch (err) {
      console.error('M95_ERR:', err)
    }
  },
  (app) => {},
)
