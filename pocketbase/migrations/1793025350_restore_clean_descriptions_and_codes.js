/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração de restauração idempotente:
 * Restaura os campos `description` e `code` de TODOS os registros da coleção `produtos_spincare`
 * a partir do JSON preservado no campo `payload`.
 * Remove quaisquer sufixos de diagnóstico tipo "[D: ...]" ou "[DIAG: ...]" e limpa audit_logs de diagnóstico.
 */
migrate(
  (app) => {
    try {
      // 1. Restaurar description e code de TODOS os produtos
      const pageSize = 500
      let page = 0
      while (true) {
        const prods = app.findRecordsByFilter(
          'produtos_spincare',
          'id != ""',
          'id',
          pageSize,
          page * pageSize,
        )
        if (!prods || prods.length === 0) break

        for (let i = 0; i < prods.length; i++) {
          const p = prods[i]
          let payload = null
          try {
            payload = JSON.parse(p.getString('payload') || '{}')
          } catch (_) {
            payload = null
          }

          let dirty = false

          // Restaurar description limpa do payload
          if (payload && (payload.description || payload.ds)) {
            const cleanDesc = String(payload.description || payload.ds || '').trim()
            if (cleanDesc && p.getString('description') !== cleanDesc) {
              p.set('description', cleanDesc)
              dirty = true
            }
          } else {
            // Fallback: remover sufixos de diagnóstico da string atual
            const currentDesc = p.getString('description')
            let cleaned = currentDesc.split(' [D:')[0].split(' [DIAG:')[0].trim()
            if (cleaned !== currentDesc) {
              p.set('description', cleaned)
              dirty = true
            }
          }

          // Restaurar code limpo do payload
          if (payload && payload.code !== undefined && payload.code !== null) {
            const cleanCode = String(payload.code).trim()
            if (p.getString('code') !== cleanCode) {
              p.set('code', cleanCode)
              dirty = true
            }
          } else {
            const currentCode = p.getString('code')
            let cleanedCode = currentCode.split(' [D:')[0].split(' [DIAG:')[0].trim()
            if (cleanedCode !== currentCode) {
              p.set('code', cleanedCode)
              dirty = true
            }
          }

          if (dirty) {
            try {
              app.save(p)
            } catch (errSave) {
              console.error('[RestoreDesc] Erro ao salvar produto ' + p.id + ':', errSave)
            }
          }
        }

        if (prods.length < pageSize) break
        page++
      }

      // 2. Garantir que as 7 réguas obrigatórias estejam salvas com os valores corretos SpinCare
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
          if (Math.abs(rRec.getFloat('ultima_compra_price') - reg.uc) > 0.001) {
            rRec.set('ultima_compra_price', reg.uc)
            dirty = true
          }
          if (Math.abs(rRec.getFloat('custo_medio_price') - reg.cm) > 0.001) {
            rRec.set('custo_medio_price', reg.cm)
            dirty = true
          }
          if (dirty) {
            try {
              app.save(rRec)
            } catch (_) {}
          }
        }
      }

      // 3. Limpeza de logs de diagnóstico que possam ter sobrado
      try {
        const diagLogs = app.findRecordsByFilter(
          'audit_logs',
          'registro_id ~ "diag_"',
          '-created',
          100,
          0,
        )
        for (let l = 0; l < diagLogs.length; l++) {
          try {
            app.delete(diagLogs[l])
          } catch (_) {}
        }
      } catch (_) {}
    } catch (err) {
      console.error('[RestoreDesc] Erro geral na migração:', err)
    }
  },
  (app) => {},
)
