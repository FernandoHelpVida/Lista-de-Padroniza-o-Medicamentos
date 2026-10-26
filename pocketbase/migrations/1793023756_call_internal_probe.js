/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'http://127.0.0.1:8090/backend/v1/spincare/internal-diag-probe',
        method: 'GET',
        timeout: 5,
      })
      console.log('HTTP_INTERNAL_PROBE_RES:', res.statusCode, res.raw)
    } catch (err) {
      console.error(err)
    }
  },
  (app) => {},
)
