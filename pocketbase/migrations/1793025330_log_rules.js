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
      console.log('RULE_' + id + ': ' + recs[0].getString('detalhes'))
    }
  }
})
