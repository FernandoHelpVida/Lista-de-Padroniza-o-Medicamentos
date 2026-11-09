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
        console.log('[DISTINCT_RESULT]', recs[i].getString('detalhes'))
      }
    } catch (_) {}
  },
  (app) => {},
)
