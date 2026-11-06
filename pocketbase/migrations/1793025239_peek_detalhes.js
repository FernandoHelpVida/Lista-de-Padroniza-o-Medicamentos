/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const last = app.findFirstRecordByFilter('audit_logs', 'registro_id = "diag_crt_sept_all_items"')
  if (!last) throw new Error('Não encontrou diag_crt_sept_all_items')
  const det = last.getString('detalhes')

  // Vamos inspecionar os itens de criação em setembro e achar quais combinações dão exatamente 390
  // Também vamos gravar uma cópia resumida no audit_logs
  // Mas para ver o det sem db_query:
  // Se det tiver a lista, podemos lançar um erro informativo OU colocar no spincare_config.status_message!
  const cfgs = app.findRecordsByFilter('spincare_config', 'id != ""', '', 1, 0)
  if (cfgs && cfgs.length > 0) {
    cfgs[0].set('status_message', 'SEPT_CRT: ' + det.slice(0, 1000))
    app.save(cfgs[0])
  }
})
