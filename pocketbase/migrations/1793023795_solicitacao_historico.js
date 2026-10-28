migrate(
  (app) => {
    // 1. Criar coleção solicitacao_historico se não existir
    let historicoCol
    try {
      historicoCol = app.findCollectionByNameOrId('solicitacao_historico')
    } catch (_) {
      historicoCol = null
    }

    const solicitacoesCol = app.findCollectionByNameOrId('solicitacoes')

    if (!historicoCol) {
      historicoCol = new Collection({
        name: 'solicitacao_historico',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (solicitacao.solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')",
        viewRule:
          "@request.auth.id != '' && (solicitacao.solicitante = @request.auth.id || @request.auth.email = 'fernandofernandes@helpvida.com.br' || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != ''",
        updateRule: null, // histórico imutável: updates bloqueados
        deleteRule: null, // histórico imutável: deletes bloqueados
        fields: [
          {
            name: 'solicitacao',
            type: 'relation',
            required: true,
            collectionId: solicitacoesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'status_anterior',
            type: 'text',
          },
          {
            name: 'status_novo',
            type: 'text',
            required: true,
          },
          {
            name: 'acao',
            type: 'text',
            required: true,
          },
          {
            name: 'autor',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'autor_nome',
            type: 'text',
          },
          {
            name: 'autor_papel',
            type: 'text',
          },
          {
            name: 'parecer',
            type: 'text',
          },
          {
            name: 'detalhes',
            type: 'text',
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_hist_solic ON solicitacao_historico (solicitacao)',
          'CREATE INDEX idx_hist_autor ON solicitacao_historico (autor)',
          'CREATE INDEX idx_hist_created ON solicitacao_historico (created DESC)',
        ],
      })
      app.save(historicoCol)
    }

    // 2. Backfill retroativo idempotente:
    // Se existirem solicitações sem nenhum histórico registrado, criar eventos de criação e decisões passadas
    try {
      const histSavedCol = app.findCollectionByNameOrId('solicitacao_historico')
      const solicitacoes = app.findAllRecords('solicitacoes')

      for (let i = 0; i < solicitacoes.length; i++) {
        const solic = solicitacoes[i]
        const countExisting = app.findRecordsByFilter(
          'solicitacao_historico',
          `solicitacao = '${solic.id}'`,
          '-created',
          1,
          0,
        )

        if (countExisting && countExisting.length > 0) {
          // Já tem histórico, não duplicar
          continue
        }

        // Buscar autor solicitante
        let solUser = null
        const solId = solic.getString('solicitante')
        if (solId) {
          try {
            solUser = app.findRecordById('_pb_users_auth_', solId)
          } catch (_) {}
        }

        // Evento 1: Criação da solicitação
        const medNome =
          solic.getString('nome_medicamento_novo') ||
          (() => {
            const medId = solic.getString('medicamento')
            if (medId) {
              try {
                return app.findRecordById('medicamentos', medId).getString('nome')
              } catch (_) {}
            }
            return 'Medicamento não padronizado'
          })()

        const recCriacao = new Record(histSavedCol)
        recCriacao.set('solicitacao', solic.id)
        recCriacao.set('status_anterior', '')
        recCriacao.set('status_novo', 'Pendente')
        recCriacao.set('acao', 'SOLICITACAO_CRIADA')
        if (solUser) {
          recCriacao.set('autor', solUser.id)
          recCriacao.set(
            'autor_nome',
            solUser.getString('name') || solUser.getString('email') || '',
          )
          recCriacao.set('autor_papel', solUser.getString('role') || 'médico')
        }
        recCriacao.set('parecer', '')
        recCriacao.set('detalhes', 'Solicitação de medicamento criada: ' + medNome)
        app.save(recCriacao)

        // Evento 2: Se o status atual não for Pendente (ex.: Aprovada, Negada, Atendida), registrar decisão
        const currentStatus = solic.getString('status')
        if (currentStatus && currentStatus !== 'Pendente') {
          let avaliadorUser = null
          const avalId = solic.getString('avaliador')
          if (avalId) {
            try {
              avaliadorUser = app.findRecordById('_pb_users_auth_', avalId)
            } catch (_) {}
          }

          const recDecisao = new Record(histSavedCol)
          recDecisao.set('solicitacao', solic.id)
          recDecisao.set('status_anterior', 'Pendente')
          recDecisao.set('status_novo', currentStatus)

          let acaoDecisao = 'STATUS_ALTERADO'
          if (currentStatus === 'Aprovada') acaoDecisao = 'SOLICITACAO_APROVADA'
          else if (currentStatus === 'Negada') acaoDecisao = 'SOLICITACAO_NEGADA'
          else if (currentStatus === 'Atendida') acaoDecisao = 'SOLICITACAO_ATENDIDA'

          recDecisao.set('acao', acaoDecisao)
          if (avaliadorUser) {
            recDecisao.set('autor', avaliadorUser.id)
            recDecisao.set(
              'autor_nome',
              avaliadorUser.getString('name') || avaliadorUser.getString('email') || '',
            )
            recDecisao.set('autor_papel', avaliadorUser.getString('role') || 'farmacêutica')
          } else if (solUser) {
            recDecisao.set('autor', solUser.id)
            recDecisao.set(
              'autor_nome',
              solUser.getString('name') || solUser.getString('email') || '',
            )
            recDecisao.set('autor_papel', solUser.getString('role') || 'médico')
          }
          recDecisao.set('parecer', solic.getString('resposta_comissao') || '')
          recDecisao.set(
            'detalhes',
            'Decisão registrada: ' +
              currentStatus +
              (solic.getString('resposta_comissao')
                ? ' — Parecer: ' + solic.getString('resposta_comissao')
                : ''),
          )
          app.save(recDecisao)
        }
      }
    } catch (err) {
      console.log('Aviso no backfill retroativo de solicitacao_historico:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('solicitacao_historico')
      if (col) {
        app.delete(col)
      }
    } catch (_) {}
  },
)
