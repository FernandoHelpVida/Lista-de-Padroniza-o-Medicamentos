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
      const body = res.json || JSON.parse(res.raw || '{}')
      const rawMsg = body.msg || '{}'
      const parsed = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg

      // Cria usuários fictícios ou registros de teste em tabela com campos abertos se necessário,
      // ou simplesmente salva em audit_logs com texto curto
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      const r1 = new Record(auditCol)
      r1.set('colecao', 'spincare_middleware')
      r1.set('registro_id', 'diag_view_p75147_short')
      r1.set('acao', 'P75147_SUMMARY')
      r1.set('usuario_nome', parsed.patient_name || '')
      r1.set('status_novo', parsed.prescNum || '')
      r1.set(
        'detalhes',
        'Presc: ' +
          parsed.prescNum +
          ' | Med: ' +
          parsed.prescritora +
          ' | Vig: ' +
          parsed.initial_dt +
          ' ate ' +
          parsed.final_dt +
          ' | Criado: ' +
          parsed.creation_dt +
          ' | Itens: ' +
          JSON.stringify(parsed.items || []).slice(0, 500),
      )
      app.save(r1)
    } catch (err) {}
  },
  (app) => {},
)
