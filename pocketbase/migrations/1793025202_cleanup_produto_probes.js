/**
 * Cleanup: remove da trilha de auditoria os registros de sondagem temporária
 * (PRODUTO_PROBE_*) usados na investigação dos endpoints de produtos e
 * dispensações da SpinCare. As migrações 1793025100–1793025103 foram excluídas
 * do projeto; esta é a contrapartida de dados, idempotente (no-op em base limpa).
 */
migrate(
  (app) => {
    let removed = 0
    try {
      const probeRecords = app.findRecordsByFilter(
        'audit_logs',
        'acao ~ "PRODUTO_PROBE_"',
        '-created',
        0,
        0,
      )
      for (let i = 0; i < probeRecords.length; i++) {
        try {
          app.delete(probeRecords[i])
          removed++
        } catch (_) {}
      }
    } catch (_) {}
    console.log('[cleanup-produtos-probe] registros de sondagem removidos:', removed)
  },
  (app) => {},
)
