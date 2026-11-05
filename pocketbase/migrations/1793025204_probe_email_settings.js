migrate(
  (app) => {
    const s = app.settings()
    const smtp = s.smtp || {}
    const meta = s.meta || {}
    console.log('=== PROBE EMAIL SETTINGS (diagnóstico) ===')
    console.log('meta.appName=' + (meta.appName || ''))
    console.log('meta.appURL=' + (meta.appURL || ''))
    console.log('meta.senderAddress=' + (meta.senderAddress || ''))
    console.log('meta.senderName=' + (meta.senderName || ''))
    console.log('smtp.enabled=' + smtp.enabled)
    console.log('smtp.host=' + (smtp.host || ''))
    console.log('smtp.port=' + smtp.port)
    console.log('smtp.username=' + (smtp.username || ''))
    console.log('smtp.authMethod=' + (smtp.authMethod || ''))
    console.log('smtp.senderAddress=' + (smtp.senderAddress || ''))
    console.log('smtp.senderName=' + (smtp.senderName || ''))
    console.log('smtp.hasPassword=' + Boolean(smtp.password))
    console.log('=== FIM PROBE EMAIL SETTINGS ===')
  },
  (app) => {},
)
