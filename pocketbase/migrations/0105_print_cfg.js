/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
      if (!records || records.length === 0) return
      const cfg = records[0]
      console.log('CFG_LAST_TEST_MESSAGE:', cfg.getString('last_test_message'))
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
