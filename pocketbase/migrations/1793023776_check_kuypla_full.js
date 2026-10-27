migrate(
  (app) => {
    const cfg = app.findRecordsByFilter('spincare_config', "id != ''", '', 1, 0)[0]
    try {
      const target = app.findFirstRecordByFilter(
        'medicamentos',
        "nome ~ 'DONEPEZILA 10MG COMPRIMIDO DONEPEZILA 5MG'",
      )
      const nome = target.getString('nome')
      cfg.set('last_test_message', `kuypla4 len=${nome.length} text: ${nome}`)
      app.save(cfg)
    } catch (e) {
      cfg.set('last_test_message', 'Not found')
      app.save(cfg)
    }
  },
  (app) => {},
)
