/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL (fonte_preco) — PARTE 2
 * ============================================================================
 * A 1793100014 gravou o resumo da distribuição (SYNC_OFICIAL_PROVA), mas o
 * campo detalhes do audit_logs corta em ~8 KB e as réguas canônicas ficaram
 * de fora. Esta migração COMPLEMENTAR regrava:
 *   - SYNC_OFICIAL_PROVA_REGUAS: as 10 referências (2940, 2944, 4383 e as
 *     sete réguas), 3 por registro, com os valores do BANCO e os valores da
 *     API (api_last_buy_value / api_medium_cost extraídos do payload gravado
 *     pelo sync oficial) — evidência, não correção.
 * Idempotente; não altera produtos_spincare; não toca no guard anti-zero.
 * ============================================================================
 */

migrate(
  (app) => {
    const alvos = [
      [2940, 'oficial', 0.24, 0.39],
      [2944, 'oficial', 1.56, 1.52],
      [4383, 'api_cost_zero', null, null],
      [2645, null, 54.5, 54.5],
      [2578, null, 0.13, 0.13],
      [4575, null, 3.52, 3.52],
      [2942, null, 0.31, 0.3],
      [2915, null, 8.4, 9.5],
      [2916, null, 10.0, 10.12],
      [2917, null, 15.0, 15.7],
    ]
    const reguas = []
    for (let a = 0; a < alvos.length; a++) {
      const sid = alvos[a][0]
      const fonteEsperada = alvos[a][1]
      const reguaUc = alvos[a][2]
      const reguaCm = alvos[a][3]
      let rec = null
      try {
        rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', { id: sid })
      } catch (_) {
        rec = null
      }
      if (!rec) {
        reguas.push({ spincare_id: sid, encontrado: false })
        continue
      }
      const uc = Number(rec.getFloat('ultima_compra_price')) || 0
      const cm = Number(rec.getFloat('custo_medio_price')) || 0
      const fonte = rec.getString('fonte_preco') || ''
      const payload = rec.get('payload') || null
      const item = {
        spincare_id: sid,
        description: rec.getString('description'),
        fonte_preco: fonte,
        ultima_compra_price: uc,
        custo_medio_price: cm,
        api_last_buy_value:
          payload && payload.last_buy_value !== undefined ? payload.last_buy_value : null,
        api_medium_cost: payload && payload.medium_cost !== undefined ? payload.medium_cost : null,
      }
      if (fonteEsperada) {
        item.fonte_esperada = fonteEsperada
        item.fonte_ok = fonte === fonteEsperada
      }
      if (reguaUc !== null) {
        item.regua_uc = reguaUc
        item.regua_cm = reguaCm
        item.regua_bate = uc === reguaUc && cm === reguaCm
      }
      reguas.push(item)
    }

    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      for (let p = 0; p < reguas.length; p += 3) {
        const slice = reguas.slice(p, p + 3)
        const recB = new Record(auditCol)
        recB.set('colecao', 'produtos_spincare')
        recB.set('registro_id', 'diag_prova_sync_oficial_reguas_' + Math.floor(p / 3))
        recB.set('acao', 'SYNC_OFICIAL_PROVA_REGUAS')
        recB.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
        recB.set('usuario_email', 'diag@helpvida.internal')
        recB.set('usuario_role', 'sistema')
        recB.set('status_novo', 'sucesso')
        recB.set('detalhes', JSON.stringify(slice))
        app.save(recB)
      }
      console.log('[Diag Prova Sync Oficial P2] Regras gravadas: ' + reguas.length)
    } catch (e) {
      console.error('[Diag Prova Sync Oficial P2] Falha ao gravar: ' + String(e))
    }
  },
  (app) => {
    // down: nada a desfazer — migração de diagnóstico, só grava em audit_logs
  },
)
