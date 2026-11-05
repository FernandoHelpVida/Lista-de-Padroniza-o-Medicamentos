/**
 * Migração para adicionar campos de custo_medio_price em produtos_spincare
 * e total_enviado_casa em dispensacoes_spincare.
 */
migrate(
  (app) => {
    // 1. produtos_spincare: adicionar custo_medio_price (number)
    try {
      const colProd = app.findCollectionByNameOrId('produtos_spincare')
      const existingField = colProd.fields.getByName('custo_medio_price')
      if (!existingField) {
        colProd.fields.add(
          new NumberField({
            name: 'custo_medio_price',
            required: false,
            min: 0,
          }),
        )
        app.save(colProd)
      }
    } catch (err) {
      console.error('Erro ao adicionar custo_medio_price em produtos_spincare:', err)
    }

    // 2. dispensacoes_spincare: adicionar total_enviado_casa (number)
    try {
      const colDisp = app.findCollectionByNameOrId('dispensacoes_spincare')
      const existingField = colDisp.fields.getByName('total_enviado_casa')
      if (!existingField) {
        colDisp.fields.add(
          new NumberField({
            name: 'total_enviado_casa',
            required: false,
            min: 0,
          }),
        )
        app.save(colDisp)
      }
    } catch (err) {
      console.error('Erro ao adicionar total_enviado_casa em dispensacoes_spincare:', err)
    }

    // 3. Backfill imediato de total_enviado_casa nas dispensações já gravadas
    try {
      const disps = app.findRecordsByFilter('dispensacoes_spincare', 'id != ""', '-created', 0, 0)
      for (let i = 0; i < disps.length; i++) {
        const d = disps[i]
        let itens = []
        const raw = d.get('itens')
        if (typeof raw === 'string') {
          try {
            itens = JSON.parse(raw)
          } catch (_) {}
        } else if (Array.isArray(raw)) {
          if (typeof raw[0] === 'number') {
            try {
              const str = String.fromCharCode.apply(null, raw)
              itens = JSON.parse(str)
            } catch (_) {}
          } else {
            itens = raw
          }
        }

        let sentSum = 0
        for (let j = 0; j < itens.length; j++) {
          const it = itens[j]
          const sq = Number(it.sent_qt || 0)
          sentSum += sq
        }
        d.set('total_enviado_casa', sentSum)
        app.save(d)
      }
    } catch (err) {
      console.error('Erro no backfill de total_enviado_casa:', err)
    }

    // 4. Backfill imediato de custo_medio_price nos produtos já gravados
    try {
      const prods = app.findRecordsByFilter('produtos_spincare', 'id != ""', '-created', 0, 0)
      for (let i = 0; i < prods.length; i++) {
        const p = prods[i]
        let py = {}
        try {
          py = JSON.parse(p.getString('payload') || '{}')
        } catch (_) {}

        const catalogPrice = Number(p.get('price') || py.price || 0)
        const ultimaCompra = Number(p.get('ultima_compra_price') || 0)
        let importedPrices = py.imported_prices || []

        let precosValidos = []
        if (ultimaCompra > 0) precosValidos.push(ultimaCompra)
        if (Array.isArray(importedPrices)) {
          for (let k = 0; k < importedPrices.length; k++) {
            const ip = importedPrices[k] || {}
            const pfb = Number(ip.pfb_value || 0)
            const pr = Number(ip.price || 0)
            const pmc = Number(ip.pmc_value || 0)
            if (pfb > 0 && !precosValidos.includes(pfb)) precosValidos.push(pfb)
            if (pr > 0 && !precosValidos.includes(pr)) precosValidos.push(pr)
            if (pmc > 0 && !precosValidos.includes(pmc)) precosValidos.push(pmc)
          }
        }
        if (catalogPrice > 0 && !precosValidos.includes(catalogPrice))
          precosValidos.push(catalogPrice)

        let custoMedio = 0
        if (precosValidos.length > 0) {
          const soma = precosValidos.reduce((acc, v) => acc + v, 0)
          custoMedio = Number((soma / precosValidos.length).toFixed(4))
        } else if (catalogPrice > 0) {
          custoMedio = catalogPrice
        }

        p.set('custo_medio_price', custoMedio)
        app.save(p)
      }
    } catch (err) {
      console.error('Erro no backfill de custo_medio_price:', err)
    }
  },
  (app) => {},
)
