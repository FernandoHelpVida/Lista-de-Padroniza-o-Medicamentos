import type { ExtractedPageText } from './pdfLoader'

export type StatusPadronizacao = 'Padronizado' | 'Não Padronizado' | 'Inativo'

export interface ParsedMedicamento {
  pdfId?: number
  nome: string
  classe: string
  status: StatusPadronizacao
  definicaoOriginal?: string
  descricao?: string
  observacao?: string
  rawSourceLine?: string
  pageNumber?: number
}

export interface UnrecognizedItem {
  pageNumber: number
  text: string
  reason: string
}

export interface ItemDescartado {
  pdfId?: number
  rawText: string
  secao?: StatusPadronizacao
  pageNumber?: number
  motivo: string
}

export interface ItemFaltanteRelatorio {
  pdfId: number
  secao?: StatusPadronizacao | string
  motivo: string
  rawText: string
  origemEvidencia: 'descarte_registrado' | 'sem_correspondencia'
  pageNumber?: number
}

export interface ParseResult {
  items: ParsedMedicamento[]
  unrecognized: UnrecognizedItem[]
  descartados: ItemDescartado[]
  totalPages: number
  totalItems: number
}

// Lista canônica de classes conhecidas para matching
export const KNOWN_CLASSES = [
  'Corticosteroide/antimicrobiano tópico',
  'Corticosteroide/antimicrobiano',
  'Eletrólito/acidificante-alcalinizante',
  'Antialérgico/estimulante do apetite',
  'Anti-inflamatório não esteroidal',
  'Anti-inflamatório intestinal',
  'Anticolinérgico/antiespasmódico',
  'Antiemético/antivertiginoso',
  'Antisséptico/dermatológico',
  'Dermatológico/cosmético',
  'Bloqueador neuromuscular',
  'Contraceptivo/hormonal',
  'Antiagregante plaquetário',
  'Analgésico/antitérmico',
  'Analgésico opioide',
  'Ansiolítico/sedativo',
  'Antiprolactinêmico',
  'Antiparkinsoniano',
  'Anti-hipertensivo',
  'Anti-histamínico',
  'Antibacteriano',
  'Anticonvulsivante',
  'Antidepressivo',
  'Antidemencial',
  'Antidiabético',
  'Antidiabéticos',
  'Antiepiléptico',
  'Antiparasitário',
  'Antipsicótico',
  'Antitussígeno',
  'Antiarrítmico',
  'Antiasmático',
  'Anticoagulante',
  'Antifúngico',
  'Antigotoso',
  'Antiviral',
  'Anestésico local',
  'Anestésico',
  'Broncodilatador',
  'Canabinoide',
  'Cardiovascular',
  'Corticosteroide',
  'Dermatológico',
  'Diurético',
  'Eletrólito',
  'Eletrólito/Solução',
  'Gastrointestinal',
  'Água/diluente',
  'Água/Diluente',
  'Otológico',
  'otológico',
  'Colírio',
  'Colirio',
  'Hormônio/Endócrino',
  'Relaxante muscular',
  'Suplemento/Vitamina',
]

/**
 * Normaliza string para comparação (sem acentos, minúsculo, espaços unificados)
 */
export function normalizeStr(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza chave de medicamento para casamento (nome + classe)
 */
export function makeMedicamentoKey(nome: string, _classe?: string): string {
  return normalizeStr(nome)
}

/**
 * Detecta se uma linha é cabeçalho de seção de status
 */
export function detectSectionStatus(line: string): StatusPadronizacao | null {
  const norm = normalizeStr(line)

  // Inativos
  if (
    norm.includes('medicamentos inativos') ||
    norm.includes('itens inativos') ||
    norm === 'inativos' ||
    norm.startsWith('medicamentos inativos:')
  ) {
    return 'Inativo'
  }

  // Não padronizados
  if (
    norm.includes('medicamentos nao padronizados') ||
    norm.includes('itens nao padronizados') ||
    norm.includes('medicamentos nao padronizado') ||
    norm.startsWith('medicamentos nao padronizados:')
  ) {
    return 'Não Padronizado'
  }

  // Padronizados (cuidado para não pegar "medicamentos não padronizados")
  if (
    !norm.includes('nao') &&
    (norm.includes('medicamentos padronizados') ||
      norm.includes('relacao dos medicamentos padronizados') ||
      norm.includes('itens padronizados') ||
      norm.startsWith('medicamentos padronizados:'))
  ) {
    return 'Padronizado'
  }

  return null
}

/**
 * Linhas que devem ser ignoradas (cabeçalhos de página, rodapés, paginação, títulos)
 */
/**
 * Detecta se uma string termina com termo incompleto / pendente
 * Ex: "PO PARA", "SUSPENSAO", "PARA", "BOLSA", "FRASCO", "AMPOLA", "SOLUCAO", "+"
 */
export function hasDanglingEnd(nome: string): boolean {
  if (!nome) return false
  const clean = nome.trim().toUpperCase()
  // Termina com preposição ou preposição composta como "PO PARA", "PARA", "DE", "COM", ou pontuações abertas
  return (
    /\b(PO PARA|PARA|DE|COM|SEM|\+|E|EM|POR|A)\b$/.test(clean) ||
    clean.endsWith('+') ||
    clean.endsWith('-') ||
    clean.endsWith('/') ||
    clean.endsWith('(')
  )
}

/**
 * Detecta se um nome começa com fragmento de dosagem/forma sem o princípio ativo
 * Ex: "0,6UI +", "125MG COMPRIMIDO", "50MG/G", "10 ML"
 */
export function isDosageFragmentStart(str: string): boolean {
  if (!str) return false
  const clean = str.trim().toUpperCase()
  return (
    /^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(UI|MG|G|ML|MCG|%|MEQ|DOSES)\b/i.test(clean) ||
    /^(\+|\/|-|\))\s*/.test(clean)
  )
}

export function isNoiseLine(line: string): boolean {
  const norm = normalizeStr(line)
  if (!norm) return true

  // Cabeçalho institucional ou título do anexo
  if (norm.includes('tipo documento') && norm.includes('anexo')) return true
  if (norm.includes('titulo documento')) return true
  if (norm.includes('relacao dos medicamentos avaliados')) return true
  if (norm.includes('definicao de padronizacao')) return true
  if (norm === 'anexo i' || norm === 'anexo 1' || norm === 'tipo documento: anexo i') return true
  if (norm.includes('help vida') || norm.includes('helpvida')) return true

  // Rodapé repetido por página da Help Vida
  // Ex: "65 3611 – 1300 / 65 3622 0911 Rua das Camélias, 381 – Jardim Cuiabá"
  // "www.helpvida.com.br contato@helpvida.com.br"
  if (norm.includes('3611') && norm.includes('1300')) return true
  if (norm.includes('3622') && norm.includes('0911')) return true
  if (norm.includes('rua das camelias') || norm.includes('jardim cuiaba')) return true
  if (norm.includes('contato@helpvida.com.br') || norm.includes('www.helpvida.com.br')) return true

  // Textos introdutórios da página 1
  if (norm.includes('durante a reuniao foi realizada a analise')) return true
  if (norm.includes('disponivel no sistema spincare')) return true
  if (norm.includes('controle da farmacia')) return true
  if (norm.includes('considerando as classes terapeuticas e as apresentacoes')) return true
  if (norm.includes('apos analise os medicamentos foram classificados')) return true
  if (norm.includes('comissao de padronizacao de medicamentos')) return true

  // Cabeçalhos de coluna repetidos
  if (
    norm === 'nome do medicamento classe definicao' ||
    norm === 'nome do medicamento classe' ||
    norm === 'nome do medicamento' ||
    norm === 'classe' ||
    norm === 'definicao' ||
    norm === 'padrao' ||
    norm === 'nao padrao' ||
    norm === 'inativo'
  ) {
    return true
  }

  // Rodapés ou paginação
  if (/^pagina \d+( de \d+)?$/i.test(norm)) return true
  if (/^\d+ \/ \d+$/i.test(norm) || /^\d+ of \d+$/i.test(norm)) return true
  if (/^pag\.? \d+/i.test(norm)) return true

  // Observações gerais da última página e regras de justificativa
  if (norm.includes('observacao: os medicamentos nao padronizados deverao ser solicitados'))
    return true
  if (norm.includes('justificativa medica fundamentada')) return true
  if (norm.includes('exemplos:')) return true
  if (norm.includes('pacientes com determinacao judicial vigente')) return true
  if (norm.includes('pacientes pediatricos quando nao houver apresentacao')) return true
  if (norm.includes('falha terapeutica ou resposta insuficiente')) return true
  if (norm.includes('contraindicacao ou intolerancia aos medicamentos')) return true
  if (norm.includes('situacoes clinicas excepcionais devidamente fundamentadas')) return true
  if (norm.includes('medico assistente e submetidas a avaliacao')) return true

  // Regras de rodapé de página ou marcadores de fim de página
  if (/^pagina \d+/i.test(norm) || /^anexo/i.test(norm)) return true

  return false
}

/**
 * Tenta casar uma classe terapêutica no final da linha ou isolada,
 * desconsiderando eventual sufixo de definição de coluna ("Padrão", "NÃO padrão", "Inativo")
 */
export function findClassInLine(line: string): {
  className: string
  restOfLine: string
  definicao?: string
  matched: boolean
} {
  let workingLine = line.trim()
  let detectedDefinicao: string | undefined = undefined

  // Remover e identificar eventual sufixo de definição na mesma linha
  // ex: "DIPIRONA 1G COMPRIMIDO Analgésico/antitérmico Padrão"
  const defMatch = workingLine.match(/\s+(padrao|padrão|não padrão|nao padrao|inativo)$/i)
  if (defMatch) {
    detectedDefinicao = defMatch[1]
    workingLine = workingLine.substring(0, workingLine.length - defMatch[0].length).trim()
  }

  const normLine = normalizeStr(workingLine)

  // 0. Se a linha contiver delimitador pipe "|" e tiver pelo menos duas partes
  if (workingLine.includes('|')) {
    const pipeParts = workingLine
      .split('|')
      .map((p) => p.replace(/#+/g, ' ').replace(/\*\*/g, '').trim())
      .filter((p, idx, arr) => !(idx === 0 && p === '') && !(idx === arr.length - 1 && p === ''))
    if (pipeParts.length >= 2) {
      const pNome = pipeParts[0]
      const pClasse = pipeParts[1]
      const pDef = pipeParts[2] || detectedDefinicao
      if (pNome && pClasse) {
        return {
          className: pClasse,
          restOfLine: pNome,
          definicao: pDef,
          matched: true,
        }
      }
    }
  }

  // Adicionar variações conhecidas com grafia normalizada
  const sortedKnown = [
    ...KNOWN_CLASSES,
    'Antibacteriano',
    'Anticonvulsivante',
    'Antidepressivo',
    'Antidiabético',
    'Antidiabéticos',
    'Anti-hipertensivo',
    'Anti-inflamatório não esteroidal',
    'Anti-inflamatório intestinal',
    'Analgésico/antitérmico',
    'Analgésico opioide',
    'Corticosteroide',
    'Dermatológico',
    'Diurético',
    'Gastrointestinal',
    'Relaxante muscular',
    'Suplemento/Vitamina',
    'Eletrólito',
    'Água/diluente',
    'Broncodilatador',
    'Antiemético/antivertiginoso',
    'Anti-histamínico',
    'Antiparasitário',
    'Antipsicótico',
    'Antitussígeno',
    'Antiarrítmico',
    'Antiasmático',
    'Anticoagulante',
    'Antifúngico',
    'Antiviral',
    'Anestésico local',
    'Cardiovascular',
    'Otológico',
    'Colírio',
    'Canabinoide',
    'Bloqueador neuromuscular',
    'Contraceptivo/hormonal',
    'Antiagregante plaquetário',
    'Antialérgico/estimulante do apetite',
    'Anticolinérgico/antiespasmódico',
    'Antiprolactinêmico',
    'Antiparkinsoniano',
    'Antidemencial',
    'Antiepiléptico',
    'Antisseptico/dermatologico',
    'Dermatologico/cosmetico',
  ].sort((a, b) => b.length - a.length)

  for (const cls of sortedKnown) {
    const normCls = normalizeStr(cls)

    // A classe pode ser a linha inteira (em tabelas onde a classe fica numa linha isolada)
    if (normLine === normCls) {
      return {
        className: cls,
        restOfLine: '',
        definicao: detectedDefinicao,
        matched: true,
      }
    }

    // A classe pode estar no final da linha: "NOME DO MEDICAMENTO 10MG CLASSE"
    // Verificar que antes da classe existe fronteira de palavra/espaço para não casar dentro de palavras
    if (normLine.endsWith(normCls)) {
      const idx = normLine.lastIndexOf(normCls)
      const charBefore = idx > 0 ? normLine[idx - 1] : ''
      if (charBefore === ' ' || charBefore === '|' || charBefore === '-' || charBefore === '\t') {
        const rest = workingLine.substring(0, idx).trim()
        if (rest.length > 1) {
          return {
            className: cls,
            restOfLine: rest,
            definicao: detectedDefinicao,
            matched: true,
          }
        }
      }
    }

    // A classe também pode estar no MEIO da linha se a definição vier depois
    // Ex: "AMOXICILINA 875MG + CLAVULANATO 125MG COMPRIMIDO Antibacteriano Padrão"
    // (Caso o defMatch acima não tenha removido por variação na escrita de definição)
    const clsIdx = normLine.lastIndexOf(normCls)
    if (clsIdx > 0) {
      const charBefore = normLine[clsIdx - 1]
      const charAfterIdx = clsIdx + normCls.length
      const charAfter = charAfterIdx < normLine.length ? normLine[charAfterIdx] : ''
      if (
        (charBefore === ' ' || charBefore === '|' || charBefore === '\t') &&
        (charAfter === ' ' || charAfter === '|' || charAfter === '\t' || charAfter === '')
      ) {
        const remainderAfter = normLine.substring(charAfterIdx).trim()
        // Se o que sobrou depois for apenas definição (padrao, nao padrao, inativo)
        if (
          !remainderAfter ||
          remainderAfter.includes('padrao') ||
          remainderAfter.includes('inativo') ||
          remainderAfter.includes('nao')
        ) {
          const rest = workingLine.substring(0, clsIdx).trim()
          if (rest.length > 1) {
            return {
              className: cls,
              restOfLine: rest,
              definicao: remainderAfter || detectedDefinicao,
              matched: true,
            }
          }
        }
      }
    }
  } // 2. Tentar detectar via delimitador comum (ex: " | ", " - ", "\t", " ; ")
  const delimiters = [' | ', '\t', '; ']
  for (const delim of delimiters) {
    if (workingLine.includes(delim)) {
      const parts = workingLine.split(delim).map((p) => p.trim())
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1]
        const normLast = normalizeStr(lastPart)
        const matchCls = sortedKnown.find((c) => normalizeStr(c) === normLast)
        if (matchCls) {
          return {
            className: matchCls,
            restOfLine: parts.slice(0, -1).join(' ').trim(),
            definicao: detectedDefinicao,
            matched: true,
          }
        }
      }
    }
  }

  return { className: '', restOfLine: workingLine, matched: false }
}

/**
 * Parser para Markdown gerado server-side via $documents.toMarkdown
 * Processa tabelas markdown no formato:
 * | Nome do medicamento | Classe | Definição |
 * | AGUA DESTILADA 5L | Água/diluente | Padrão |
 */
/**
 * Analisa markdown e linhas de texto
 */
/**
 * Extrai número de ID explícito no início ou coluna da linha (1 a 482)
 */
export function extractLineId(str: string): { pdfId?: number; cleanText: string } {
  if (!str) return { cleanText: '' }
  const trimmed = str.trim()
  // Padrão: número de 1 a 482 seguido de espaço, tab, traço ou pipe
  const prefixMatch = trimmed.match(/^(\d{1,3})\s*[-| \t]\s*(.*)$/)
  if (prefixMatch) {
    const idNum = parseInt(prefixMatch[1], 10)
    if (idNum >= 1 && idNum <= 482) {
      return { pdfId: idNum, cleanText: prefixMatch[2].trim() }
    }
  }
  // Padrão: linha é apenas número de 1 a 482
  const singleNumMatch = trimmed.match(/^(\d{1,3})$/)
  if (singleNumMatch) {
    const idNum = parseInt(singleNumMatch[1], 10)
    if (idNum >= 1 && idNum <= 482) {
      return { pdfId: idNum, cleanText: '' }
    }
  }
  return { cleanText: trimmed }
}

export function parseMedicamentosFromMarkdown(markdownText: string): ParseResult {
  const items: ParsedMedicamento[] = []
  const unrecognized: UnrecognizedItem[] = []
  const descartados: ItemDescartado[] = []

  let currentStatus: StatusPadronizacao = 'Padronizado'
  const lines = markdownText.split('\n')

  let pendingNome: string | null = null
  let pendingId: number | undefined = undefined

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i].trim()
    if (!rawLine) continue

    // Detectar mudança de seção de status
    const secStatus = detectSectionStatus(rawLine)
    if (secStatus) {
      currentStatus = secStatus
      continue
    }

    // Descartar ruídos, rodapés e regras
    if (isNoiseLine(rawLine)) {
      const extractedNoiseId = extractLineId(rawLine).pdfId
      if (extractedNoiseId || rawLine.length > 5) {
        descartados.push({
          pdfId: extractedNoiseId,
          rawText: rawLine,
          secao: currentStatus,
          pageNumber: 0,
          motivo: 'Descartado como ruído, cabeçalho institucional ou rodapé de página.',
        })
      }
      continue
    }

    // Remover lixo de extração como '###' ou '##' de dentro da linha
    rawLine = rawLine.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()

    // Verificar se é linha de tabela Markdown (inicia ou contém pipes)
    if (rawLine.includes('|')) {
      const cols = rawLine
        .split('|')
        .map((c) => c.replace(/#+/g, ' ').replace(/\*\*/g, '').trim())
        .filter((c, idx, arr) => {
          // Remover colunas vazias geradas por pipes no início/fim
          if ((idx === 0 || idx === arr.length - 1) && c === '') return false
          return true
        })

      // Linhas separadoras de cabeçalho: |---|---|---|
      if (cols.every((c) => /^:?-+:?$/.test(c))) {
        continue
      }

      // Cabeçalho de colunas
      const firstColNorm = normalizeStr(cols[0] || '')
      if (
        firstColNorm.includes('nome do medicamento') ||
        firstColNorm === 'medicamento' ||
        firstColNorm === 'classe' ||
        firstColNorm === 'id'
      ) {
        continue
      }

      if (cols.length >= 1) {
        let rowPdfId: number | undefined = undefined
        let nomeColIndex = 0

        // Se a primeira coluna for um ID numérico (ex: | 1 | AGUA DESTILADA 5L | Água/diluente | Padrão |)
        const idColMatch = cols[0].match(/^(\d{1,3})$/)
        if (idColMatch) {
          const val = parseInt(idColMatch[1], 10)
          if (val >= 1 && val <= 482) {
            rowPdfId = val
            nomeColIndex = 1
          }
        }

        let nome = cols[nomeColIndex] || ''
        let classe = cols[nomeColIndex + 1] || ''
        let definicao = cols[nomeColIndex + 2] || ''

        // Se o nome tinha ID prefixado
        if (!rowPdfId) {
          const extracted = extractLineId(nome)
          if (extracted.pdfId) {
            rowPdfId = extracted.pdfId
            nome = extracted.cleanText
          }
        }

        // Tentar identificar se a definição define o status (ex: Padrão, NÃO padrão, Inativo)
        const defNorm = normalizeStr(definicao)
        let rowStatus = currentStatus
        if (defNorm.includes('inativo')) {
          rowStatus = 'Inativo'
        } else if (defNorm.includes('nao') || defNorm.includes('não')) {
          rowStatus = 'Não Padronizado'
        } else if (defNorm.includes('padrao') || defNorm.includes('padrão')) {
          rowStatus = 'Padronizado'
        }

        // Se a classe não está preenchida mas temos nome:
        if (nome && !classe) {
          const matchInCol = findClassInLine(nome)
          if (matchInCol.matched && matchInCol.restOfLine) {
            classe = matchInCol.className
            nome = matchInCol.restOfLine
            if (matchInCol.definicao && !definicao) definicao = matchInCol.definicao
          } else {
            if (items.length > 0) {
              const lastItem = items[items.length - 1]
              // Se o último item tem nome incompleto ou a linha atual é continuação
              // GARANTIA: Se esta linha tem um pdfId diferente do último item, NUNCA fundir!
              const canMerge = !rowPdfId || (lastItem.pdfId && lastItem.pdfId === rowPdfId)
              if (canMerge && (isContinuationLine(nome) || hasDanglingEnd(lastItem.nome))) {
                const combinedNome = `${lastItem.nome} ${nome}`
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toUpperCase()
                if (!isMonsterItem(combinedNome)) {
                  lastItem.nome = combinedNome
                  lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${nome}`
                  descartados.push({
                    pdfId: rowPdfId,
                    rawText: rawLine,
                    secao: currentStatus,
                    pageNumber: 0,
                    motivo: `Tratado como continuação da linha anterior (fundido no item "${lastItem.nome}").`,
                  })
                  continue
                }
              }
            }
            pendingNome = pendingNome ? `${pendingNome} ${nome}` : nome
            if (rowPdfId && !pendingId) pendingId = rowPdfId
            descartados.push({
              pdfId: rowPdfId,
              rawText: rawLine,
              secao: currentStatus,
              pageNumber: 0,
              motivo: 'Linha de tabela sem classe definida acumulada como fragmento pendente.',
            })
            continue
          }
        }

        // Se a classe está preenchida
        if (classe) {
          let fullNome = nome
          const effectiveId = rowPdfId || pendingId
          if (pendingNome) {
            fullNome = fullNome ? `${pendingNome} ${fullNome}` : pendingNome
            pendingNome = null
            pendingId = undefined
          }

          if (fullNome) {
            const nomeClean = fullNome
              .replace(/\*\*/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toUpperCase()
            const classeClean = classe.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

            // Descartar cabeçalhos de coluna residuais
            if (
              nomeClean === 'NOME DO MEDICAMENTO' ||
              nomeClean === 'MEDICAMENTO' ||
              classeClean.toUpperCase() === 'CLASSE'
            ) {
              continue
            }

            // Se o nome atual começa com dosagem fragmentada
            // GARANTIA POR ID: Só funde se não houver conflito de IDs diferentes!
            if (isDosageFragmentStart(nomeClean) && items.length > 0) {
              const lastItem = items[items.length - 1]
              const idMatchesOrMissing =
                !effectiveId || !lastItem.pdfId || effectiveId === lastItem.pdfId
              if (
                idMatchesOrMissing &&
                (!/[0-9]/.test(lastItem.nome) || hasDanglingEnd(lastItem.nome))
              ) {
                lastItem.nome = `${lastItem.nome} ${nomeClean}`
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toUpperCase()
                if (classeClean) lastItem.classe = classeClean
                if (effectiveId && !lastItem.pdfId) lastItem.pdfId = effectiveId
                lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${rawLine}`
                descartados.push({
                  pdfId: effectiveId,
                  rawText: rawLine,
                  secao: rowStatus,
                  pageNumber: 0,
                  motivo: `Inicia com dosagem fragmentada; fundido com o item anterior "${lastItem.nome}".`,
                })
                continue
              }
            }

            let observacao: string | undefined
            if (rowStatus === 'Não Padronizado') {
              observacao =
                'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
            } else if (rowStatus === 'Inativo') {
              observacao = 'Medicamento inativo no sistema da farmácia.'
            }

            items.push({
              pdfId: effectiveId,
              nome: nomeClean,
              classe: classeClean,
              status: rowStatus,
              definicaoOriginal: definicao,
              observacao,
              rawSourceLine: rawLine,
            })
            continue
          }
        }
      }
    }

    // Se a linha anterior foi tabela com pipes e foi processada acima, não reprocessar aqui
    if (rawLine.includes('|')) {
      continue
    }

    // Verificar se a linha avulsa é um ID numérico isolado
    const isolatedIdMatch = rawLine.match(/^(\d{1,3})$/)
    if (isolatedIdMatch) {
      const val = parseInt(isolatedIdMatch[1], 10)
      if (val >= 1 && val <= 482) {
        pendingId = val
        continue
      }
    }

    // Extrair ID no início da linha de texto livre se houver
    const extracted = extractLineId(rawLine)
    let currentLineId = extracted.pdfId || pendingId
    let effectiveLineText = extracted.cleanText

    // Se não for linha de tabela com pipes, processar como texto livre / linha estruturada
    if (
      (isContinuationLine(effectiveLineText) ||
        (items.length > 0 && hasDanglingEnd(items[items.length - 1].nome))) &&
      !pendingNome &&
      items.length > 0
    ) {
      const lastItem = items[items.length - 1]
      const idMatchesOrMissing =
        !currentLineId || !lastItem.pdfId || currentLineId === lastItem.pdfId
      if (idMatchesOrMissing) {
        const combinedNome = `${lastItem.nome} ${effectiveLineText}`
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase()
        if (!isMonsterItem(combinedNome)) {
          lastItem.nome = combinedNome
          lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${effectiveLineText}`
          descartados.push({
            pdfId: currentLineId,
            rawText: rawLine,
            secao: currentStatus,
            pageNumber: 0,
            motivo: `Tratado como continuação de nome (anexado ao item anterior "${lastItem.nome}").`,
          })
          continue
        }
      }
    }

    const match = findClassInLine(effectiveLineText)
    if (match.matched && match.restOfLine) {
      // Linha casou nome + classe
      let finalNome = match.restOfLine.trim().toUpperCase()

      if (pendingNome) {
        const combined = `${pendingNome} ${finalNome}`.replace(/\s+/g, ' ').trim()
        if (!isMonsterItem(combined)) {
          finalNome = combined
        } else {
          if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
            unrecognized.push({
              pageNumber: 0,
              text: pendingNome,
              reason: 'Linha sem classe associada antes de outro item completo.',
            })
            descartados.push({
              pdfId: pendingId,
              rawText: pendingNome,
              secao: currentStatus,
              pageNumber: 0,
              motivo: 'Linha sem classe associada antes de outro item completo (não reconhecido).',
            })
          }
        }
        pendingNome = null
      } else if (isDosageFragmentStart(finalNome) && items.length > 0) {
        const lastItem = items[items.length - 1]
        const idMatchesOrMissing =
          !currentLineId || !lastItem.pdfId || currentLineId === lastItem.pdfId
        if (idMatchesOrMissing && (!/[0-9]/.test(lastItem.nome) || hasDanglingEnd(lastItem.nome))) {
          lastItem.nome = `${lastItem.nome} ${finalNome}`.replace(/\s+/g, ' ').trim().toUpperCase()
          lastItem.classe = match.className
          if (currentLineId && !lastItem.pdfId) lastItem.pdfId = currentLineId
          lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${rawLine}`
          descartados.push({
            pdfId: currentLineId,
            rawText: rawLine,
            secao: currentStatus,
            pageNumber: 0,
            motivo: `Fragmento de dosagem com classe fundido no item anterior "${lastItem.nome}".`,
          })
          pendingId = undefined
          continue
        }
      }

      const classe = match.className

      let observacao: string | undefined
      if (currentStatus === 'Não Padronizado') {
        observacao =
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
      } else if (currentStatus === 'Inativo') {
        observacao = 'Medicamento inativo no sistema da farmácia.'
      }

      items.push({
        pdfId: currentLineId,
        nome: finalNome,
        classe,
        status: currentStatus,
        definicaoOriginal: match.definicao,
        observacao,
        rawSourceLine: rawLine,
      })
      pendingId = undefined
      continue
    }

    if (match.matched && !match.restOfLine && pendingNome) {
      const nome = pendingNome.trim().toUpperCase()
      const classe = match.className

      let observacao: string | undefined
      if (currentStatus === 'Não Padronizado') {
        observacao =
          'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
      } else if (currentStatus === 'Inativo') {
        observacao = 'Medicamento inativo no sistema da farmácia.'
      }

      items.push({
        pdfId: currentLineId,
        nome,
        classe,
        status: currentStatus,
        definicaoOriginal: match.definicao,
        observacao,
        rawSourceLine: `${pendingNome} -> ${rawLine}`,
      })
      pendingNome = null
      pendingId = undefined
      continue
    }

    if (pendingNome) {
      // Avaliar se rawLine é fragmento curto de dosagem/apresentação
      const isShortFragment =
        effectiveLineText.length < 35 &&
        (/^(AMPOLA|FRASCO|ML|MG|G|COMPRIMIDO|GOTAS|POMADA|CREME|SUSPENSAO|SOLUCAO|CAPSULA|ADESIVO|SERINGA|ENVELOPE)\b/i.test(
          effectiveLineText,
        ) ||
          /(\d+\s*(MG|ML|G|UI|MCG|%))\b/i.test(effectiveLineText) ||
          effectiveLineText === 'ML' ||
          effectiveLineText === 'G' ||
          effectiveLineText === 'COMPRIMIDO' ||
          effectiveLineText === 'AMPOLA' ||
          effectiveLineText.endsWith('ML') ||
          effectiveLineText.endsWith('G') ||
          effectiveLineText.endsWith('COMPRIMIDO'))

      if (isShortFragment) {
        const combined = `${pendingNome} ${effectiveLineText}`.replace(/\s+/g, ' ').trim()
        const combMatch = findClassInLine(combined)
        if (combMatch.matched && combMatch.restOfLine) {
          let observacao: string | undefined
          if (currentStatus === 'Não Padronizado') {
            observacao =
              'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
          } else if (currentStatus === 'Inativo') {
            observacao = 'Medicamento inativo no sistema da farmácia.'
          }

          items.push({
            pdfId: currentLineId,
            nome: combMatch.restOfLine.trim().toUpperCase(),
            classe: combMatch.className,
            status: currentStatus,
            definicaoOriginal: combMatch.definicao,
            observacao,
            rawSourceLine: combined,
          })
          pendingNome = null
          pendingId = undefined
          continue
        } else {
          pendingNome = `${pendingNome} ${effectiveLineText}`
          continue
        }
      }

      // Se não é fragmento curto, a linha anterior era um item órfão
      if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
        unrecognized.push({
          pageNumber: 0,
          text: pendingNome,
          reason: 'Classe terapêutica não identificada para este item.',
        })
        descartados.push({
          pdfId: pendingId,
          rawText: pendingNome,
          secao: currentStatus,
          pageNumber: 0,
          motivo: 'Classe terapêutica não identificada para este item.',
        })
      }
      pendingNome = effectiveLineText
      continue
    }

    pendingNome = effectiveLineText
  }

  // Deduplicação e sanitização de ruídos
  const sanitized = sanitizeAndFilterItems(items, unrecognized, descartados)

  return {
    items: sanitized,
    unrecognized,
    descartados,
    totalPages: 16,
    totalItems: sanitized.length,
  }
}

/**
 * Parser principal de páginas extraídas do PDF
 */
export function parseMedicamentosFromPages(pages: ExtractedPageText[]): ParseResult {
  const items: ParsedMedicamento[] = []
  const unrecognized: UnrecognizedItem[] = []
  const descartados: ItemDescartado[] = []

  // Status padrão inicial da página 1 (no documento Anexo I, inicia com Padronizados)
  let currentStatus: StatusPadronizacao = 'Padronizado'

  let pendingNome: string | null = null
  let pendingPageNumber = 1
  let pendingId: number | undefined = undefined

  for (const page of pages) {
    const lines = page.lines
    // Fila de IDs isolados no rodapé desta página
    const pageTrailingIds = [...(page.trailingNumbers || [])]

    // Posição inicial de itens antes desta página
    const pageStartItemIdx = items.length

    for (let i = 0; i < lines.length; i++) {
      let rawLine = lines[i].trim()
      if (!rawLine) continue

      // Verificar se esta linha é um cabeçalho que altera o status da seção
      const sectionStatus = detectSectionStatus(rawLine)
      if (sectionStatus) {
        currentStatus = sectionStatus
        if (pendingNome) {
          if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
            unrecognized.push({
              pageNumber: pendingPageNumber,
              text: pendingNome,
              reason: 'Linha isolada antes de mudança de seção.',
            })
            descartados.push({
              pdfId: pendingId,
              rawText: pendingNome,
              secao: currentStatus,
              pageNumber: pendingPageNumber,
              motivo: 'Linha isolada antes de mudança de seção.',
            })
          }
          pendingNome = null
          pendingId = undefined
        }
        continue
      }

      // Descartar ruídos, rodapés e cabeçalhos de coluna
      if (isNoiseLine(rawLine)) {
        const noiseId = extractLineId(rawLine).pdfId
        if (noiseId || rawLine.length > 5) {
          descartados.push({
            pdfId: noiseId,
            rawText: rawLine,
            secao: currentStatus,
            pageNumber: page.pageNumber,
            motivo: 'Descartado como ruído, cabeçalho institucional ou rodapé de página.',
          })
        }
        continue
      }

      // Limpar artefatos de extração '###' ou '##'
      rawLine = rawLine.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()

      // Verificar se a linha avulsa é um ID numérico isolado (ex: sequência no rodapé da página)
      const isolatedIdMatch = rawLine.match(/^(\d{1,3})$/)
      if (isolatedIdMatch) {
        const val = parseInt(isolatedIdMatch[1], 10)
        if (val >= 1 && val <= 482) {
          // Linhas numéricas puras no final de página ou coluna
          continue
        }
      }

      // Extrair ID no início da linha se houver
      const extracted = extractLineId(rawLine)
      const linePdfId = extracted.pdfId || pendingId
      const cleanLine = extracted.cleanText

      // Verificar se a linha atual é uma continuação óbvia de um item anterior
      if (
        (isContinuationLine(cleanLine) ||
          (items.length > 0 && hasDanglingEnd(items[items.length - 1].nome))) &&
        !pendingNome &&
        items.length > 0
      ) {
        const lastItem = items[items.length - 1]
        // Se a linha tem um pdfId diferente do último item, NUNCA fundir!
        const canMerge = !linePdfId || !lastItem.pdfId || linePdfId === lastItem.pdfId
        if (canMerge) {
          const combinedNome = `${lastItem.nome} ${cleanLine}`
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase()
          if (!isMonsterItem(combinedNome)) {
            lastItem.nome = combinedNome
            lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${cleanLine}`
            descartados.push({
              pdfId: linePdfId,
              rawText: rawLine,
              secao: currentStatus,
              pageNumber: page.pageNumber,
              motivo: `Tratado como continuação da linha anterior (fundido no item "${lastItem.nome}").`,
            })
            continue
          }
        }
      }

      // Tentar casar classe e nome na mesma linha
      const match = findClassInLine(cleanLine)

      if (match.matched && match.restOfLine) {
        let finalNome = match.restOfLine.trim().toUpperCase()

        if (pendingNome) {
          const combined = `${pendingNome} ${finalNome}`.replace(/\s+/g, ' ').trim()
          if (!isMonsterItem(combined)) {
            finalNome = combined
          } else {
            if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
              unrecognized.push({
                pageNumber: pendingPageNumber,
                text: pendingNome,
                reason: 'Linha sem classe associada antes de outro medicamento.',
              })
              descartados.push({
                pdfId: pendingId,
                rawText: pendingNome,
                secao: currentStatus,
                pageNumber: pendingPageNumber,
                motivo: 'Linha sem classe associada antes de outro medicamento.',
              })
            }
          }
          pendingNome = null
        } else if (isDosageFragmentStart(finalNome) && items.length > 0) {
          const lastItem = items[items.length - 1]
          const canMerge = !linePdfId || !lastItem.pdfId || linePdfId === lastItem.pdfId
          if (canMerge && (!/[0-9]/.test(lastItem.nome) || hasDanglingEnd(lastItem.nome))) {
            lastItem.nome = `${lastItem.nome} ${finalNome}`
              .replace(/\s+/g, ' ')
              .trim()
              .toUpperCase()
            lastItem.classe = match.className
            if (linePdfId && !lastItem.pdfId) lastItem.pdfId = linePdfId
            lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${rawLine}`
            descartados.push({
              pdfId: linePdfId,
              rawText: rawLine,
              secao: currentStatus,
              pageNumber: page.pageNumber,
              motivo: `Fragmento de dosagem com classe fundido no item anterior "${lastItem.nome}".`,
            })
            pendingId = undefined
            continue
          }
        }

        const classe = match.className

        let observacao: string | undefined
        if (currentStatus === 'Não Padronizado') {
          observacao =
            'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
        } else if (currentStatus === 'Inativo') {
          observacao = 'Medicamento inativo no sistema da farmácia.'
        }

        items.push({
          pdfId: linePdfId,
          nome: finalNome,
          classe,
          status: currentStatus,
          definicaoOriginal: match.definicao,
          observacao,
          rawSourceLine: rawLine,
          pageNumber: page.pageNumber,
        })
        pendingId = undefined
        continue
      }

      // Se a linha casou apenas com uma classe e temos pendingNome
      if (match.matched && !match.restOfLine && pendingNome) {
        const nome = pendingNome.trim().toUpperCase()
        const classe = match.className

        let observacao: string | undefined
        if (currentStatus === 'Não Padronizado') {
          observacao =
            'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
        } else if (currentStatus === 'Inativo') {
          observacao = 'Medicamento inativo no sistema da farmácia.'
        }

        items.push({
          pdfId: linePdfId,
          nome,
          classe,
          status: currentStatus,
          definicaoOriginal: match.definicao,
          observacao,
          rawSourceLine: `${pendingNome} -> ${rawLine}`,
          pageNumber: page.pageNumber,
        })
        pendingNome = null
        pendingId = undefined
        continue
      }

      // Se temos pendingNome e esta linha não casou classe
      if (pendingNome) {
        if (isContinuationLine(cleanLine)) {
          const combined = `${pendingNome} ${cleanLine}`.replace(/\s+/g, ' ').trim()
          const combMatch = findClassInLine(combined)
          if (combMatch.matched && combMatch.restOfLine) {
            let observacao: string | undefined
            if (currentStatus === 'Não Padronizado') {
              observacao =
                'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
            } else if (currentStatus === 'Inativo') {
              observacao = 'Medicamento inativo no sistema da farmácia.'
            }

            items.push({
              pdfId: linePdfId,
              nome: combMatch.restOfLine.trim().toUpperCase(),
              classe: combMatch.className,
              status: currentStatus,
              definicaoOriginal: combMatch.definicao,
              observacao,
              rawSourceLine: combined,
              pageNumber: page.pageNumber,
            })
            pendingNome = null
            pendingId = undefined
            continue
          }

          pendingNome = `${pendingNome} ${cleanLine}`
          continue
        }

        if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
          unrecognized.push({
            pageNumber: pendingPageNumber,
            text: pendingNome,
            reason: 'Classe terapêutica não identificada para este item.',
          })
          descartados.push({
            pdfId: pendingId,
            rawText: pendingNome,
            secao: currentStatus,
            pageNumber: pendingPageNumber,
            motivo: 'Classe terapêutica não identificada para este item.',
          })
        }
        pendingNome = cleanLine
        pendingPageNumber = page.pageNumber
        pendingId = linePdfId
        continue
      }

      pendingNome = cleanLine
      pendingPageNumber = page.pageNumber
      pendingId = linePdfId
    }

    // Se no final da página temos itens desta página sem pdfId, e a página tem trailingNumbers (a sequência 1..31, 32..70...)
    // Associar os IDs da página na ordem aos itens extraídos na página que não têm pdfId
    const pageItems = items.slice(pageStartItemIdx)
    if (pageTrailingIds.length > 0) {
      // Filtrar trailingIds para conter apenas números sequenciais válidos
      let tidIdx = 0
      for (const it of pageItems) {
        if (!it.pdfId && tidIdx < pageTrailingIds.length) {
          it.pdfId = pageTrailingIds[tidIdx]
          tidIdx++
        }
      }
    }
  }

  // Se sobrou pendingNome ao final
  if (pendingNome) {
    const lastMatch = findClassInLine(pendingNome)
    if (lastMatch.matched && lastMatch.restOfLine) {
      items.push({
        pdfId: pendingId,
        nome: lastMatch.restOfLine.trim().toUpperCase(),
        classe: lastMatch.className,
        status: currentStatus,
        definicaoOriginal: lastMatch.definicao,
        rawSourceLine: pendingNome,
        pageNumber: pendingPageNumber,
      })
    } else if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
      unrecognized.push({
        pageNumber: pendingPageNumber,
        text: pendingNome,
        reason: 'Classe terapêutica não identificada ao fim do documento.',
      })
      descartados.push({
        pdfId: pendingId,
        rawText: pendingNome,
        secao: currentStatus,
        pageNumber: pendingPageNumber,
        motivo: 'Classe terapêutica não identificada ao fim do documento.',
      })
    }
  }

  // Deduplicação e sanitização garantindo regras por pdfId
  const sanitized = sanitizeAndFilterItems(items, unrecognized, descartados)

  return {
    items: sanitized,
    unrecognized,
    descartados,
    totalPages: pages.length,
    totalItems: sanitized.length,
  }
}

/**
 * Sanitiza e valida itens extraídos, prevenindo registros "monstros"
 * e deduplicando por nome + classe
 */
/**
 * Detecta se uma linha curta é continuação de um nome de medicamento quebrado.
 * Exemplos reais do Anexo I Help Vida:
 * - "125MG COMPRIMIDO" (continuação de AMOXICILINA 875MG + CLAVULANATO)
 * - "ML" (continuação de TRAMADOL 100MG/ML GOTAS FRASCO 10)
 * - "B6 DL) AMPOLA 10 ML" (continuação de DIMENIDRINATO + ASSOCIACOES (DRAMIN)
 * - "G" (continuação de EPISOL SEC OC FPS 60 FRASCO 60 na pág. 14)
 * - "90 DOSES" (continuação de formula Pentravan)
 * - "QSP FRASCO 90 DOSES"
 * - "DRÁGEA" ou "DRAGEA"
 * - "COMPRIMIDO"
 * - "AMPOLA 10 ML"
 * - "FRASCO 100 ML"
 * - "ORAL FRASCO 100 ML"
 * - "SUSPENSAO ORAL FRASCO 100 ML"
 * - "PO PARA SOLUCAO INJETAVEL"
 * - "SOLUCAO OTOLOGICA FRASCO 8 ML"
 * - "OFTALMICA FRASCO 5 ML"
 * - "SPRAY 120 DOSES"
 * - "CANETA 3 ML"
 * - "ADESIVO TRANSDERMICO"
 * - "COMPRIMIDO DISPERSIVEL"
 * - "FRASCO AMPOLA"
 * - "FRASCO 620 ML"
 */
export function isContinuationLine(line: string): boolean {
  const norm = normalizeStr(line)
  if (!norm) return false

  // Se a linha casar com uma classe conhecida + definição (ou seja, tem classe própria),
  // NÃO é continuação! É um item independente completo.
  const classMatch = findClassInLine(line)
  if (classMatch.matched && classMatch.restOfLine) {
    return false
  }

  // Se a linha é apenas a própria classe isolada, não é continuação de nome
  if (classMatch.matched && !classMatch.restOfLine) {
    return false
  }

  // Continuação é caracterizada por:
  // 1. Fragmentos unitários muito curtos: "g", "ml", "mg", "cp", "dragea", "drágea", "doses"
  if (/^(g|ml|mg|cp|dragea|doses|comprimido|ampola|frasco|capsula)$/i.test(norm)) {
    return true
  }

  // 2. Fecha parênteses ou complementos que iniciam com fechamento ou continuação de nome composto:
  // ex: "b6 dl) ampola 10 ml", "cor)", "comprimido (buscoduo)"
  if (/^[a-z0-9\s/+-]*\)/i.test(norm)) {
    return true
  }

  // 3. Começa com dosagem/número:
  // ex: "125mg comprimido", "150 ml", "70 ml", "20 ml", "10 ml", "250 mg", "90 doses", "100 ml", "0,6ui + ..."
  if (/^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(mg|ml|g|ui|mcg|%|meq|doses)\b/i.test(norm)) {
    return true
  }

  // 4. Começa com forma farmacêutica / apresentação / via / complemento de embalagem:
  // ex: "oral frasco 15 ml", "suspensao oral frasco 100 ml", "comprimido revestido...", "solucao...", "solucao injetavel bolsa 250 ml"
  if (
    /^(oral|suspensao|solucao|po para|para solucao|solucao injetavel|solucao otologica|solucao oftalmica|gel|creme|pomada|xarope|gotas|spray|sache|caneta|adesivo|flaconete|bolsa|seringa|envelope|frasco|ampola|comprimido|capsula|dragea|drágea|qsp)\b/i.test(
      norm,
    )
  ) {
    return true
  }

  // 5. Termina com padrão clássico de apresentação:
  // ex: "... frasco 70 ml", "... ampola 10 ml", "... comprimido", "... frasco ampola", "... doses", "... 60 g"
  if (
    /(comprimido|comprimidos|capsula|capsulas|ampola|ampolas|frasco|frascos|flaconete|bolsa|seringa|dragea|drágea|doses|sache|gota|gotas|adesivo transdermico|\d+\s*(mg|ml|g|ui|mcg|%|meq)|qsp\s*frasco\s*\d+\s*doses)$/i.test(
      norm,
    ) &&
    norm.length <= 80
  ) {
    return true
  }

  // 6. Contém "bolsa 250 ml", "solucao injetavel", "suspensao oral"
  if (/(solucao injetavel|bolsa \d+|ampola \d+|frasco \d+)/i.test(norm) && norm.length <= 80) {
    return true
  }

  // 7. Não é continuação se parecer um medicamento completo com nome e apresentação
  // Ex: "DIPIRONA 500MG/ML GOTAS FRASCO 20 ML" tem princípio ativo + dose + forma
  if (/^[a-z]{4,}\s+\d+/i.test(norm)) {
    return false
  }

  return false
}

/**
 * Sanitiza e valida itens extraídos, prevenindo registros "monstros"
 * e deduplicando por nome + classe
 */
export function isMonsterItem(nome: string): boolean {
  if (!nome) return false
  const upper = nome.toUpperCase().trim()

  // 1. Limiar de tamanho: um nome de medicamento composto muito longo (ex: fórmula Pentravan)
  // tem ~180 caracteres. Acima de 250 caracteres é anomalia de concatenação.
  if (upper.length > 250) {
    return true
  }

  // 2. Se contém repetições excessivas de uma mesma forma indicando junção de múltiplos remédios
  // (Notar: fórmulas manipuladas podem ter 1 ou 2 formas, mas não 4 ou mais itens distintos)
  const compCount = (upper.match(/\bCOMPRIMIDO\b/g) || []).length
  if (compCount >= 4) return true

  const capsCount = (upper.match(/\bCAPSULA\b/g) || []).length
  if (capsCount >= 4) return true

  const ampCount = (upper.match(/\bAMPOLA\b/g) || []).length
  const frascoCount = (upper.match(/\bFRASCO\b/g) || []).length
  if (compCount >= 3 && ampCount >= 3) return true
  if (compCount + capsCount + ampCount + frascoCount >= 7) return true

  // 3. Padrões de cabeçalho residuais
  if (upper.startsWith('###') || upper.startsWith('##') || upper.startsWith('||')) return true
  if (upper.includes('NOME DO MEDICAMENTO') || upper.includes('ANTIBACTERIANO ANTIBACTERIANO'))
    return true

  // 4. Se contém palavras-chave de cabeçalho ou rodapé institucional
  if (upper.includes('RELACAO DOS MEDICAMENTOS') || upper.includes('DEFINICAO DE PADRONIZACAO'))
    return true

  return false
}

/**
 * Corrige anomalias conhecidas onde texto de duas linhas ou duas colunas adjacentes foi quebrado/fundido
 * com artefatos residuais antes da exibição e inserção.
 */
export function postProcessItemName(nome: string): string {
  if (!nome) return ''
  let cleaned = nome.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()

  // Caso concreto 1: Moxifloxacino bolsa 250ml
  if (
    cleaned.startsWith('MOXIFLOXACINO 1,6MG/ML PO PARA') &&
    !cleaned.includes('SOLUCAO INJETAVEL')
  ) {
    cleaned = 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML'
  }

  // Caso concreto 2: 0,6UI + CLORANFENICOL 50MG/G (EPITEGEL) GEL -> COLAGENASE 0,6UI + CLORANFENICOL 50MG/G (EPITEGEL) GEL
  if (/^0,6\s*UI\s*\+\s*CLORANFENICOL/i.test(cleaned)) {
    cleaned = `COLAGENASE ${cleaned}`
  }

  // Se tem fragmento residual de volume no início de medicamento independente
  // Ex: "150 ML BISMUTO 300MG CAPSULA" -> "BISMUTO 300MG CAPSULA"
  if (/^\d+\s*ML\s+([A-Z]{3,})/i.test(cleaned)) {
    cleaned = cleaned.replace(/^\d+\s*ML\s+/, '')
  }

  // Ex: "20 ML ALPRAZOLAM 0,5MG COMPRIMIDO" -> "ALPRAZOLAM 0,5MG COMPRIMIDO"
  if (/^\d+\s*ML\s+ALPRAZOLAM/i.test(cleaned)) {
    cleaned = cleaned.replace(/^\d+\s*ML\s+/, '')
  }

  return cleaned.replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * Validador sistemático de integridade de nomes extraídos.
 * Retorna as falhas de integridade detectadas em um item, conforme os critérios da tarefa:
 * (a) Inicia com fragmento de dosagem/forma (ex: "0,6UI +", "125MG", "50MG/G")
 * (b) Termina abruptamente em preposição/forma incompleta (ex: "PO PARA", "SUSPENSAO", "+")
 * (c) Contém lixo de extração (ex: "###", sequências estranhas)
 * (d) Continuação órfã isolada (ex: apenas "ML", "G", "COMPRIMIDO")
 */
export function checkItemIntegrity(nome: string): string[] {
  const issues: string[] = []
  if (!nome) {
    issues.push('Nome vazio')
    return issues
  }

  const clean = nome.trim()

  // (c) Lixo de extração
  if (/#+/.test(clean)) {
    issues.push('(c) Contém caracteres de lixo de extração (###)')
  }

  // (a) Inicia com fragmento de dosagem/forma
  if (isDosageFragmentStart(clean)) {
    issues.push('(a) Inicia com fragmento de dosagem/forma em vez do princípio ativo')
  }

  // (b) Termina abruptamente em preposição ou forma incompleta
  if (hasDanglingEnd(clean)) {
    issues.push('(b) Termina abruptamente em termo incompleto')
  }

  // (d) Continuação órfã isolada
  const upper = clean.toUpperCase()
  if (
    /^(G|ML|MG|CP|DRAGEA|DOSES|COMPRIMIDO|AMPOLA|FRASCO|CAPSULA|PO PARA)$/i.test(upper) ||
    /^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(MG|ML|G|UI|MCG|%|MEQ|DOSES)$/i.test(upper)
  ) {
    issues.push('(d) Continuação órfã isolada')
  }

  return issues
}

function sanitizeAndFilterItems(
  items: ParsedMedicamento[],
  unrecognized: UnrecognizedItem[],
  descartados: ItemDescartado[] = [],
): ParsedMedicamento[] {
  const uniqueItems: ParsedMedicamento[] = []
  // Mapas para unicidade: por pdfId (quando presente) e por chave nome+classe (quando ausente)
  const seenPdfIdMap = new Map<number, number>()
  const seenKeyMap = new Map<string, number>()

  for (const item of items) {
    let nomeLimpo = (item.nome || '').replace(/#+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!nomeLimpo || nomeLimpo.length < 3) {
      if (item.pdfId || nomeLimpo) {
        descartados.push({
          pdfId: item.pdfId,
          rawText: item.rawSourceLine || item.nome,
          secao: item.status,
          pageNumber: item.pageNumber || 0,
          motivo: 'Barrado pela auditoria de integridade: nome vazio ou menor que 3 caracteres.',
        })
      }
      continue
    }
    if (nomeLimpo.startsWith('||') || nomeLimpo.includes('ANTIBACTERIANO ANTIBACTERIANO')) {
      descartados.push({
        pdfId: item.pdfId,
        rawText: item.rawSourceLine || item.nome,
        secao: item.status,
        pageNumber: item.pageNumber || 0,
        motivo: 'Barrado pela auditoria de integridade: artefato de extração ou repetição espúria.',
      })
      continue
    }
    if (/^(NOME DO MEDICAMENTO|MEDICAMENTO|CLASSE|DEFINICAO)$/i.test(nomeLimpo)) {
      descartados.push({
        pdfId: item.pdfId,
        rawText: item.rawSourceLine || item.nome,
        secao: item.status,
        pageNumber: item.pageNumber || 0,
        motivo: 'Descartado como cabeçalho de coluna residual.',
      })
      continue
    }

    // Guardrail: Rejeitar fragmentos órfãos isolados sem classe
    if (isContinuationLine(nomeLimpo) && !item.classe && !item.pdfId) {
      unrecognized.push({
        pageNumber: item.pageNumber || 0,
        text: nomeLimpo,
        reason: 'Fragmento órfão sem medicamento ou classe associada descartado.',
      })
      descartados.push({
        pdfId: item.pdfId,
        rawText: item.rawSourceLine || item.nome,
        secao: item.status,
        pageNumber: item.pageNumber || 0,
        motivo: 'Fragmento órfão sem medicamento ou classe associada descartado.',
      })
      continue
    }

    // Detecção de item monstro fundido indevidamente
    if (isMonsterItem(nomeLimpo)) {
      unrecognized.push({
        pageNumber: item.pageNumber || 0,
        text: nomeLimpo.substring(0, 100) + '...',
        reason: 'Item rejeitado por fusão indevida de múltiplas linhas (item monstro detectado).',
      })
      descartados.push({
        pdfId: item.pdfId,
        rawText: item.rawSourceLine || item.nome,
        secao: item.status,
        pageNumber: item.pageNumber || 0,
        motivo: 'Item rejeitado por fusão indevida de múltiplas linhas (item monstro detectado).',
      })
      continue
    }

    item.nome = postProcessItemName(nomeLimpo)

    // Se o item anterior terminou com forma pendente (ex: "PO PARA") e o item atual for continuação dele:
    if (uniqueItems.length > 0) {
      const prev = uniqueItems[uniqueItems.length - 1]
      // SÓ funde se não houver colisão de IDs diferentes!
      const canMergeWithPrev = !item.pdfId || !prev.pdfId || item.pdfId === prev.pdfId

      if (canMergeWithPrev) {
        if (hasDanglingEnd(prev.nome)) {
          const oldPrevNome = prev.nome
          prev.nome = postProcessItemName(`${prev.nome} ${item.nome}`)
          if (item.pdfId && !prev.pdfId) prev.pdfId = item.pdfId
          descartados.push({
            pdfId: item.pdfId,
            rawText: item.rawSourceLine || item.nome,
            secao: item.status,
            pageNumber: item.pageNumber || 0,
            motivo: `Fundido no item anterior com término pendente ("${oldPrevNome}").`,
          })
          continue
        }
        // Ou se o item atual inicia com fragmento de dosagem (ex: "0,6UI + CLORANFENICOL...") e o anterior é princípio ativo
        if (
          isDosageFragmentStart(item.nome) &&
          (!/[0-9]/.test(prev.nome) || hasDanglingEnd(prev.nome))
        ) {
          const oldPrevNome = prev.nome
          prev.nome = postProcessItemName(`${prev.nome} ${item.nome}`)
          if (item.classe && !prev.classe) prev.classe = item.classe
          if (item.pdfId && !prev.pdfId) prev.pdfId = item.pdfId
          descartados.push({
            pdfId: item.pdfId,
            rawText: item.rawSourceLine || item.nome,
            secao: item.status,
            pageNumber: item.pageNumber || 0,
            motivo: `Fragmento de dosagem fundido no princípio ativo anterior ("${oldPrevNome}").`,
          })
          continue
        }
      }
    }

    // Unicidade prioritária por pdfId quando disponível
    if (item.pdfId && item.pdfId >= 1 && item.pdfId <= 482) {
      if (seenPdfIdMap.has(item.pdfId)) {
        // Já existe um item com este pdfId! Atualizar dados mais completos
        const existingIdx = seenPdfIdMap.get(item.pdfId)!
        const existing = uniqueItems[existingIdx]
        // Se o novo tem classe e o anterior não tinha:
        if (item.classe && !existing.classe) existing.classe = item.classe
        if (item.nome.length > existing.nome.length && !isMonsterItem(item.nome)) {
          existing.nome = item.nome
        }
        descartados.push({
          pdfId: item.pdfId,
          rawText: item.rawSourceLine || item.nome,
          secao: item.status,
          pageNumber: item.pageNumber || 0,
          motivo: `Duplicado fundido em outro ID #${item.pdfId} já registrado ("${existing.nome}").`,
        })
        continue
      } else {
        seenPdfIdMap.set(item.pdfId, uniqueItems.length)
        const key = makeMedicamentoKey(item.nome, item.classe)
        seenKeyMap.set(key, uniqueItems.length)
        uniqueItems.push(item)
      }
    } else {
      // Sem pdfId explícito: deduplicar por nome+classe
      const key = makeMedicamentoKey(item.nome, item.classe)
      if (!seenKeyMap.has(key)) {
        seenKeyMap.set(key, uniqueItems.length)
        uniqueItems.push(item)
      } else {
        const existingIdx = seenKeyMap.get(key)!
        const existing = uniqueItems[existingIdx]
        descartados.push({
          pdfId: item.pdfId,
          rawText: item.rawSourceLine || item.nome,
          secao: item.status,
          pageNumber: item.pageNumber || 0,
          motivo: `Item com mesmo nome e classe unificado ao registro "${existing.nome}".`,
        })
      }
    }
  }

  // Segunda passada de garantia para fundir qualquer pendência residual
  const finalItems: ParsedMedicamento[] = []
  for (const it of uniqueItems) {
    it.nome = postProcessItemName(it.nome)
    if (finalItems.length > 0) {
      const last = finalItems[finalItems.length - 1]
      const canMergeWithLast = !it.pdfId || !last.pdfId || it.pdfId === last.pdfId
      if (canMergeWithLast) {
        if (hasDanglingEnd(last.nome)) {
          const oldLastNome = last.nome
          last.nome = postProcessItemName(`${last.nome} ${it.nome}`)
          if (it.pdfId && !last.pdfId) last.pdfId = it.pdfId
          descartados.push({
            pdfId: it.pdfId,
            rawText: it.rawSourceLine || it.nome,
            secao: it.status,
            pageNumber: it.pageNumber || 0,
            motivo: `Fundido ao término incompleto do item "${oldLastNome}".`,
          })
          continue
        }
        if (isDosageFragmentStart(it.nome) && !/[0-9]/.test(last.nome)) {
          const oldLastNome = last.nome
          last.nome = postProcessItemName(`${last.nome} ${it.nome}`)
          if (it.classe) last.classe = it.classe
          if (it.pdfId && !last.pdfId) last.pdfId = it.pdfId
          descartados.push({
            pdfId: it.pdfId,
            rawText: it.rawSourceLine || it.nome,
            secao: it.status,
            pageNumber: it.pageNumber || 0,
            motivo: `Dosagem residual fundida ao item anterior "${oldLastNome}".`,
          })
          continue
        }
      }
    }
    finalItems.push(it)
  }

  return finalItems
}

/**
 * Cruza o intervalo oficial esperado (1..482) com os itens extraídos e a lista de descartes.
 * Para cada ID faltante, associa a evidência de descarte quando houver;
 * se não houver nenhuma menção no documento, classifica como "ID sem correspondência na extração".
 */
export function buildMissingItemsReport(
  extractedItems: ParsedMedicamento[],
  descartados: ItemDescartado[] = [],
  expectedMin = 1,
  expectedMax = 482,
): ItemFaltanteRelatorio[] {
  // Identificar IDs presentes nos itens válidos
  const presentIds = new Set<number>()
  for (const item of extractedItems) {
    if (item.pdfId && item.pdfId >= expectedMin && item.pdfId <= expectedMax) {
      presentIds.add(item.pdfId)
    }
  }

  // Mapear descartes por pdfId (priorizar descartes com mais detalhes)
  const descartesByPdfId = new Map<number, ItemDescartado>()
  for (const d of descartados) {
    if (d.pdfId && d.pdfId >= expectedMin && d.pdfId <= expectedMax) {
      if (!descartesByPdfId.has(d.pdfId)) {
        descartesByPdfId.set(d.pdfId, d)
      } else {
        const existing = descartesByPdfId.get(d.pdfId)!
        // Se o novo tem motivo mais descritivo ou texto maior
        if ((d.rawText && d.rawText.length > existing.rawText.length) || d.secao) {
          descartesByPdfId.set(d.pdfId, d)
        }
      }
    }
  }

  const missingList: ItemFaltanteRelatorio[] = []

  for (let id = expectedMin; id <= expectedMax; id++) {
    if (!presentIds.has(id)) {
      const descarte = descartesByPdfId.get(id)
      if (descarte) {
        missingList.push({
          pdfId: id,
          secao: descarte.secao || 'Não identificada',
          motivo: descarte.motivo,
          rawText: descarte.rawText || '',
          origemEvidencia: 'descarte_registrado',
          pageNumber: descarte.pageNumber,
        })
      } else {
        missingList.push({
          pdfId: id,
          secao: 'Não identificada',
          motivo: 'ID sem correspondência na extração',
          rawText: '',
          origemEvidencia: 'sem_correspondencia',
        })
      }
    }
  }

  return missingList
}

/**
 * Gera conteúdo CSV para o Relatório de Itens Faltantes no padrão Help Vida (ponto-e-vírgula e UTF-8 BOM).
 */
export function exportMissingItemsToCsv(faltantes: ItemFaltanteRelatorio[]): string {
  const header = ['ID PDF', 'Seção do PDF', 'Motivo do Descarte', 'Texto Bruto de Origem']
  const rows = faltantes.map((item) => [
    `"${item.pdfId}"`,
    `"${(item.secao || 'Não identificada').toString().replace(/"/g, '""')}"`,
    `"${item.motivo.replace(/"/g, '""')}"`,
    `"${(item.rawText || '').replace(/"/g, '""')}"`,
  ])

  return '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
}
