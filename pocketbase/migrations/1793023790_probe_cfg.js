migrate(
  (app) => {
    try {
      const cfg = app.findFirstRecordByFilter('spincare_config', "is_active = true || id != ''")
      const testMsg = cfg?.getString('last_test_message') || ''
      console.log('CFG MSG LENGTH: ' + testMsg.length)
      if (testMsg.length > 50) {
        console.log('CFG MSG START: ' + testMsg.substring(0, 300))
      }
    } catch (e) {
      console.error('PROBE ERR:', e)
    }
  },
  (app) => {},
)
