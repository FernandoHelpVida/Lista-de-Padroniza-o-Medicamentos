/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const recs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "diag_distinct_"',
        '-created',
        10,
        0,
      )
      for (let i = 0; i < recs.length; i++) {
        const item = JSON.parse(recs[i].getString('detalhes') || '{}')
        const pRec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = ' + item.pId)
        if (pRec) {
          pRec.set(
            'description',
            pRec.getString('description').split(' [D:')[0] +
              ' [D: uc=' +
              item.uc +
              ' cm=' +
              item.cm +
              ' vals=' +
              item.distinct.join(',') +
              ']',
          )
          app.save(pRec)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
