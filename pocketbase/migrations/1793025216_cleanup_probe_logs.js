/**
 * Limpeza das migrações temporárias de diagnóstico de swagger/probe
 */
migrate(
  (app) => {
    // No-op / limpa registros de probe temporários de audit_logs
    try {
      const logs = app.findRecordsByFilter(
        'audit_logs',
        'registro_id ~ "probe_swagger_curva_abc"',
        '-created',
        50,
        0,
      )
      for (let i = 0; i < logs.length; i++) {
        try {
          app.delete(logs[i])
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {},
)
