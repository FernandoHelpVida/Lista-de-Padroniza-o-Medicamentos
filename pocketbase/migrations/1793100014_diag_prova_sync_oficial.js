/**
 * ============================================================================
 * MIGRAÇÃO DE DIAGNÓSTICO — PROVA DO SYNC OFICIAL (fonte_preco)
 * ============================================================================
 * A versão 0.0.206 já está no ar e o sync de produtos rodou com ela (cron
 * 03:02Z e manual às 11:26:32Z de 2026-11-17, ambos "produtos buscados=2243").
 * Esta migração é IDEMPOTENTE e SÓ LEVA A PROVA ao audit_logs — não grava
 * dados em produtos_spincare, não toca em fórmulas, não mexe no guard
 * anti-zero. Ela responde:
 *   1. Contagem de produtos por fonte_preco (distribuição real).
 *   2. Contagem de produtos com custo (ultima_compra ou custo_medio > 0)
 *      por fonte_preco.
 *   3. Registros de referência: 2940, 2944, 4383 e as sete réguas canônicas.
 *   4. Produtos ativos com custo zerado em fonte nf_compra (deveria ser 0 —
 *      guard anti-zero).
 *   5. Marcador SYNC_OFICIAL_PROVA com o resumo (audit_logs).
 * ============================================================================
 */

migrate(
  (app) => {
    const sum = {
      total: 0,
      porFonte: {},
      comCustoPorFonte: {},
      zeradosAtivosNfCompra: 0,
      reguas: [],
      guardAntiZeroOk: true,
    }

    // ---- 1, 2 e 4: distribuição por fonte_preco + guard anti-zero ----
    const total = app.findRecordsByFilter('produtos_spincare', 'id != ""', '-created', 0, 0)
    sum.total = total.length
    for (let i = 0; i < total.length; i++) {
      const r = total[i]
      const fonte = r.getString('fonte_preco') || '(vazio)'
      const uc = Number(r.getFloat('ultima_compra_price')) || 0
      const cm = Number(r.getFloat('custo_medio_price')) || 0
      if (!sum.porFonte[fonte]) sum.porFonte[fonte] = 0
      sum.porFonte[fonte]++
      if (uc > 0 || cm > 0) {
        if (!sum.comCustoPorFonte[fonte]) sum.comCustoPorFonte[fonte] = 0
        sum.comCustoPorFonte[fonte]++
      }
      if (r.getBool('active') && fonte === 'nf_compra' && !(uc > 0) && !(cm > 0)) {
        sum.zeradosAtivosNfCompra++
        sum.guardAntiZeroOk = false
      }
    }

    // ---- 3: réguas canônicas e referências (spincare_id → [régua UC, CM]) ----
    // null nas réguas = sem valor canônico fixo para conferir (casos com valor
    // oficial da API livre — relatado como evidência, não corrigido).
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
        sum.reguas.push({ spincare_id: sid, encontrado: false })
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
      sum.reguas.push(item)
    }

    const json = JSON.stringify(sum)
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'produtos_spincare')
      rec.set('registro_id', 'diag_prova_sync_oficial')
      rec.set('acao', 'SYNC_OFICIAL_PROVA')
      rec.set('usuario_nome', 'Migracao Diag Prova Sync Oficial')
      rec.set('usuario_email', 'diag@helpvida.internal')
      rec.set('usuario_role', 'sistema')
      rec.set('status_novo', 'sucesso')
      // O campo detalhes corta em ~8 KB; grava o resumo em DUAS partes:
      // parte A (distribuição + guard) e parte B (réguas), em registros separados.
      const parteA = JSON.stringify({
        total: sum.total,
        porFonte: sum.porFonte,
        comCustoPorFonte: sum.comCustoPorFonte,
        zeradosAtivosNfCompra: sum.zeradosAtivosNfCompra,
        guardAntiZeroOk: sum.guardAntiZeroOk,
      })
      rec.set('detalhes', parteA)
      app.save(rec)
      // Parte B: réguas, divididas em pares para caber no campo.
      for (let p = 0; p < sum.reguas.length; p += 3) {
        const slice = sum.reguas.slice(p, p + 3)
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
    } catch (e) {
      console.error('[Diag Prova Sync Oficial] Falha ao gravar marcador: ' + String(e))
    }
    console.log('[Diag Prova Sync Oficial] Resumo: ' + json)
  },
  (app) => {
    // down: nada a desfazer — a migração de diagnóstico não altera produtos
  },
)
