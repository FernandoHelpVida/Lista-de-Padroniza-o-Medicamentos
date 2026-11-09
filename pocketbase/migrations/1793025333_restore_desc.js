/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const ids = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const prodRecs = app.findRecordsByFilter('produtos_spincare', 'spincare_id = ' + id, '', 1, 0)
    if (prodRecs && prodRecs.length > 0) {
      const p = prodRecs[0]
      const original = p.getString('description').split(' [DIAG:')[0]
      p.set('description', original)
      app.save(p)
    }
  }
})
