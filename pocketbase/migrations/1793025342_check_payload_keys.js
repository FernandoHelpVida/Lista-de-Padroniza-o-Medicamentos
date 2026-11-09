/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2942')
      if (rec) {
        console.log(
          '[SPINCARE_PAYLOAD_2942_KEYS]',
          Object.keys(JSON.parse(rec.getString('payload') || '{}')).join(','),
        )
      }
    } catch (err) {
      console.error('[SPINCARE_PAYLOAD_2942_ERR]', err)
    }
  },
  (app) => {},
)
