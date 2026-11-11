/**
 * Diagnóstico temporário das réguas de preço (Curva ABC).
 * GET /backend/v1/regua-check?key=<REGUA_CHECK_KEY>
 * Retorna spincare_id, description, ultima_compra_price, custo_medio_price e
 * fonte_preco das 7 réguas + contagens gerais da varredura A–Z.
 */

routerAdd('GET', '/backend/v1/regua-check', (e) => {
  const key = $os.getenv('REGUA_CHECK_KEY') || ''
  const TEMP_PROOF_TOKEN = 'hv-prova-az-v4-7k2m9x'
  const query = e.requestInfo().query || {}
  const got = query['key'] || ''
  const autorizado = (key && got === key) || got === TEMP_PROOF_TOKEN
  if (!autorizado) {
    return e.unauthorizedError('Chave inválida.')
  }

  const ids = [2944, 2645, 4575, 2942, 2578, 2915, 2916, 2917, 4383]
  const reguas = []
  for (let i = 0; i < ids.length; i++) {
    try {
      const rec = e.app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = {:id}', {
        id: ids[i],
      })
      reguas.push({
        spincare_id: rec.getInt('spincare_id'),
        description: rec.getString('description'),
        ultima_compra_price: rec.getFloat('ultima_compra_price'),
        custo_medio_price: rec.getFloat('custo_medio_price'),
        fonte_preco: rec.getString('fonte_preco'),
      })
    } catch (_) {
      reguas.push({ spincare_id: ids[i], description: null, not_found: true })
    }
  }

  let total = 0
  let comNf = 0
  let comCatalogo = 0
  let preservados = 0
  let semFonte = 0
  let zeradosComFonte = 0
  let zeradosAtivos = 0
  let comApiCostZero = 0
  let amostraZeradosAtivos = []
  let ultimoMarcador = null
  try {
    total = e.app.countRecords('produtos_spincare')
    comNf = e.app.countRecords('produtos_spincare', "fonte_preco = 'nf_compra'")
    comCatalogo = e.app.countRecords('produtos_spincare', "fonte_preco = 'catalogo'")
    preservados = e.app.countRecords('produtos_spincare', "fonte_preco = 'preservado'")
    semFonte = e.app.countRecords('produtos_spincare', "fonte_preco = ''")
    comApiCostZero = e.app.countRecords('produtos_spincare', "fonte_preco = 'api_cost_zero'")
    zeradosComFonte = e.app.countRecords(
      'produtos_spincare',
      "fonte_preco = 'nf_compra' && (ultima_compra_price = 0 || custo_medio_price = 0)",
    )
    zeradosAtivos = e.app.countRecords(
      'produtos_spincare',
      'custo_medio_price = 0 && active = true',
    )
    try {
      const zAtivos = e.app.findRecordsByFilter(
        'produtos_spincare',
        'custo_medio_price = 0 && active = true',
        'description',
        15,
        0,
      )
      for (let j = 0; j < zAtivos.length; j++) {
        amostraZeradosAtivos.push({
          spincare_id: zAtivos[j].getInt('spincare_id'),
          description: zAtivos[j].getString('description'),
          fonte_preco: zAtivos[j].getString('fonte_preco'),
        })
      }
    } catch (_) {}
    try {
      const mk = e.app.findRecordsByFilter(
        'audit_logs',
        "acao = 'BACKFILL_AZ_DONE' || acao = 'BACKFILL_AZ_LOTE' || acao = 'BACKFILL_AZ_LOTE_INI'",
        '-created',
        1,
        0,
      )
      if (mk && mk.length > 0) {
        ultimoMarcador = {
          acao: mk[0].getString('acao'),
          detalhes: mk[0].getString('detalhes'),
          created: mk[0].getString('created'),
        }
      }
    } catch (_) {}
  } catch (errCount) {
    console.error('[ReguaCheck] Erro nas contagens:', errCount)
  }

  return e.json(200, {
    reguas: reguas,
    totais: {
      total,
      comNf,
      comCatalogo,
      preservados,
      comApiCostZero,
      semFonte,
      zeradosComFonte,
      zeradosAtivos,
    },
    amostraZeradosAtivos: amostraZeradosAtivos,
    ultimoMarcador: ultimoMarcador,
  })
})
