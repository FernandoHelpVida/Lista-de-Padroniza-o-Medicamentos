/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const ids = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const pRec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = ' + id)
        if (pRec) {
          pRec.set('code', pRec.getString('description').substring(0, 50))
          app.save(pRec)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
