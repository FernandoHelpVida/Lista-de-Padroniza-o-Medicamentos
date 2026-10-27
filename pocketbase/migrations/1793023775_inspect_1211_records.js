migrate(
  (app) => {
    // Salvar diagnóstico no campo descricao ou observacao de spincare_config
    const cfg = app.findCollectionByNameOrId('spincare_config')
    const records = app.findRecordsByFilter('spincare_config', "id != ''", '', 1, 0)
    if (records.length === 0) return
    const rec = records[0]

    // Buscar itens criados no lote de 12:11
    const meds = app.findRecordsByFilter(
      'medicamentos',
      "created >= '2026-10-27 12:11:00' && created <= '2026-10-27 12:12:00'",
      'nome',
      50,
      0,
    )

    let report = `Total 12:11 meds: ${meds.length}\n`
    meds.forEach((m) => {
      report += `[${m.id}] (${m.getString('status')}) [len:${m.getString('nome').length}] ${m.getString('nome').substring(0, 150)}\n`
    })

    rec.set('last_test_message', report)
    app.save(rec)
  },
  (app) => {},
)
