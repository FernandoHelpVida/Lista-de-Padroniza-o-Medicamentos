migrate(
  (app) => {
    const medCol = app.findCollectionByNameOrId('medicamentos')

    // Garantir o item teste canabidiol no catálogo conforme o PDF Anexo I
    const canabidiolRecords = app.findRecordsByFilter(
      'medicamentos',
      "nome ~ 'CANABIDIOL'",
      'nome',
      10,
      0,
    )
    if (canabidiolRecords.length === 0) {
      const r1 = new Record(medCol)
      r1.set('nome', 'CANABIDIOL 200MG/ML (PRATTI DONADUZZI) FRASCO 30 ML')
      r1.set('classe', 'Canabinoide')
      r1.set('status', 'Não Padronizado')
      r1.set(
        'observacao',
        'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      )
      app.save(r1)

      const r2 = new Record(medCol)
      r2.set('nome', 'CANABIDIOL 20MG/ML FRASCO 30 ML')
      r2.set('classe', 'Canabinoide')
      r2.set('status', 'Não Padronizado')
      r2.set(
        'observacao',
        'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      )
      app.save(r2)

      const r3 = new Record(medCol)
      r3.set('nome', 'CANABIDIOL 50MG/ML FRASCO 30 ML')
      r3.set('classe', 'Canabinoide')
      r3.set('status', 'Não Padronizado')
      r3.set(
        'observacao',
        'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.',
      )
      app.save(r3)
    }
  },
  () => {},
)
