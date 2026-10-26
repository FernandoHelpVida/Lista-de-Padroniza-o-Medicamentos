/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', 'id != ""')
      console.log('CFG_TEST_MSG: ' + (cfg ? cfg.getString('last_test_message') : 'no_cfg'))
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
