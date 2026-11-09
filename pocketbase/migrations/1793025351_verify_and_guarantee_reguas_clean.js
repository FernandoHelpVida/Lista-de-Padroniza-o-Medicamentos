/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração de verificação e garantia final:
 * 1. Restaura description e code de qualquer produto que ainda tenha sufixos [D: ou [DIAG:
 * 2. Garante as 7 réguas exatas no banco de dados.
 * 3. Remove os audit_logs com tags de diagnóstico (diag_distinct_, diag_all_, diag_top_, etc.).
 */
migrate(
  (app) => {
    try {
      const reguas = [
        { id: 2942, uc: 0.31, cm: 0.3 },
        { id: 4575, uc: 3.52, cm: 3.52 },
        { id: 2645, uc: 54.5, cm: 54.5 },
        { id: 2915, uc: 8.4, cm: 9.5 },
        { id: 2916, uc: 10.0, cm: 10.12 },
        { id: 2917, uc: 15.0, cm: 15.7 },
        { id: 2578, uc: 0.13, cm: 0.13 },
      ]

      for (let rIdx = 0; rIdx < reguas.length; rIdx++) {
        const reg = reguas[rIdx]
        const rRec = app.findFirstRecordByFilter('produtos_spincare', 'spincare_id = ' + reg.id)
        if (rRec) {
          let dirty = false
          let curDesc = rRec.getString('description')
          let cleanDesc = curDesc.split(' [D:')[0].split(' [DIAG:')[0].trim()
          let payload = null
          try {
            payload = JSON.parse(rRec.getString('payload') || '{}')
          } catch (_) {}
          if (payload && (payload.description || payload.ds)) {
            cleanDesc = String(payload.description || payload.ds).trim()
          }
          if (cleanDesc && curDesc !== cleanDesc) {
            rRec.set('description', cleanDesc)
            dirty = true
          }

          let curCode = rRec.getString('code')
          let cleanCode = curCode.split(' [D:')[0].split(' [DIAG:')[0].trim()
          if (payload && payload.code !== undefined && payload.code !== null) {
            cleanCode = String(payload.code).trim()
          }
          if (cleanCode && curCode !== cleanCode) {
            rRec.set('code', cleanCode)
            dirty = true
          }

          if (Math.abs(rRec.getFloat('ultima_compra_price') - reg.uc) > 0.001) {
            rRec.set('ultima_compra_price', reg.uc)
            dirty = true
          }
          if (Math.abs(rRec.getFloat('custo_medio_price') - reg.cm) > 0.001) {
            rRec.set('custo_medio_price', reg.cm)
            dirty = true
          }

          if (dirty) {
            app.save(rRec)
          }
        }
      }

      // Limpar todos os registros de audit_logs gerados por migrações de diagnóstico
      try {
        const logs = app.findRecordsByFilter('audit_logs', 'registro_id ~ "diag_"', '', 500, 0)
        for (let j = 0; j < logs.length; j++) {
          try {
            app.delete(logs[j])
          } catch (_) {}
        }
      } catch (_) {}
    } catch (e) {
      console.error('[VerifyReguasFinal] Erro:', e)
    }
  },
  (app) => {},
)
