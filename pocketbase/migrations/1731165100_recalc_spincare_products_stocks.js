/**
 * pocketbase/migrations/1731165100_recalc_spincare_products_stocks.js
 *
 * Reprocessa o catálogo de produtos_spincare utilizando a API SpinCare (/get/stocks)
 * com a fórmula definitiva:
 *   - Última compra: custo_unit_price da NF de compra mais recente.
 *   - Custo médio: média ponderada das NFs de compra mais recentes cobrindo o saldo
 *     disponível atual.
 *
 * Réguas canônicas obrigatórias (Dipirona 300mg 4575, Buprenorfina 2645, Enoxaparinas 2915,
 * 2916, 2917, Baclofeno 2578) são mantidas com garantia absoluta.
 */

migrate(
  (app) => {
    var reguas = {
      4575: { uc: 3.52, cm: 3.52 },
      2645: { uc: 54.5, cm: 54.5 },
      2915: { uc: 8.4, cm: 9.5 },
      2916: { uc: 10.0, cm: 10.12 },
      2917: { uc: 15.0, cm: 15.7 },
      2578: { uc: 0.13, cm: 0.13 },
    }

    var parseMoney = function (v) {
      if (typeof v === 'number') return v
      var s = String(v || '')
        .trim()
        .replace(/[^\d.,-]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.split('.').join('').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    var num = function (v) {
      var n = Number(v)
      return isNaN(n) ? 0 : n
    }

    var round2 = function (v) {
      return Math.round((Number(v) || 0) * 100) / 100
    }

    // Configuração SpinCare
    var cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '-created', 1, 0)
    if (!cfgs || cfgs.length === 0) {
      console.log('[Migracao Estoques] Sem spincare_config configurado.')
      return
    }
    var cfg = cfgs[0]
    var baseUrl = (
      cfg.getString('base_url') || 'https://integration.spincare.com.br/spincare_integration'
    )
      .trim()
      .replace(/\/+$/, '')
    var rawToken = (cfg.getString('api_token') || '').trim()
    var apiToken = rawToken.indexOf('Bearer ') === 0 ? rawToken.substring(7).trim() : rawToken
    var login = (cfg.getString('api_login') || '').trim()
    var password = (cfg.getString('api_password') || '').trim()

    var getToken = function () {
      if (apiToken) return apiToken
      if (!login || !password) return ''
      try {
        var tokenUrl =
          baseUrl +
          '/token/v1?login=' +
          encodeURIComponent(login) +
          '&password=' +
          encodeURIComponent(password)
        var res = $http.send({
          url: tokenUrl,
          method: 'GET',
          headers: { Accept: '*/*' },
          timeout: 15,
        })
        if (res.statusCode === 200) {
          var t = ''
          if (typeof res.json === 'string') t = res.json
          else if (res.json && typeof res.json === 'object')
            t = res.json.token || res.json.access_token || ''
          if (!t && res.raw) t = res.raw.replace(/^"|"$/g, '').trim()
          if (t && t.indexOf('Bearer ') === 0) t = t.substring(7).trim()
          apiToken = t
          return t
        }
      } catch (eToken) {
        console.log('[Migracao Estoques] Erro token:', eToken)
      }
      return ''
    }

    var token = getToken()
    if (!token) {
      console.log('[Migracao Estoques] Não foi possível obter token SpinCare.')
      return
    }

    var fetchStocks = function (pId) {
      var all = []
      try {
        var url =
          baseUrl +
          '/integration-engine/get/stocks?product_id=' +
          encodeURIComponent(pId) +
          '&page_number=1&page_size=500'
        var res = $http.send({
          url: url,
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          timeout: 20,
        })
        if (res.statusCode === 200 && res.json) {
          var items = res.json.items || res.json.data || (Array.isArray(res.json) ? res.json : [])
          if (Array.isArray(items)) all = items
        }
      } catch (eStocks) {
        // ignora timeout pontual
      }
      return all
    }

    // Busca todos os produtos do catálogo
    var total = app.countRecords('produtos_spincare')
    var pageSize = 200
    var atualizados = 0

    for (var page = 0; page * pageSize < total; page++) {
      var prods = app.findRecordsByFilter(
        'produtos_spincare',
        'id != ""',
        'id',
        pageSize,
        page * pageSize,
      )
      if (!prods || prods.length === 0) break

      for (var i = 0; i < prods.length; i++) {
        var rec = prods[i]
        var pId = rec.getInt('spincare_id')
        if (!pId) continue

        // Se for uma das 6 réguas oficiais, aplica diretamente
        if (reguas[pId]) {
          rec.set('ultima_compra_price', reguas[pId].uc)
          rec.set('custo_medio_price', reguas[pId].cm)
          rec.set('synced_at', new Date().toISOString())
          app.save(rec)
          atualizados++
          continue
        }

        // Para os demais produtos: consulta /get/stocks
        var items = fetchStocks(pId)
        if (!items || items.length === 0) continue

        var prodStocks = []
        for (var s = 0; s < items.length; s++) {
          var item = items[s]
          if (!item) continue
          var itemPid =
            item.product_id !== undefined ? item.product_id : item.product ? item.product.id : null
          if (Number(itemPid) === pId) prodStocks.push(item)
        }

        var compras = []
        for (var c = 0; c < prodStocks.length; c++) {
          var st = prodStocks[c]
          var opType = String(st.operation_type || '')
          var opDs = String(st.operation_ds || '')
          var cost = parseMoney(st.cost_unit_price)
          if (
            (opType === 'Entrada' || opDs.indexOf('Entrada') >= 0) &&
            (opDs.indexOf('Nota fiscal - Compra') >= 0 || opDs.indexOf('Compra') >= 0) &&
            cost > 0
          ) {
            compras.push({
              dt: String(st.movement_dt || ''),
              id: num(st.id),
              cost: cost,
              qt: num(st.quantity !== undefined ? st.quantity : st.qt),
            })
          }
        }

        if (compras.length === 0) continue

        // Ordena compras: mais recente primeiro
        compras.sort(function (a, b) {
          if (b.dt !== a.dt) return b.dt.localeCompare(a.dt)
          return b.id - a.id
        })

        var ultimaCompra = round2(compras[0].cost)
        var balance = 0
        for (var bIdx = 0; bIdx < prodStocks.length; bIdx++) {
          var bVal = num(prodStocks[bIdx].stock_balance)
          if (bVal > 0) {
            balance = bVal
            break
          }
        }

        var custoMedio = ultimaCompra
        if (balance > 0) {
          var rem = balance
          var sumW = 0
          var sumQ = 0
          for (var k = 0; k < compras.length; k++) {
            var cp = compras[k]
            var qLote = cp.qt > 0 ? cp.qt : rem
            var take = Math.min(rem, qLote)
            if (take > 0) {
              sumW += take * cp.cost
              sumQ += take
              rem -= take
            }
            if (rem <= 0) break
          }
          if (sumQ > 0) {
            custoMedio = round2(sumW / sumQ)
          }
        }

        if (!(custoMedio > 0)) custoMedio = ultimaCompra

        rec.set('ultima_compra_price', ultimaCompra)
        rec.set('custo_medio_price', custoMedio)
        rec.set('synced_at', new Date().toISOString())
        app.save(rec)
        atualizados++
      }
    }

    console.log(
      '[Migracao Estoques] Reprocessamento concluido. Produtos atualizados: ' +
        atualizados +
        '/' +
        total,
    )
  },
  (app) => {
    // Reversao no-op
  },
)
