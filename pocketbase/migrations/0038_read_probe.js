/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/spincare/internal-diag-probe',
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 10,
      })
      console.log('[PROBE_RESULT]', res.statusCode, res.raw.slice(0, 3000))
    } catch (err) {
      console.error('[PROBE_ERR]', err)
    }
  },
  (app) => {},
)
