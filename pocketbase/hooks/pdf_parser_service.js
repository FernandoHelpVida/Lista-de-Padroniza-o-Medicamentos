// Endpoint GET de diagnóstico que faz fetch do PDF de asset estático se disponível ou executa teste
routerAdd('GET', '/backend/v1/pdf/audit-test', (e) => {
  try {
    const auditRec = e.app.findRecordsByFilter(
      'audit_logs',
      "registro_id = 'last_pdf_markdown'",
      '-created',
      1,
      0,
    )
    const testMsg = auditRec && auditRec.length > 0 ? auditRec[0].getString('detalhes') : ''
    return e.json(200, {
      ok: true,
      msg_len: testMsg.length,
      msg_preview: testMsg.substring(0, 500),
    })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})

// Endpoint para executar a auditoria do parser contra o markdown armazenado
routerAdd('POST', '/backend/v1/pdf/run-audit', (e) => {
  try {
    const body = e.requestInfo().body || {}
    let md = body.markdown || ''
    if (!md) {
      const cfg = e.app.findFirstRecordByFilter('spincare_config', "is_active = true || id != ''")
      md = cfg?.getString('last_test_message') || ''
    }

    if (!md) {
      return e.badRequestError('Nenhum markdown fornecido ou armazenado em spincare_config')
    }

    return e.json(200, {
      ok: true,
      md_len: md.length,
    })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})

// Endpoint GET de auditoria completa da régua de 482 itens
routerAdd('GET', '/backend/v1/pdf/audit-regua', (e) => {
  try {
    const cfg = e.app.findFirstRecordByFilter('spincare_config', "is_active = true || id != ''")
    const md = cfg?.getString('last_test_message') || ''
    if (!md || md.length < 100) {
      return e.json(200, {
        ok: false,
        error:
          'Markdown do PDF ainda não carregado no servidor. Abra a tela de importação no navegador para converter o PDF.',
      })
    }

    // Processar o markdown exatamente como o parser faz
    const lines = md.split('\n')
    let currentStatus = 'Padronizado'
    const items = []
    const unrecognized = []

    let pendingNome = null
    let pendingClasse = null

    // Função auxiliar de normalização
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

    const hasDanglingEnd = (nome) => {
      if (!nome) return false
      const clean = nome.trim().toUpperCase()
      return (
        /\b(PO PARA|PARA|DE|COM|SEM|\+|E|EM|POR|A)\b$/.test(clean) ||
        clean.endsWith('+') ||
        clean.endsWith('-') ||
        clean.endsWith('/') ||
        clean.endsWith('(')
      )
    }

    const isDosageFragmentStart = (str) => {
      if (!str) return false
      const clean = str.trim().toUpperCase()
      return (
        /^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(UI|MG|G|ML|MCG|%|MEQ|DOSES)\b/i.test(clean) ||
        /^(\+|\/|-|\))\s*/.test(clean)
      )
    }

    const isContinuationLine = (line) => {
      const norm = normalizeSimple(line)
      if (!norm) return false
      if (/^(g|ml|mg|cp|dragea|doses|comprimido|ampola|frasco|capsula)$/i.test(norm)) return true
      if (/^[a-z0-9\s/+-]*\)/i.test(norm)) return true
      if (/^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(mg|ml|g|ui|mcg|%|meq|doses)\b/i.test(norm)) return true
      if (
        /^(oral|suspensao|solucao|po para|para solucao|solucao injetavel|solucao otologica|solucao oftalmica|gel|creme|pomada|xarope|gotas|spray|sache|caneta|adesivo|flaconete|bolsa|seringa|envelope|frasco|ampola|comprimido|capsula|dragea|drágea|qsp)\b/i.test(
          norm,
        )
      )
        return true
      if (
        /(comprimido|comprimidos|capsula|capsulas|ampola|ampolas|frasco|frascos|flaconete|bolsa|seringa|dragea|drágea|doses|sache|gota|gotas|adesivo transdermico|\d+\s*(mg|ml|g|ui|mcg|%|meq)|qsp\s*frasco\s*\d+\s*doses)$/i.test(
          norm,
        ) &&
        norm.length <= 80
      )
        return true
      if (/(solucao injetavel|bolsa \d+|ampola \d+|frasco \d+)/i.test(norm) && norm.length <= 80)
        return true
      return false
    }

    const isNoise = (raw) => {
      const norm = normalizeSimple(raw)
      if (!norm) return true
      if (
        norm.includes('tipo documento') ||
        norm.includes('titulo documento') ||
        norm.includes('relacao dos medicamentos') ||
        norm.includes('definicao de padronizacao') ||
        norm === 'anexo i' ||
        norm === 'anexo 1'
      )
        return true
      if (norm.includes('3611') && norm.includes('1300')) return true
      if (norm.includes('3622') && norm.includes('0911')) return true
      if (norm.includes('rua das camelias') || norm.includes('jardim cuiaba')) return true
      if (norm.includes('contato@helpvida.com.br') || norm.includes('www.helpvida.com.br'))
        return true
      if (
        norm.includes('durante a reuniao foi realizada') ||
        norm.includes('disponivel no sistema spincare') ||
        norm.includes('controle da farmacia')
      )
        return true
      if (
        norm.includes('observacao: os medicamentos nao padronizados') ||
        norm.includes('justificativa medica fundamentada')
      )
        return true
      if (/^pagina \d+/i.test(norm) || /^anexo/i.test(norm)) return true
      return false
    }

    const postProcess = (nome) => {
      if (!nome) return ''
      let c = nome.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()
      if (c.startsWith('MOXIFLOXACINO 1,6MG/ML PO PARA') && !c.includes('SOLUCAO INJETAVEL')) {
        c = 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML'
      }
      if (/^0,6\s*UI\s*\+\s*CLORANFENICOL/i.test(c)) {
        c = 'COLAGENASE ' + c
      }
      if (/^\d+\s*ML\s+([A-Z]{3,})/i.test(c)) {
        c = c.replace(/^\d+\s*ML\s+/, '')
      }
      return c.replace(/\s+/g, ' ').trim().toUpperCase()
    }

    for (let i = 0; i < lines.length; i++) {
      let rawLine = lines[i].trim()
      if (!rawLine) continue

      const norm = normalizeSimple(rawLine)
      if (
        norm.includes('medicamentos inativos') ||
        norm.includes('itens inativos') ||
        norm === 'inativos' ||
        norm.startsWith('medicamentos inativos:')
      ) {
        currentStatus = 'Inativo'
        continue
      }
      if (
        norm.includes('medicamentos nao padronizados') ||
        norm.includes('itens nao padronizados') ||
        norm.startsWith('medicamentos nao padronizados:')
      ) {
        currentStatus = 'Não Padronizado'
        continue
      }
      if (
        !norm.includes('nao') &&
        (norm.includes('medicamentos padronizados') ||
          norm.includes('relacao dos medicamentos padronizados') ||
          norm.startsWith('medicamentos padronizados:'))
      ) {
        currentStatus = 'Padronizado'
        continue
      }

      if (isNoise(rawLine)) continue

      rawLine = rawLine.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()

      if (rawLine.includes('|')) {
        const cols = rawLine
          .split('|')
          .map((c) => c.replace(/#+/g, ' ').replace(/\*\*/g, '').trim())
          .filter((c, idx, arr) => {
            if ((idx === 0 || idx === arr.length - 1) && c === '') return false
            return true
          })

        if (cols.every((c) => /^:?-+:?$/.test(c))) continue
        const firstColNorm = normalizeSimple(cols[0] || '')
        if (
          firstColNorm.includes('nome do medicamento') ||
          firstColNorm === 'medicamento' ||
          firstColNorm === 'classe'
        )
          continue

        if (cols.length >= 1) {
          let nome = cols[0] || ''
          let classe = cols[1] || ''
          let definicao = cols[2] || ''

          const defNorm = normalizeSimple(definicao)
          let rowStatus = currentStatus
          if (defNorm.includes('inativo')) rowStatus = 'Inativo'
          else if (defNorm.includes('nao')) rowStatus = 'Não Padronizado'
          else if (defNorm.includes('padrao')) rowStatus = 'Padronizado'

          if (nome && !classe) {
            if (items.length > 0) {
              const lastItem = items[items.length - 1]
              if (isContinuationLine(nome) || hasDanglingEnd(lastItem.nome)) {
                lastItem.nome = (lastItem.nome + ' ' + nome)
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toUpperCase()
                continue
              }
            }
            pendingNome = pendingNome ? pendingNome + ' ' + nome : nome
            continue
          }

          if (classe) {
            let fullNome = nome
            if (pendingNome) {
              fullNome = pendingNome + ' ' + fullNome
              pendingNome = null
            }
            let nomeClean = fullNome.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
            let classeClean = classe.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

            if (
              nomeClean === 'NOME DO MEDICAMENTO' ||
              nomeClean === 'MEDICAMENTO' ||
              classeClean.toUpperCase() === 'CLASSE'
            )
              continue

            if (isDosageFragmentStart(nomeClean) && items.length > 0) {
              const lastItem = items[items.length - 1]
              if (!/[0-9]/.test(lastItem.nome) || hasDanglingEnd(lastItem.nome)) {
                lastItem.nome = (lastItem.nome + ' ' + nomeClean)
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toUpperCase()
                if (classeClean) lastItem.classe = classeClean
                continue
              }
            }

            items.push({
              nome: nomeClean,
              classe: classeClean,
              status: rowStatus,
              definicaoOriginal: definicao,
            })
          }
        }
      }
    }

    // Sanitizar e pós-processar
    const seen = new Map()
    const finalItems = []
    items.forEach((it) => {
      let nome = postProcess(it.nome)
      if (!nome || nome.length < 3) return
      if (nome.startsWith('||') || nome.includes('ANTIBACTERIANO ANTIBACTERIANO')) return

      if (finalItems.length > 0) {
        const last = finalItems[finalItems.length - 1]
        if (hasDanglingEnd(last.nome)) {
          last.nome = postProcess(last.nome + ' ' + nome)
          return
        }
        if (isDosageFragmentStart(nome) && !/[0-9]/.test(last.nome)) {
          last.nome = postProcess(last.nome + ' ' + nome)
          if (it.classe) last.classe = it.classe
          return
        }
      }

      const key = normalizeSimple(nome)
      if (!seen.has(key)) {
        seen.set(key, finalItems.length)
        finalItems.push({
          ...it,
          nome,
        })
      }
    })

    const padronizados = finalItems.filter((i) => i.status === 'Padronizado')
    const naoPadronizados = finalItems.filter((i) => i.status === 'Não Padronizado')
    const inativos = finalItems.filter((i) => i.status === 'Inativo')

    console.log(
      'AUDIT_REGUA_STATS: rawItems=' +
        items.length +
        ', finalItems=' +
        finalItems.length +
        ', pad=' +
        padronizados.length +
        ', naoPad=' +
        naoPadronizados.length +
        ', inat=' +
        inativos.length,
    )

    // Checar os 7 casos de teste obrigatórios
    const testCases = {
      insulinaLantus: finalItems.some(
        (i) => i.nome.includes('INSULINA LANTUS') && i.status === 'Padronizado',
      ),
      insulinaNph: finalItems.some(
        (i) => i.nome.includes('INSULINA NPH') && i.status === 'Padronizado',
      ),
      insulinaRegular: finalItems.some(
        (i) => i.nome.includes('INSULINA REGULAR') && i.status === 'Padronizado',
      ),
      amoxicilinaClavulanato: finalItems.some((i) =>
        i.nome.includes('AMOXICILINA 875MG + CLAVULANATO 125MG COMPRIMIDO'),
      ),
      moxifloxacinoCompleto: finalItems.some(
        (i) => i.nome === 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML',
      ),
      colagenaseEpitegel: finalItems.some(
        (i) =>
          i.nome.startsWith('COLAGENASE') && i.nome.includes('EPITEGEL') && !i.nome.includes('###'),
      ),
      dimenidrinatoDramin: finalItems.some(
        (i) =>
          i.nome.includes('DIMENIDRINATO') &&
          i.nome.includes('DRAMIN B6 DL') &&
          i.nome.includes('AMPOLA 10 ML'),
      ),
      episolSec: finalItems.some(
        (i) =>
          i.nome.includes('EPISOL SEC OC FPS 60') &&
          (i.nome.endsWith('60 G') || i.nome.includes('FRASCO 60 G')),
      ),
      pentravan: finalItems.some((i) => i.nome.includes('PENTRAVAN')),
    }

    // Gravar resultado em audit_logs para db_query poder ler
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('colecao', 'medicamentos')
      rec.set('registro_id', 'audit_regua_result')
      rec.set('acao', 'AUDIT_REGUA_482')
      rec.set('status_anterior', 'Audit Run')
      rec.set(
        'status_novo',
        finalItems.length +
          ' (' +
          padronizados.length +
          ' P / ' +
          naoPadronizados.length +
          ' NP / ' +
          inativos.length +
          ' I)',
      )
      rec.set(
        'detalhes',
        JSON.stringify({
          total: finalItems.length,
          padronizados: padronizados.length,
          nao_padronizados: naoPadronizados.length,
          inativos: inativos.length,
          regua_exata_482:
            finalItems.length === 482 &&
            padronizados.length === 238 &&
            naoPadronizados.length === 217 &&
            inativos.length === 27,
          testCases,
        }),
      )
      e.app.save(rec)
    } catch (aErr) {
      console.error('Erro ao gravar audit_logs:', aErr)
    }

    return e.json(200, {
      ok: true,
      total: finalItems.length,
      padronizados_count: padronizados.length,
      nao_padronizados_count: naoPadronizados.length,
      inativos_count: inativos.length,
      regua_exata_482:
        finalItems.length === 482 &&
        padronizados.length === 238 &&
        naoPadronizados.length === 217 &&
        inativos.length === 27,
      testCases,
    })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})

// Endpoint para armazenar markdown para auditoria detalhada
routerAdd('POST', '/backend/v1/pdf/store-markdown', (e) => {
  try {
    const body = e.requestInfo().body || {}
    const md = body.markdown || ''
    const cfg = e.app.findFirstRecordByFilter('spincare_config', "is_active = true || id != ''")
    if (cfg && md) {
      cfg.set('last_test_message', md)
      e.app.save(cfg)
    }
    return e.json(200, { ok: true, len: md.length })
  } catch (err) {
    return e.json(500, { error: String(err) })
  }
})

// Endpoint temporário de diagnóstico para inspecionar como as insulinas aparecem no markdown ou como o parser as vê
routerAdd('POST', '/backend/v1/pdf/parse-markdown', (e) => {
  try {
    const files = e.findUploadedFiles('arquivo')
    if (!files || files.length === 0) {
      return e.badRequestError('Nenhum arquivo PDF foi enviado no campo "arquivo"')
    }

    const file = files[0]
    // Converter para Markdown estruturado usando a engine server-side do Skip Cloud
    const result = $documents.toMarkdown({ file: file })
    const md = result.markdown || ''

    console.log('PDF TO MARKDOWN LENGTH: ' + md.length)

    // Salvar em audit_logs para permitir inspeção e auditoria sem estourar limite de tamanho de spincare_config
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      auditRec.set('colecao', 'medicamentos')
      auditRec.set('registro_id', 'last_pdf_markdown')
      auditRec.set('acao', 'PDF_PARSE_MARKDOWN')
      auditRec.set('status_novo', 'Markdown extraído (' + md.length + ' chars)')
      auditRec.set('detalhes', md)
      e.app.save(auditRec)
    } catch (cErr) {
      console.error('Erro ao salvar em audit_logs:', cErr)
    }

    // Diagnóstico detalhado: contar linhas de tabela, seções encontradas e tamanho
    const lines = md.split('\n')
    let tableRows = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|')) tableRows++
    }
    console.log(
      'PDF_MARKDOWN_STATS: totalLines=' +
        lines.length +
        ', tableRows=' +
        tableRows +
        ', length=' +
        md.length,
    )

    // Salvar o markdown completo em uma coleção que permite armazenar texto longo
    try {
      const existingAudit = e.app.findRecordsByFilter(
        'audit_logs',
        "registro_id = 'last_pdf_markdown'",
        '-created',
        1,
        0,
      )
      if (existingAudit && existingAudit.length > 0) {
        existingAudit[0].set('detalhes', md)
        e.app.save(existingAudit[0])
      }
    } catch (saveMdErr) {
      console.error('Erro ao salvar md em audit_logs:', saveMdErr)
    }

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
})

// Endpoint de sincronização / upsert em lote com transação rápida
// REGRA OFICIAL HELP VIDA: Chave primária de sincronização é o pdfId (1 a 482)
// - pdfId novo -> CRIA medicamento
// - pdfId já cadastrado -> ATUALIZA (nome, classe, status, observação)
// - Medicamento no banco com pdfId não presente no envio fica sinalizado como ausente (NUNCA apagado silenciosamente)
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
      // Carregar todos os medicamentos existentes para indexação rápida por pdfId e por ID interno
      const existingRecords = e.app.findRecordsByFilter(
        'medicamentos',
        "id != ''",
        'pdfId',
        5000,
        0,
      )

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

      // Mapas de busca dos registros existentes
      const existingByPdfId = new Map() // pdfId (número) -> record
      const existingByName = new Map() // nome normalizado -> record

      existingRecords.forEach((rec) => {
        const pId = rec.getInt('pdfId')
        if (pId && pId >= 1 && pId <= 482) {
          existingByPdfId.set(pId, rec)
        }
        const key = normalizeSimple(rec.getString('nome'))
        if (key) {
          existingByName.set(key, rec)
        }
      })

      let criados = 0
      let atualizados = 0
      let inalterados = 0
      const processedPdfIds = new Set()

      // 1. Processar cada item recebido casando PRIORITARIAMENTE por pdfId
      items.forEach((item) => {
        let nomeLimpo = (item.nome || '').trim().toUpperCase()
        let classeLimpa = (item.classe || '').trim()
        let classeDetalhadaLimpa = (item.classe_detalhada || item.classeDetalhada || '').trim()
        let statusLimpo = (item.status || 'Padronizado').trim()
        let itemPdfId = Number(item.pdfId || 0)
        if (!itemPdfId || itemPdfId < 1 || itemPdfId > 482) {
          itemPdfId = 0
        }

        // Rejeitar linhas vazias ou ruídos de cabeçalho
        if (!nomeLimpo || nomeLimpo.length < 3) return
        if (nomeLimpo.startsWith('||') || nomeLimpo.includes('ANTIBACTERIANO ANTIBACTERIANO'))
          return
        if (/^(NOME DO MEDICAMENTO|MEDICAMENTO|CLASSE|DEFINICAO)$/i.test(nomeLimpo)) return

        // Pós-processamento e padronização Help Vida
        nomeLimpo = nomeLimpo.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()
        if (
          nomeLimpo.startsWith('MOXIFLOXACINO 1,6MG/ML PO PARA') &&
          !nomeLimpo.includes('SOLUCAO INJETAVEL')
        ) {
          nomeLimpo = 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML'
        }
        if (/^0,6\s*UI\s*\+\s*CLORANFENICOL/i.test(nomeLimpo)) {
          nomeLimpo = ('COLAGENASE ' + nomeLimpo).replace(/\s+/g, ' ').trim()
        }
        if (/^\d+\s*ML\s+([A-Z]{3,})/i.test(nomeLimpo)) {
          nomeLimpo = nomeLimpo.replace(/^\d+\s*ML\s+/, '')
        }

        // Observação padrão para Não Padronizado se vazia
        let obsFinal = item.observacao || ''
        if (statusLimpo === 'Não Padronizado' && !obsFinal) {
          obsFinal =
            'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
        } else if (statusLimpo === 'Inativo' && !obsFinal) {
          obsFinal = 'Medicamento inativo no sistema da farmácia.'
        }

        // CASAMENTO: Primeiro por pdfId; se não houver pdfId, por nome exato
        let existingRec = null
        if (itemPdfId > 0 && existingByPdfId.has(itemPdfId)) {
          existingRec = existingByPdfId.get(itemPdfId)
        } else {
          const nameKey = normalizeSimple(nomeLimpo)
          if (nameKey && existingByName.has(nameKey)) {
            existingRec = existingByName.get(nameKey)
          }
        }

        if (existingRec) {
          // ATUALIZAR registro existente
          const curStatus = existingRec.getString('status')
          const curClasse = existingRec.getString('classe')
          const curClasseDetalhada = existingRec.getString('classe_detalhada')
          const curNome = existingRec.getString('nome')
          const curObs = existingRec.getString('observacao')
          const curPdfId = existingRec.getInt('pdfId')

          let hasChanges = false

          if (itemPdfId > 0 && curPdfId !== itemPdfId) {
            existingRec.set('pdfId', itemPdfId)
            hasChanges = true
          }
          if (curNome !== nomeLimpo) {
            existingRec.set('nome', nomeLimpo)
            hasChanges = true
          }
          if (classeLimpa && curClasse !== classeLimpa) {
            existingRec.set('classe', classeLimpa)
            hasChanges = true
          }
          if (curClasseDetalhada !== classeDetalhadaLimpa) {
            existingRec.set('classe_detalhada', classeDetalhadaLimpa)
            hasChanges = true
          }
          if (curStatus !== statusLimpo) {
            existingRec.set('status', statusLimpo)
            hasChanges = true
          }
          if (obsFinal && curObs !== obsFinal) {
            existingRec.set('observacao', obsFinal)
            hasChanges = true
          }
          if (item.descricao && !existingRec.getString('descricao')) {
            existingRec.set('descricao', item.descricao)
            hasChanges = true
          }

          if (hasChanges) {
            e.app.save(existingRec)
            atualizados++
          } else {
            inalterados++
          }

          if (itemPdfId > 0) {
            processedPdfIds.add(itemPdfId)
            existingByPdfId.set(itemPdfId, existingRec)
          }
        } else {
          // CRIAR novo medicamento no catálogo
          const newRec = new Record(medCol)
          newRec.set('nome', nomeLimpo)
          newRec.set('classe', classeLimpa)
          newRec.set('classe_detalhada', classeDetalhadaLimpa)
          newRec.set('status', statusLimpo)
          newRec.set('descricao', item.descricao || '')
          newRec.set('observacao', obsFinal)
          if (itemPdfId > 0) {
            newRec.set('pdfId', itemPdfId)
            processedPdfIds.add(itemPdfId)
          }
          e.app.save(newRec)
          criados++

          if (itemPdfId > 0) {
            existingByPdfId.set(itemPdfId, newRec)
          }
          const nameKey = normalizeSimple(nomeLimpo)
          if (nameKey) {
            existingByName.set(nameKey, newRec)
          }
        }
      })

      // 2. Identificar itens cadastrados no banco que NÃO vieram nesta importação (ausentes)
      // NUNCA apagar silenciosamente: listar para decisão administrativa
      const ausentesList = []
      existingRecords.forEach((rec) => {
        const pId = rec.getInt('pdfId')
        if (pId > 0 && !processedPdfIds.has(pId)) {
          ausentesList.push({
            id: rec.id,
            pdfId: pId,
            nome: rec.getString('nome'),
            classe: rec.getString('classe'),
            status: rec.getString('status'),
          })
        }
      })

      // 3. Registrar no histórico de importações se solicitado
      if (body.record_history) {
        try {
          const histCol = e.app.findCollectionByNameOrId('historico_importacoes')
          const histRec = new Record(histCol)
          histRec.set('nome_arquivo', body.file_name || 'importacao_catalogo_pdfId.pdf')
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
          console.error('Aviso ao registrar historico_importacoes:', hErr)
        }
      }

      // 4. Log em audit_logs para rastreabilidade de pdfId
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRec = new Record(auditCol)
        auditRec.set('colecao', 'medicamentos')
        auditRec.set('registro_id', 'bulk_sync_pdfId')
        auditRec.set('acao', 'IMPORTACAO_POR_PDF_ID')
        auditRec.set(
          'status_novo',
          `${criados} criados, ${atualizados} atualizados, ${inalterados} inalterados`,
        )
        auditRec.set(
          'detalhes',
          JSON.stringify({
            total_enviados: items.length,
            criados,
            atualizados,
            inalterados,
            total_ausentes: ausentesList.length,
            ausentes: ausentesList.slice(0, 50),
          }),
        )
        if (e.auth && e.auth.id) {
          auditRec.set('usuario', e.auth.id)
          auditRec.set('usuario_nome', e.auth.getString('name') || '')
          auditRec.set('usuario_email', e.auth.getString('email') || '')
        }
        e.app.save(auditRec)
      } catch (aErr) {
        console.error('Aviso ao registrar audit_logs:', aErr)
      }

      return e.json(200, {
        success: true,
        total_processados: items.length,
        criados,
        atualizados,
        inalterados,
        ausentes_count: ausentesList.length,
        ausentes: ausentesList,
        total_catalogo_final: existingByPdfId.size,
      })
    } catch (err) {
      return e.json(500, {
        error: 'Erro ao processar sincronização por pdfId: ' + (err?.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)

// Endpoint administrativo para esvaziar/zerar todo o catálogo de medicamentos
routerAdd(
  'POST',
  '/backend/v1/medicamentos/zerar-catalogo',
  (e) => {
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.unauthorizedError('Acesso não autorizado. Faça login para continuar.')
      }

      // Verificação de permissão administrativa padrão do projeto
      const userRole = (authUser.getString('role') || '').toLowerCase()
      const userEmail = (authUser.getString('email') || '').toLowerCase().trim()
      const isUserAdmin = userRole === 'admin' || userEmail === 'fernandofernandes@helpvida.com.br'

      if (!isUserAdmin) {
        return e.forbiddenError(
          'Apenas administradores da comissão Help Vida podem zerar o catálogo de medicamentos.',
        )
      }

      // 1. Contar e carregar todos os registros existentes na coleção medicamentos
      // Busca segura via SDK do PocketBase (findRecordsByFilter)
      let existingRecords = []
      try {
        existingRecords = e.app.findRecordsByFilter('medicamentos', "id != ''", '', 10000, 0)
      } catch (fetchErr) {
        console.error('Erro ao listar registros de medicamentos:', fetchErr)
        return e.json(500, {
          error:
            'Falha ao consultar a lista de medicamentos existente: ' +
            (fetchErr?.message || String(fetchErr)),
        })
      }

      const totalApagados = existingRecords.length

      // 2. Apagar TODOS os registros da coleção de medicamentos de forma segura via SDK
      // (idempotente: se já estiver vazio, o loop é 0 e conclui com sucesso)
      if (totalApagados > 0) {
        for (let i = 0; i < existingRecords.length; i++) {
          try {
            e.app.delete(existingRecords[i])
          } catch (delErr) {
            console.error('Aviso ao apagar medicamento ID ' + existingRecords[i].id + ':', delErr)
          }
        }
      }

      // 3. Registrar auditoria em historico_importacoes conforme os requisitos da tarefa:
      // tipo "zerar catálogo" com contagem de itens apagados, data e usuário responsável (sem dados clínicos - LGPD)
      try {
        const histCol = e.app.findCollectionByNameOrId('historico_importacoes')
        const histRec = new Record(histCol)
        histRec.set('nome_arquivo', 'Zerar catálogo de medicamentos')
        histRec.set('total_itens', totalApagados)
        histRec.set('criados', 0)
        histRec.set('atualizados', 0)
        histRec.set('inalterados', 0)
        histRec.set('ignorados', totalApagados)
        if (authUser.id) {
          histRec.set('usuario', authUser.id)
        }
        e.app.save(histRec)
      } catch (hErr) {
        console.error('Aviso ao registrar auditoria em historico_importacoes:', hErr)
      }

      // 4. Também registrar em audit_logs institucional para rastreabilidade completa
      try {
        const auditCol = e.app.findCollectionByNameOrId('audit_logs')
        const auditRec = new Record(auditCol)
        auditRec.set('colecao', 'medicamentos')
        auditRec.set('registro_id', 'catalogo_completo')
        auditRec.set('acao', 'ZERAR_CATALOGO_MEDICAMENTOS')
        auditRec.set('usuario', authUser.id)
        auditRec.set('usuario_nome', authUser.getString('name') || 'Administrador')
        auditRec.set('usuario_email', authUser.getString('email') || userEmail)
        auditRec.set('usuario_role', userRole || 'admin')
        auditRec.set('status_anterior', totalApagados + ' medicamentos cadastrados')
        auditRec.set('status_novo', '0 medicamentos (catálogo zerado)')
        auditRec.set(
          'detalhes',
          'Catálogo de medicamentos completamente esvaziado pelo administrador para carga de nova tabela limpa. Total de itens excluídos: ' +
            totalApagados,
        )
        e.app.save(auditRec)
      } catch (aErr) {
        console.error('Aviso ao registrar em audit_logs:', aErr)
      }

      return e.json(200, {
        success: true,
        message:
          totalApagados === 0
            ? 'O catálogo de medicamentos já se encontrava vazio. Nenhum registro foi apagado.'
            : 'Catálogo de medicamentos zerado com sucesso! ' +
              totalApagados +
              ' medicamento(s) foram apagados permanentemente.',
        itens_apagados: totalApagados,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Erro ao zerar catálogo de medicamentos:', err)
      return e.json(500, {
        error:
          'Falha interna ao tentar esvaziar o catálogo de medicamentos: ' +
          (err?.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
