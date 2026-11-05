migrate(
  (app) => {
    const log = (msg, str) => {
      try {
        const col = app.findCollectionByNameOrId('audit_logs')
        const r = new Record(col)
        r.set('colecao', 'produtos_spincare')
        r.set('registro_id', 'diag_test_formulas')
        r.set('acao', msg)
        r.set('detalhes', String(str))
        r.set('usuario_nome', 'Diag')
        r.set('usuario_email', 'diag@internal')
        r.set('usuario_role', 'sistema')
        r.set('status_novo', 'ok')
        app.save(r)
      } catch (_) {}
    }

    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfgRec = records[0]
      const baseUrl = (
        cfgRec.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
      )
        .trim()
        .replace(/\/+$/, '')
      let token = (cfgRec.getString('api_token') || '').trim()
      if (token.startsWith('Bearer ')) token = token.substring(7).trim()

      let allStocks = []
      for (let p = 1; p <= 10; p++) {
        const url =
          baseUrl +
          '/integration-engine/get/stocks?token=' +
          encodeURIComponent(token) +
          '&product_id=2916&page_number=' +
          p +
          '&page_size=500'
        const res = $http.send({ url: url, method: 'GET', timeout: 25 })
        const list = res.json || JSON.parse(res.raw || '[]')
        if (!Array.isArray(list) || list.length === 0) break
        allStocks = allStocks.concat(list)
      }

      const nfs = allStocks.filter(
        (x) =>
          x.operation_type === 'Entrada' &&
          String(x.operation_ds || '').indexOf('Nota fiscal') >= 0,
      )
      nfs.sort((a, b) => (a.id || 0) - (b.id || 0))

      // Testar várias fórmulas
      // 1. Todas as NFs:
      let sumVal = 0,
        sumQt = 0,
        sumUnit = 0
      for (let i = 0; i < nfs.length; i++) {
        sumVal += nfs[i].cost_total_price || 0
        sumQt += nfs[i].quantity || 0
        sumUnit += nfs[i].cost_unit_price || 0
      }

      // Última NF
      const lastNf = nfs[nfs.length - 1]

      // NFs de 2026
      const nfs2026 = nfs.filter((x) => String(x.batch_fabrication_dt || '').indexOf('2026') === 0)
      let sV2026 = 0,
        sQ2026 = 0,
        sU2026 = 0
      for (let i = 0; i < nfs2026.length; i++) {
        sV2026 += nfs2026[i].cost_total_price || 0
        sQ2026 += nfs2026[i].quantity || 0
        sU2026 += nfs2026[i].cost_unit_price || 0
      }

      // Média ponderada com saldo em estoque atual (estoque disponível = 877)
      // Se usarmos PEPS/FIFO ou média móvel sobre o saldo em estoque
      // Ou as últimas compras que somam o estoque de 877
      let accumQt = 0
      let accumVal = 0
      let fifoNfs = []
      for (let i = nfs.length - 1; i >= 0; i--) {
        const q = nfs[i].quantity || 0
        const u = nfs[i].cost_unit_price || 0
        const need = 877 - accumQt
        if (need <= 0) break
        const take = Math.min(q, need)
        accumQt += take
        accumVal += take * u
        fifoNfs.push({ id: nfs[i].id, take: take, unit: u })
      }

      const formulas = {
        totalNfs: nfs.length,
        lastNf_unit: lastNf ? lastNf.cost_unit_price : 0,
        lastNf_ds: lastNf ? lastNf.operation_ds : '',
        all_ponderada: sumQt ? sumVal / sumQt : 0,
        all_simples: nfs.length ? sumUnit / nfs.length : 0,
        nfs2026_count: nfs2026.length,
        nfs2026_ponderada: sQ2026 ? sV2026 / sQ2026 : 0,
        nfs2026_simples: nfs2026.length ? sU2026 / nfs2026.length : 0,
        estoque_877_ponderado: accumQt ? accumVal / accumQt : 0,
      }

      // Testar últimas K compras (K de 2 a 12) simples e ponderada
      for (let k = 2; k <= 12; k++) {
        const slice = nfs.slice(-k)
        let tQ = 0,
          tV = 0,
          tU = 0
        for (let m = 0; m < slice.length; m++) {
          tQ += slice[m].quantity || 0
          tV += slice[m].cost_total_price || 0
          tU += slice[m].cost_unit_price || 0
        }
        formulas['ultimas_' + k + '_ponderada'] = tQ ? tV / tQ : 0
        formulas['ultimas_' + k + '_simples'] = slice.length ? tU / slice.length : 0
      }

      log('FORMULAS', JSON.stringify(formulas))
    } catch (err) {
      log('ERR', String(err))
    }
  },
  (app) => {},
)
