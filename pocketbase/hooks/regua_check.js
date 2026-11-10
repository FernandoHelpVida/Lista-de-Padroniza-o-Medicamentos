/**
 * Diagnóstico temporário das réguas de preço (Curva ABC).
 * GET /backend/v1/regua-check?key=<REGUA_CHECK_KEY>
 * Retorna spincare_id, description, ultima_compra_price, custo_medio_price e
 * fonte_preco das 7 réguas + contagens gerais da varredura A–Z.
 */

routerAdd('GET', '/backend/v1/regua-check', (e) => {
  const key = $os.getenv('REGUA_CHECK_KEY') || ''
  const query = e.requestInfo().query || {}
  if (!key || (query['key'] || '') !== key) {
    return e.unauthorizedError('Chave inválida.')
  }

  const ids = [2645, 4575, 2942, 2578, 2915, 2916, 2917]
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
  try {
    total = e.app.countRecords('produtos_spincare')
    comNf = e.app.countRecords('produtos_spincare', "fonte_preco = 'nf_compra'")
    comCatalogo = e.app.countRecords('produtos_spincare', "fonte_preco = 'catalogo'")
    preservados = e.app.countRecords('produtos_spincare', "fonte_preco = 'preservado'")
    semFonte = e.app.countRecords('produtos_spincare', "fonte_preco = ''")
    zeradosComFonte = e.app.countRecords(
      'produtos_spincare',
      "fonte_preco = 'nf_compra' && (ultima_compra_price = 0 || custo_medio_price = 0)",
    )
  } catch (errCount) {
    console.error('[ReguaCheck] Erro nas contagens:', errCount)
  }

  return e.json(200, {
    reguas: reguas,
    totais: { total, comNf, comCatalogo, preservados, semFonte, zeradosComFonte },
  })
})
