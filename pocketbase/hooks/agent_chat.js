routerAdd(
  'POST',
  '/backend/v1/agent-stream',
  (e) => {
    try {
      const body = e.requestInfo().body || {}
      const userId = e.auth?.id
      if (!userId) {
        return e.unauthorizedError('Autenticação necessária')
      }
      if (!body.message || !body.message.trim()) {
        return e.badRequestError('Mensagem é obrigatória')
      }

      // Função auxiliar de normalização de texto (sem acentos, minúsculo, sem pontuação extra)
      const normalizeText = (text) => {
        if (!text) return ''
        let s = String(text).toLowerCase()
        const map = {
          á: 'a',
          à: 'a',
          ã: 'a',
          â: 'a',
          ä: 'a',
          é: 'e',
          è: 'e',
          ê: 'e',
          ë: 'e',
          í: 'i',
          ì: 'i',
          î: 'i',
          ï: 'i',
          ó: 'o',
          ò: 'o',
          õ: 'o',
          ô: 'o',
          ö: 'o',
          ú: 'u',
          ù: 'u',
          û: 'u',
          ü: 'u',
          ç: 'c',
          ñ: 'n',
        }
        let out = ''
        for (let i = 0; i < s.length; i++) {
          const ch = s[i]
          out += map[ch] !== undefined ? map[ch] : ch
        }
        return out
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Mapeamento de termos / classes clínicas conhecidas para enriquecimento assertivo
      // Cobre variações ortográficas, sinônimos, princípios ativos e classes combinadas
      const CLINICAL_MAPPINGS = [
        {
          triggers: [
            'antiemetico',
            'antiemeticos',
            'anti emetico',
            'anti emeticos',
            'nausea',
            'nauseas',
            'vomito',
            'vomitos',
            'enjoo',
            'enjoos',
            'ondansetrona',
            'metoclopramida',
            'bromoprida',
            'dimenidrinato',
            'betaistina',
            'meclozina',
          ],
          label: 'Antieméticos / Antivertiginosos e Procinéticos',
          matchFn: (med, normNome, normClasse, normDesc) => {
            // 1. Classe direta
            if (normClasse.indexOf('antiemet') !== -1) return true
            // 2. Descrição indicando antiemético
            if (normDesc.indexOf('antiemet') !== -1) return true
            // 3. Fármacos sabidamente antieméticos na base (incluindo Gastrointestinais como Ondansetrona, Metoclopramida, Bromoprida, Domperidona)
            const antiemeticKeys = [
              'ondansetrona',
              'metoclopramida',
              'bromoprida',
              'dimenidrinato',
              'betaistina',
              'meclozina',
              'domperidona',
            ]
            return antiemeticKeys.some((k) => normNome.indexOf(k) !== -1)
          },
        },
        {
          triggers: [
            'opioide',
            'opioides',
            'morfina',
            'tramadol',
            'fentanil',
            'codeina',
            'metadona',
            'buprenorfina',
          ],
          label: 'Analgésicos Opioides',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('opioide') !== -1,
        },
        {
          triggers: [
            'antiterpico',
            'antitetmico',
            'antitemico',
            'antitermico',
            'antitermicos',
            'febre',
            'dor',
            'analgesico',
            'analgesicos',
            'dipirona',
            'paracetamol',
          ],
          label: 'Analgésicos / Antitérmicos',
          matchFn: (med, normNome, normClasse) =>
            normClasse.indexOf('analgesico') !== -1 || normClasse.indexOf('antiterm') !== -1,
        },
        {
          triggers: ['antibiotico', 'antibioticos', 'antibacteriano', 'antibacterianos'],
          label: 'Antibacterianos',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('antibacter') !== -1,
        },
        {
          triggers: [
            'antifungico',
            'antifungicos',
            'micoses',
            'fungo',
            'fungos',
            'fluconazol',
            'nistatina',
          ],
          label: 'Antifúngicos',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('antifung') !== -1,
        },
        {
          triggers: [
            'antihipertensivo',
            'anti hipertensivo',
            'antihipertensivos',
            'pressao',
            'hipertensao',
          ],
          label: 'Anti-hipertensivos',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('hipertens') !== -1,
        },
        {
          triggers: [
            'antiepileptico',
            'antiepilepticos',
            'anticonvulsivante',
            'anticonvulsivantes',
            'crise convulsiva',
            'epilepsia',
          ],
          label: 'Antiepilépticos / Anticonvulsivantes',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('epilept') !== -1,
        },
        {
          triggers: ['antidepressivo', 'antidepressivos', 'depressao'],
          label: 'Antidepressivos',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('depress') !== -1,
        },
        {
          triggers: ['antipsicotico', 'antipsicoticos', 'psicose', 'esquizofrenia'],
          label: 'Antipsicóticos',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('psicot') !== -1,
        },
        {
          triggers: [
            'anticoagulante',
            'anticoagulantes',
            'trombose',
            'enoxaparina',
            'rivaroxabana',
            'apixabana',
          ],
          label: 'Anticoagulantes',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('coagul') !== -1,
        },
        {
          triggers: [
            'gastrointestinal',
            'estomago',
            'refluxo',
            'gastrite',
            'omeprazol',
            'pantoprazol',
            'esomeprazol',
          ],
          label: 'Gastrointestinais',
          matchFn: (med, normNome, normClasse) => normClasse.indexOf('gastro') !== -1,
        },
      ]

      // Recuperação exaustiva e completa de todos os registros de medicamentos da base (sem limite de 30 ou 50)
      // Verificar se o usuário autenticado é médico visitador
      let isMedicoVisitador = false
      try {
        const uRec = e.app.findRecordById('_pb_users_auth_', userId)
        if (uRec && uRec.getString('role') === 'medico_visitador') {
          isMedicoVisitador = true
        }
      } catch (_) {}

      // Recuperação exaustiva e completa de registros de medicamentos da base
      let allMedRecords = []
      try {
        const medFilter = isMedicoVisitador ? "status = 'Padronizado'" : "id != ''"
        allMedRecords = e.app.findRecordsByFilter('medicamentos', medFilter, 'nome', 1000, 0)
      } catch (colErr) {
        // Fallback silencioso caso ocorra algo inesperado
        allMedRecords = []
      }

      const userMsg = body.message.trim()
      const normQuery = normalizeText(userMsg)

      // Identificar se a busca é sobre alguma classe clínica ou medicamento específico
      let matchedItems = []
      let contextCategoryLabel = ''

      // 1. Tentar casar por Mapeamento Clínico
      for (let i = 0; i < CLINICAL_MAPPINGS.length; i++) {
        const item = CLINICAL_MAPPINGS[i]
        const hasTrigger = item.triggers.some((tr) => {
          const normTr = normalizeText(tr)
          return normQuery.indexOf(normTr) !== -1
        })

        if (hasTrigger) {
          contextCategoryLabel = item.label
          matchedItems = allMedRecords.filter((med) => {
            const nNome = normalizeText(med.getString('nome'))
            const nClasse = normalizeText(med.getString('classe'))
            const nDesc = normalizeText(med.getString('descricao'))
            return item.matchFn(med, nNome, nClasse, nDesc)
          })
          break
        }
      }

      // 2. Se não casou via mapeamento clínico predefinido, fazer busca dinâmica ampla por tokens
      if (matchedItems.length === 0 && normQuery.length >= 3) {
        // Tentar casar diretamente em classe ou nome
        const tokens = normQuery
          .split(' ')
          .filter(
            (t) =>
              t.length >= 3 &&
              ![
                'quais',
                'qual',
                'sao',
                'temos',
                'para',
                'com',
                'onde',
                'como',
                'lista',
                'liste',
                'medicamento',
                'medicamentos',
                'remedio',
                'remedios',
              ].includes(t),
          )

        if (tokens.length > 0) {
          matchedItems = allMedRecords.filter((med) => {
            const nNome = normalizeText(med.getString('nome'))
            const nClasse = normalizeText(med.getString('classe'))
            return tokens.some(
              (token) => nClasse.indexOf(token) !== -1 || nNome.indexOf(token) !== -1,
            )
          })
          if (matchedItems.length > 0) {
            contextCategoryLabel = `Busca por "${tokens.join(' ')}"`
          }
        }
      }

      // Se encontramos itens correspondentes na base completa, compomos o bloco de dados exaustivo para o agente
      let augmentedMessage = userMsg
      if (matchedItems.length > 0) {
        const total = matchedItems.length
        const padronizados = matchedItems.filter((m) => m.getString('status') === 'Padronizado')
        const naoPadronizados = matchedItems.filter(
          (m) => m.getString('status') === 'Não Padronizado',
        )
        const inativos = matchedItems.filter((m) => m.getString('status') === 'Inativo')

        let catalogContext = `\n\n[DADOS COMPLETOS DA BASE INSTITUCIONAL HELP VIDA - Total encontrado: ${total} medicamentos para ${contextCategoryLabel}]\n`
        catalogContext += `IMPORTANTE: Você DEVE listar TODOS os medicamentos abaixo sem omitir nenhum, declarando expressamente o número total (${total}).\n`

        if (isMedicoVisitador) {
          catalogContext += `ATENÇÃO: O usuário possui o perfil "Médico Visitador". Ele NUNCA deve ver ou receber informações sobre medicamentos não padronizados ou inativos. Apresente única e exclusivamente os medicamentos padronizados listados abaixo.\n`
        }

        if (padronizados.length > 0) {
          catalogContext += `\n* Padronizados (${padronizados.length} itens):\n`
          padronizados.forEach((m, idx) => {
            catalogContext += `${idx + 1}. ${m.getString('nome')} | Classe: ${m.getString('classe')} | Status: Padronizado${m.getString('descricao') ? ` | ${m.getString('descricao')}` : ''}\n`
          })
        }

        if (!isMedicoVisitador) {
          if (naoPadronizados.length > 0) {
            catalogContext += `\n* Não Padronizados (${naoPadronizados.length} itens - requerem justificativa médica):\n`
            naoPadronizados.forEach((m, idx) => {
              catalogContext += `${idx + 1}. ${m.getString('nome')} | Classe: ${m.getString('classe')} | Status: Não Padronizado\n`
            })
          }

          if (inativos.length > 0) {
            catalogContext += `\n* Inativos (${inativos.length} itens):\n`
            inativos.forEach((m, idx) => {
              catalogContext += `${idx + 1}. ${m.getString('nome')} | Classe: ${m.getString('classe')} | Status: Inativo\n`
            })
          }
        }

        augmentedMessage = `${userMsg}\n${catalogContext}`
      }

      const agent = $ai.agent('helpvida-farmacia')
      const conv = agent.getOrCreateConversation({
        user_id: userId,
        id: body.conversation_id || null,
        title: body.title || 'Consulta Farmácia Help Vida',
      })

      const iter = agent.chat({
        user_id: userId,
        conversation_id: conv.id,
        message: augmentedMessage,
        stream: true,
      })

      e.response.header().set('Content-Type', 'text/event-stream')
      e.response.header().set('Cache-Control', 'no-cache')
      e.response.header().set('X-Conversation-Id', conv.id)
      return $response.stream(e, iter)
    } catch (err) {
      if (err instanceof SkipAiConfigError) {
        return e.json(503, { error: 'Serviço de IA indisponível temporariamente' })
      }
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, {
          error: status >= 500 ? 'Falha no processamento do assistente' : err.message,
        })
      }
      if (err instanceof SkipAiError) {
        const status = err.status || 502
        return e.json(status, { error: status >= 500 ? 'Serviço de IA indisponível' : err.message })
      }
      throw err
    }
  },
  $apis.requireAuth(),
)
