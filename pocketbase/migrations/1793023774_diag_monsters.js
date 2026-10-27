migrate(
  (app) => {
    // Diagnóstico dos monstros existentes
    const monsters = app.findRecordsByFilter(
      'medicamentos',
      "nome ~ 'DONEPEZILA' || nome ~ '###' || nome ~ 'COMPRIMIDO DONEPEZILA'",
      '-created',
      100,
      0,
    )
    console.log(`[DIAG_MONSTERS] Encontrados ${monsters.length} registros`)
    monsters.forEach((m) => {
      console.log(
        `[DIAG_MONSTER] id=${m.id} nome_len=${m.getString('nome').length} nome=${m.getString('nome').substring(0, 80)}`,
      )
    })
  },
  (app) => {},
)
