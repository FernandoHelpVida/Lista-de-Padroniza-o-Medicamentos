/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  try {
    const res = $http.send({
      url: 'http://127.0.0.1:8090/backend/v1/admin/spincare/products/backfill-stocks?key=helpvida_backfill_2026&limit=3000',
      method: 'GET',
      timeout: 10,
    })
    console.log('[Trigger Backfill] Status HTTP:', res.statusCode, 'Body:', (res.raw || '').substring(0, 150))
  } catch (err) {
    console.log('[Trigger Backfill] Disparado com erro ou timeout esperado (assíncrono):', err)
  }
}, (app) => {})
