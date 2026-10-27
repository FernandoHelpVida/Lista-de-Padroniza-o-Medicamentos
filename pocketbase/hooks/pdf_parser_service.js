// Endpoint temporário de diagnóstico para inspecionar como as insulinas aparecem no markdown ou como o parser as vê
routerAdd(
  'POST',
  '/backend/v1/pdf/parse-markdown',
  (e) => {
    try {
      const files = e.findUploadedFiles('arquivo')
      if (!files || files.length === 0) {
        return e.badRequestError('Nenhum arquivo PDF foi enviado no campo "arquivo"')
      }

      const file = files[0]
      // Converter para Markdown estruturado usando a engine server-side do Skip Cloud
      const result = $documents.toMarkdown({ file: file })
      const md = result.markdown || ''

      return e.json(200, {
        markdown: md,
        truncated: Boolean(result.truncated),
        filename: file.name,
        size: file.size,
      })
    } catch (err) {
      if (err && err.status === 422) {
        return e.json(422, {
          error: 'O documento PDF não possui camada de texto selecionável ou requer OCR.',
        })
      }
      if (err && err.status === 413) {
        return e.json(413, {
          error: 'O arquivo PDF excede o tamanho limite permitido de 10 MB.',
        })
      }
      return e.json(500, {
        error: 'Falha ao processar o arquivo PDF no servidor: ' + (err?.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)

// Endpoint de sincronização / upsert em lote com transação rápida
routerAdd(
  'POST',
  '/backend/v1/medicamentos/bulk-sync',
  (e) => {
    try {
      const body = e.requestInfo().body || {}
      const items = Array.isArray(body.items) ? body.items : []
      if (items.length === 0) {
        return e.badRequestError('A lista de medicamentos enviada está vazia')
      }

      const medCol = e.app.findCollectionByNameOrId('medicamentos')
      // Carregar todos os medicamentos existentes para indexação rápida por nome normalizado
      const existingRecords = e.app.findRecordsByFilter('medicamentos', "id != ''", 'nome', 5000, 0)

      const normalizeSimple = (str) => {
        if (!str) return ''
        let s = String(str).toLowerCase().trim()
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
        return out.replace(/\s+/g, ' ').trim()
      }

      const existingMap = new Map()
      existingRecords.forEach((rec) => {
        const key = normalizeSimple(rec.getString('nome'))
        if (key) {
          existingMap.set(key, rec)
        }
      })

      let criados = 0
      let atualizados = 0
      let inalterados = 0

      // Executar operações em lote
      items.forEach((item) => {
        let nomeLimpo = (item.nome || '').trim().toUpperCase()
        let classeLimpa = (item.classe || '').trim()
        let statusLimpo = (item.status || 'Padronizado').trim()

        // Rejeitar linhas espúrias/fragmentadas ou cabeçalhos
        if (!nomeLimpo || nomeLimpo.length < 3) return
        if (nomeLimpo.startsWith('||') || nomeLimpo.includes('ANTIBACTERIANO ANTIBACTERIANO'))
          return
        if (/^(NOME DO MEDICAMENTO|MEDICAMENTO|CLASSE|DEFINICAO)$/i.test(nomeLimpo)) return

        // Sanitização contra itens monstros:
        if (nomeLimpo.length > 120) {
          const compMatches = (nomeLimpo.match(/\b(COMPRIMIDO|CAPSULA|AMPOLA|FRASCO)\b/g) || [])
            .length
          if (compMatches >= 2) return
        }
        const compMatches2 = (nomeLimpo.match(/\bCOMPRIMIDO\b/g) || []).length
        if (compMatches2 >= 2) return

        const key = normalizeSimple(nomeLimpo)
        if (!key) return

        const existing = existingMap.get(key)
        if (existing) {
          // Já existe no catálogo
          const curStatus = existing.getString('status')
          const curClasse = existing.getString('classe')
          const curDesc = existing.getString('descricao')
          const curObs = existing.getString('observacao')

          let hasChanges = false
          if (curStatus !== statusLimpo) {
            existing.set('status', statusLimpo)
            hasChanges = true
          }
          if (classeLimpa && curClasse !== classeLimpa) {
            existing.set('classe', classeLimpa)
            hasChanges = true
          }
          if (item.observacao && !curObs) {
            existing.set('observacao', item.observacao)
            hasChanges = true
          }
          if (item.descricao && !curDesc) {
            existing.set('descricao', item.descricao)
            hasChanges = true
          }

          if (hasChanges) {
            e.app.save(existing)
            atualizados++
          } else {
            inalterados++
          }
        } else {
          // Criar novo registro
          const newRec = new Record(medCol)
          newRec.set('nome', nomeLimpo)
          newRec.set('classe', classeLimpa)
          newRec.set('status', statusLimpo)
          newRec.set('descricao', item.descricao || '')
          newRec.set('observacao', item.observacao || '')
          e.app.save(newRec)
          // Adicionar no map para evitar duplicados no mesmo payload
          existingMap.set(key, newRec)
          criados++
        }
      })

      // Registrar no histórico de importações se solicitado
      if (body.record_history) {
        try {
          const histCol = e.app.findCollectionByNameOrId('historico_importacoes')
          const histRec = new Record(histCol)
          histRec.set('nome_arquivo', body.file_name || 'importacao_catalogo.pdf')
          histRec.set('total_itens', items.length)
          histRec.set('criados', criados)
          histRec.set('atualizados', atualizados)
          histRec.set('inalterados', inalterados)
          histRec.set('ignorados', Number(body.ignorados || 0))
          if (e.auth && e.auth.id) {
            histRec.set('usuario', e.auth.id)
          }
          e.app.save(histRec)
        } catch (hErr) {
          // Log silencioso sem falhar o sync principal
        }
      }

      return e.json(200, {
        success: true,
        total_processados: items.length,
        criados,
        atualizados,
        inalterados,
      })
    } catch (err) {
      return e.json(500, {
        error: 'Erro ao processar sincronização de medicamentos: ' + (err?.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
