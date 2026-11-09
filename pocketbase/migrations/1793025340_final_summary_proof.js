/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const coll = app.findCollectionByNameOrId('audit_logs')

      // Pegar as 16 compras de 2942
      const purchases = [
        { id: 910164, dt: '2026-06-25 15:37:37', qt: 100, cost: 0.3058 },
        { id: 905288, dt: '2026-06-18 10:20:10', qt: 100, cost: 0.29 },
        { id: 770957, dt: '2025-12-10 14:15:00', qt: 100, cost: 0.29 },
        { id: 761374, dt: '2025-11-28 09:12:00', qt: 40, cost: 0.2425 },
        { id: 668379, dt: '2025-07-22 11:30:00', qt: 100, cost: 0.2995 },
        { id: 616072, dt: '2025-05-15 16:40:00', qt: 120, cost: 0.2316 },
        { id: 562407, dt: '2025-03-01 10:00:00', qt: 140, cost: 0.2298 },
        { id: 508670, dt: '2024-11-20 14:00:00', qt: 250, cost: 0.38 },
        { id: 482985, dt: '2024-10-10 11:00:00', qt: 120, cost: 0.24 },
        { id: 469767, dt: '2024-09-18 08:30:00', qt: 100, cost: 1.0 },
        { id: 361292, dt: '2024-04-12 15:00:00', qt: 180, cost: 0.41 },
        { id: 359088, dt: '2024-04-10 12:00:00', qt: 180, cost: 0.41 },
        { id: 337176, dt: '2024-03-05 10:00:00', qt: 80, cost: 0.26 },
        { id: 309731, dt: '2024-01-22 14:00:00', qt: 120, cost: 0.26 },
        { id: 290955, dt: '2023-12-15 09:00:00', qt: 100, cost: 0.94 },
        { id: 223438, dt: '2023-09-01 10:00:00', qt: 20, cost: 0.96 },
      ]

      // Saldo disponível: 148
      // Lote 1 (910164): 100 un a 0.3058 = 30.58
      // Lote 2 (905288): 48 un a 0.29 = 13.92
      // Total: 148 un, soma = 44.50
      // Média: 44.50 / 148 = 0.300675... -> arredondado 0.30!

      // Se fosse 1682 un (148 + 1534 empenhado):
      // 100*0.3058 + 100*0.29 + 100*0.29 + 40*0.2425 + 100*0.2995 + 120*0.2316 + 140*0.2298 + 250*0.38 + 120*0.24 + 100*1.0 + 180*0.41 + 180*0.41 + 80*0.26 + 72*0.26 = 599.11 / 1682 = 0.3562 -> arredondado 0.36!

      const r = new Record(coll)
      r.set('colecao', 'produtos_spincare')
      r.set('registro_id', 'diag_final_summary_2942')
      r.set('acao', 'FINAL_SUMMARY')
      r.set(
        'detalhes',
        JSON.stringify({
          prod_2942_disp_148_cm: (44.5 / 148).toFixed(4), // '0.3007' -> 0.30
          prod_2942_pos_1682_cm: (599.11 / 1682).toFixed(4), // '0.3562' -> 0.36
          explanation:
            '1682 resulta exatamente em 0.3562 (que no banco estava 0.3568), que arredonda para 0.36 na imagem 2 da tarefa! Enquanto 148 (saldo disponível) resulta exatamente em 0.3007 -> 0.30, que é o Custo Médio na tela do produto no SpinCare (imagem 1)!',
        }),
      )
      app.save(r)
    } catch (_) {}
  },
  (app) => {},
)
