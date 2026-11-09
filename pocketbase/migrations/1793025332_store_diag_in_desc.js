/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const ids = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const recs = app.findRecordsByFilter(
      'audit_logs',
      'registro_id = "diag_all_' + id + '"',
      '-created',
      1,
      0,
    )
    if (recs && recs.length > 0) {
      const d = JSON.parse(recs[0].getString('detalhes') || '{}')
      const prodRecs = app.findRecordsByFilter('produtos_spincare', 'spincare_id = ' + id, '', 1, 0)
      if (prodRecs && prodRecs.length > 0) {
        const p = prodRecs[0]
        p.set(
          'description',
          p.getString('description').split(' [DIAG:')[0] +
            ' [DIAG: uc=' +
            d.uc +
            ' balPos=' +
            d.balPositive +
            ' balFirst=' +
            d.balFirst +
            ' balLast=' +
            d.balLast +
            ' cmPos=' +
            d.cmWithPositive +
            ' cmFirst=' +
            d.cmWithFirst +
            ' cmLast=' +
            d.cmWithLast +
            ' n=' +
            d.comprasCount +
            ']',
        )
        app.save(p)
      }
    }
  }
})
