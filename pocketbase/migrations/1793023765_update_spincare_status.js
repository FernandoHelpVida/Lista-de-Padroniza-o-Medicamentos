/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]
      const msg = cfg.getString('last_test_message') || ''
      cfg.set('last_test_status', msg.includes('"matchingCount":1') ? 'sucesso' : 'falha')
      cfg.set('last_tested_at', new Date().toISOString())
      app.save(cfg)
    } catch (_) {}
  },
  (app) => {},
)
