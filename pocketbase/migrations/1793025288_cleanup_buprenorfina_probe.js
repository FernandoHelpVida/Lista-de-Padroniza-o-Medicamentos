migrate(
  (app) => {
    // Migração no-op de neutralização das sondas de diagnóstico de Buprenorfina da rodada anterior.
    // As migrações 1793025282 a 1793025286 já foram aplicadas e o hook probe_buprenorfina.js foi removido.
  },
  (app) => {},
)
