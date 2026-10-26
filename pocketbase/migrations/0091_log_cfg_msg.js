/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      const msg = cfg.getString('last_test_message')
      console.log('CFG_LAST_MSG:', msg)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
