/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL — PAYLOADS DA API (PARTE 3)
 * ============================================================================
 * A 1793100015 provou os valores do banco, mas a extração de
 * api_last_buy_value/api_medium_cost veio null: no JSVM o campo JSON `payload`
 * chega como STRING. Esta migração corretiva re-extrai com JSON.parse e grava
 * em audit_logs (SYNC_OFICIAL_PROVA_PAYLOADS):
 *   - Para 2940, 2944, 4383 e as sete réguas: os campos OFICIAIS do payload
 *     real da API (last_buy_value, medium_cost, price, imported_prices) —
 *     evidência, não correção.
 *   - O(s) produto(s) restante(s) em fonte nf_compra (o único do total).
 *   - Contagem de ATIVOS com custo zerado fora de api_cost_zero/oficial
 *     (grupos preservado/(vazio)/nf_compra) — extensão do guard anti-zero.
 * Idempotente; não altera produtos_spincare.
 * ============================================================================
 */

migrate(
  (app) => {
    const getPayload = (rec) => {
      const raw = rec.get('payload')
      if (!raw) return {}
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw)
        } catch (_) {
          return {}
        }
      }
      return raw
    }

    const alvos = [2940, 2944, 4383, 2645, 2578, 4575, 2942, 2915, 2916, 2917]
    const provas = []
    for (let a = 0; a < alvos.length; a++) {
      let rec = null
      try {
        rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
          id: alvos[a],
        })
      } catch (_) {
        rec = null
      }
      if (!rec) {
        provas.push({ spincare_id: alvos[a], encontrado: false })
        continue
      }
      const payload = getPayload(rec)
      const imported = Array.isArray(payload.imported_prices) ? payload.imported_prices : []
      const sample = []
      for (let k = 0; k < imported.length && k < 2; k++) {
        sample.push({
          pfb_value: imported[k] ? imported[k].pfb_value : null,
          price: imported[k] ? imported[k].price : null,
          pmc_value: imported[k] ? imported[k].pmc_value : null,
        })
      }
      provas.push({
        spincare_id: alvos[a],
        description: rec.getString('description'),
        fonte_preco: rec.getString('fonte_preco'),
        banco_ultima_compra: Number(rec.getFloat('ultima_compra_price')) || 0,
        banco_custo_medio: Number(rec.getFloat('custo_medio_price')) || 0,
        api_last_buy_value:
          payload.last_buy_value === undefined ? '(ausente)' : payload.last_buy_value,
        api_medium_cost: payload.medium_cost === undefined ? '(ausente)' : payload.medium_cost,
        api_price: payload.price === undefined ? '(ausente)' : payload.price,
        api_imported_prices_qtd: imported.length,
        api_imported_prices_sample: sample,
      })
    }

    // O único produto em nf_compra restante — identificação para o relatório.
    const nfCompra = []
    try {
      const nf = app.findRecordsByFilter(
        'produtos_spincare',
        "fonte_preco = 'nf_compra'",
        '-created',
        10,
        0,
      )
      for (let i = 0; i < nf.length; i++) {
        nfCompra.push({
          spincare_id: nf[i].getInt('spincare_id'),
          description: nf[i].getString('description'),
          active: nf[i].getBool('active'),
          ultima_compra_price: Number(nf[i].getFloat('ultima_compra_price')) || 0,
          custo_medio_price: Number(nf[i].getFloat('custo_medio_price')) || 0,
        })
      }
    } catch (_) {}

    // Guard estendido: ativos com custo zerado fora de oficial/api_cost_zero.
    let zeradosAtivosOutros = 0
    const zeradosExemplos = []
    try {
      const todos = app.findRecordsByFilter('produtos_spincare', 'id != ""', '-created', 0, 0)
      for (let i = 0; i < todos.length; i++) {
        const r = todos[i]
        const fonte = r.getString('fonte_preco') || '(vazio)'
        const uc = Number(r.getFloat('ultima_compra_price')) || 0
        const cm = Number(r.getFloat('custo_medio_price')) || 0
        if (
          r.getBool('active') &&
          !(uc > 0) &&
          !(cm > 0) &&
          fonte !== 'api_cost_zero' &&
          fonte !== 'oficial'
        ) {
          zeradosAtivosOutros++
          if (zeradosExemplos.length < 10) {
            zeradosExemplos.push({
              spincare_id: r.getInt('spincare_id'),
              description: r.getString('description'),
              fonte_preco: fonte,
            })
          }
        }
      }
    } catch (_) {}

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      for (let p = 0; p < provas.length; p += 3) {
        const rec = new Record(auditCol)
        rec.set('colecao', 'produtos_spincare')
        rec.set('registro_id', 'diag_prova_payloads_' + Math.floor(p / 3))
        rec.set('acao', 'SYNC_OFICIAL_PROVA_PAYLOADS')
        rec.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
        rec.set('usuario_email', 'diag@helpvida.internal')
        rec.set('usuario_role', 'sistema')
        rec.set('status_novo', 'sucesso')
        rec.set('detalhes', JSON.stringify(provas.slice(p, p + 3)))
        app.save(rec)
      }
      const resumo = new Record(auditCol)
      resumo.set('colecao', 'produtos_spincare')
      resumo.set('registro_id', 'diag_prova_payloads_resumo')
      resumo.set('acao', 'SYNC_OFICIAL_PROVA_PAYLOADS')
      resumo.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
      resumo.set('usuario_email', 'diag@helpvida.internal')
      resumo.set('usuario_role', 'sistema')
      resumo.set('status_novo', 'sucesso')
      resumo.set(
        'detalhes',
        JSON.stringify({ nf_compra_restantes: nfCompra, zeradosAtivosOutros, zeradosExemplos }),
      )
      app.save(resumo)
      console.log(
        '[Diag Prova Payloads] provas=' +
          provas.length +
          ', nf_compra=' +
          nfCompra.length +
          ', zeradosAtivosOutros=' +
          zeradosAtivosOutros,
      )
    } catch (e) {
      console.error('[Diag Prova Payloads] Falha ao gravar: ' + String(e))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
