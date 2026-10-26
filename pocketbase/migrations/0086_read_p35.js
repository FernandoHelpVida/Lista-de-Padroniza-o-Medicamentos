/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      const msg = cfg.getString('last_test_message')
      const cleanJson = msg.replace('M85_PAGES: ', '')
      const parsed = JSON.parse(cleanJson)
      cfg.set('last_test_message', 'M86: p1_first=' + JSON.stringify(parsed.p1_first) + ' | p35_last=' + JSON.stringify(parsed.p35_last))
      app.save(cfg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
