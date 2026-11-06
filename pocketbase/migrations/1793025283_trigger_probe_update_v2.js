migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = 2645')
      if (rec) {
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
      }
    } catch (e) {
      console.error('Erro na migracao trigger 2:', e)
    }
  },
  (app) => {},
)
