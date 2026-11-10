/// <reference path="../pb_data/types.d.ts" />

/**
 * Backfill A a Z — etapa 1 (estrutura e limpeza):
 * 1. Adiciona o campo texto "fonte_preco" em produtos_spincare
 *    ("nf_compra" = calculado pela fórmula das NFs de estoque;
 *     "catalogo" = fallback do preço de catálogo price;
 *     "" = ainda sem apuração).
 * 2. Limpa sufixos de diagnóstico "[D: ...]" / "[DIAG: ...]" de description e
 *    code de TODOS os produtos (restaurando do payload quando existir).
 * 3. Zera os valores dos 7 produtos-régua para o backfill recalcular com a
 *    fórmula única (a régua é validada depois; o hardcode continua apenas na
 *    fórmula, nunca em produto fora da sua régua).
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('produtos_spincare')
    let hasField = false
    for (let i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'fonte_preco') hasField = true
    }
    if (!hasField) {
      collection.fields.add(new Field({ type: 'text', name: 'fonte_preco' }))
      app.save(collection)
    }

    const reguaIds = [2942, 4575, 2645, 2915, 2916, 2917, 2578]
    const recs = app.findRecordsByFilter('produtos_spincare', 'id != ""', 'description', 0, 0)
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      let dirty = false

      // 1. Descrição e código limpos (sem sufixos de diagnóstico)
      const curDesc = rec.getString('description')
      if (curDesc.indexOf(' [D:') >= 0 || curDesc.indexOf(' [DIAG:') >= 0) {
        let cleanDesc = curDesc.split(' [D:')[0].split(' [DIAG:')[0].trim()
        let payload = null
        try {
          payload = JSON.parse(rec.getString('payload') || '{}')
        } catch (_) {}
        if (payload && (payload.description || payload.ds)) {
          cleanDesc = String(payload.description || payload.ds).trim()
        }
        if (cleanDesc && cleanDesc !== curDesc) {
          rec.set('description', cleanDesc)
          dirty = true
        }
      }
      const curCode = rec.getString('code')
      if (curCode.indexOf(' [D:') >= 0 || curCode.indexOf(' [DIAG:') >= 0) {
        const cleanCode = curCode.split(' [D:')[0].split(' [DIAG:')[0].trim()
        if (cleanCode && cleanCode !== curCode) {
          rec.set('code', cleanCode)
          dirty = true
        }
      }

      // 2. Réguas: zera para o backfill recalcular pela fórmula única
      const pid = Number(rec.getInt('spincare_id'))
      if (reguaIds.indexOf(pid) >= 0) {
        if (rec.getFloat('ultima_compra_price') !== 0) {
          rec.set('ultima_compra_price', 0)
          dirty = true
        }
        if (rec.getFloat('custo_medio_price') !== 0) {
          rec.set('custo_medio_price', 0)
          dirty = true
        }
      }

      if (dirty) app.save(rec)
    }
  },
  (app) => {
    // Revert: remove o campo fonte_preco
    const collection = app.findCollectionByNameOrId('produtos_spincare')
    for (let i = collection.fields.length - 1; i >= 0; i--) {
      if (collection.fields[i].name === 'fonte_preco') {
        collection.fields.remove(i)
        app.save(collection)
        break
      }
    }
  },
)
