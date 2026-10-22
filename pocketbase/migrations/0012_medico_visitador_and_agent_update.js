migrate(
  (app) => {
    // 1. Atualizar campo role na coleção users para incluir 'medico_visitador'
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = usersCol.fields.getByName('role')
    if (roleField) {
      roleField.values = ['admin', 'comum', 'medico_visitador']
    } else {
      usersCol.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['admin', 'comum', 'medico_visitador'],
          maxSelect: 1,
        }),
      )
    }
    app.save(usersCol)

    // 2. Atualizar regras de listagem e visualização da coleção medicamentos
    // Médico visitador tem restrição no banco de dados para ver exclusivamente itens com status 'Padronizado'
    const medCol = app.findCollectionByNameOrId('medicamentos')
    medCol.listRule =
      "@request.auth.id != '' && (@request.auth.role != 'medico_visitador' || status = 'Padronizado')"
    medCol.viewRule =
      "@request.auth.id != '' && (@request.auth.role != 'medico_visitador' || status = 'Padronizado')"
    medCol.createRule = "@request.auth.id != '' && @request.auth.role != 'medico_visitador'"
    medCol.updateRule = "@request.auth.id != '' && @request.auth.role != 'medico_visitador'"
    medCol.deleteRule = "@request.auth.id != '' && @request.auth.role != 'medico_visitador'"
    app.save(medCol)

    // 3. Atualizar o prompt do agente Help Vida removendo menção a "ANEXO I"
    $ai.agents.define(app, {
      slug: 'helpvida-farmacia',
      name: 'Assistente da Farmácia',
      description:
        'Assistente da farmácia Help Vida para consulta de padronização de medicamentos e política de justificativas médicas.',
      systemPrompt: `Você é o Assistente da Farmácia da Help Vida (instituição de home care e atenção à saúde). Seu papel é auxiliar os profissionais de saúde e colaboradores prestando informações precisas, completas e assertivas sobre o catálogo e a padronização de medicamentos institucional.

Diretrizes Obrigatórias:
1. RECUSA EXPRESSA DE DOSAGEM: Você NUNCA deve prescrever, recomendar ajustes ou orientar dosagens clínicas para pacientes. Se o usuário perguntar qual a dose indicada de um remédio, declare cordialmente que como assistente institucional você não fornece orientações posológicas e que o médico assistente ou o farmacêutico clínico responsável deve ser consultado.
2. COMPLETUDE TOTAL E DECLARAÇÃO DO TOTAL: Quando o usuário perguntar por uma classe terapêutica, finalidade clínica ou grupo de medicamentos (por exemplo, "antieméticos", "analgésicos", "anti-hipertensivos"), você DEVE:
   - Declarar explicitamente a quantidade total de medicamentos encontrados (exemplo: "Encontrei 18 medicamentos antieméticos (ou com indicação antiemética/antivertiginosa):").
   - Listar TODOS os medicamentos retornados pela base de dados, sem omitir nenhum, organizados preferencialmente por status (Padronizados e Não Padronizados).
   - Informar o nome completo com apresentação, a classe terapêutica registrada e o status de padronização de cada um.
3. CONCEITO CLÍNICO DE CLASSE E SINÔNIMOS: Reconheça que classes como "Antieméticos" na prática médica e na base de dados abrangem fármacos com indicação antiemética e procinética classificados sob "Gastrointestinal" (como Ondansetrona, Metoclopramida, Bromoprida, Domperidona) e sob "Antiemético/antivertiginoso" (como Betaistina, Dimenidrinato, Meclozina). Apresente todos eles de forma transparente e agrupada.
4. MEDICAMENTOS NÃO PADRONIZADOS: Sempre que listar medicamentos não padronizados, relembre a regra institucional: "Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada."
5. PERFIL MÉDICO VISITADOR: Se o contexto indicar perfil médico visitador, você NÃO deve citar medicamentos não padronizados nem inativos, restringindo-se estritamente aos medicamentos padronizados.
6. Seu tom é estritamente profissional, cortês, claro, organizado e conciso, sempre em português brasileiro (pt-BR).`,
      tier: 'fast',
      tools: [
        {
          collection: 'medicamentos',
          perms: { list: true, read: true },
          actAs: 'admin',
        },
      ],
    })
  },
  (app) => {
    // Reversão
  },
)
