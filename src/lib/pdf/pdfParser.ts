import type { ExtractedPageText } from './pdfLoader'

export type StatusPadronizacao = 'Padronizado' | 'Não Padronizado' | 'Inativo'

export interface ParsedMedicamento {
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

export interface ParseResult {
  items: ParsedMedicamento[]
  unrecognized: UnrecognizedItem[]
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

  // 1. Procurar pelas classes conhecidas (priorizando as maiores/mais específicas)
  const sortedKnown = [...KNOWN_CLASSES].sort((a, b) => b.length - a.length)

  for (const cls of sortedKnown) {
    const normCls = normalizeStr(cls)

    // A classe pode estar no final da linha: "NOME DO MEDICAMENTO 10MG CLASSE"
    // Verificar que antes da classe existe fronteira de palavra/espaço para não casar dentro de palavras
    if (normLine.endsWith(normCls)) {
      const idx = normLine.lastIndexOf(normCls)
      const charBefore = idx > 0 ? normLine[idx - 1] : ''
      if (idx === 0) {
        // A linha é exatamente a classe
        return {
          className: cls,
          restOfLine: '',
          definicao: detectedDefinicao,
          matched: true,
        }
      } else if (
        charBefore === ' ' ||
        charBefore === '|' ||
        charBefore === '-' ||
        charBefore === '\t'
      ) {
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

    // A classe pode ser a linha inteira (em tabelas onde a classe fica numa linha isolada)
    if (normLine === normCls) {
      return {
        className: cls,
        restOfLine: '',
        definicao: detectedDefinicao,
        matched: true,
      }
    }
  }
  // 2. Tentar detectar via delimitador comum (ex: " | ", " - ", "\t", " ; ")
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
export function parseMedicamentosFromMarkdown(markdownText: string): ParseResult {
  const items: ParsedMedicamento[] = []
  const unrecognized: UnrecognizedItem[] = []

  let currentStatus: StatusPadronizacao = 'Padronizado'
  const lines = markdownText.split('\n')

  let pendingNome: string | null = null
  let pendingClasse: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()
    if (!rawLine) continue

    // Detectar mudança de seção de status
    const secStatus = detectSectionStatus(rawLine)
    if (secStatus) {
      currentStatus = secStatus
      continue
    }

    // Descartar ruídos, rodapés e regras
    if (isNoiseLine(rawLine)) {
      continue
    }

    // Verificar se é linha de tabela Markdown (inicia ou contém pipes)
    if (rawLine.includes('|')) {
      const cols = rawLine
        .split('|')
        .map((c) => c.trim())
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
        firstColNorm === 'classe'
      ) {
        continue
      }

      if (cols.length >= 2) {
        let nome = cols[0]
        let classe = cols[1]
        let definicao = cols[2] || ''

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

        // Se a linha tem nome mas não tem classe:
        // Pode ser continuação do item anterior (ex: | 125MG COMPRIMIDO | | | ou | B6 DL) AMPOLA 10 ML | | |)
        if (nome && !classe) {
          if (isContinuationLine(nome) && items.length > 0) {
            const lastItem = items[items.length - 1]
            const combinedNome = `${lastItem.nome} ${nome}`
              .replace(/\s+/g, ' ')
              .trim()
              .toUpperCase()
            if (!isMonsterItem(combinedNome)) {
              lastItem.nome = combinedNome
              lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${nome}`
              continue
            }
          }
          pendingNome = pendingNome ? `${pendingNome} ${nome}` : nome
          continue
        }

        // Se a classe está preenchida
        if (classe) {
          let fullNome = nome
          if (pendingNome) {
            fullNome = fullNome ? `${pendingNome} ${fullNome}` : pendingNome
            pendingNome = null
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

            let observacao: string | undefined
            if (rowStatus === 'Não Padronizado') {
              observacao =
                'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
            } else if (rowStatus === 'Inativo') {
              observacao = 'Medicamento inativo no sistema da farmácia.'
            }

            items.push({
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

    // Se não for linha de tabela com pipes, processar como texto livre / linha estruturada
    if (isContinuationLine(rawLine) && !pendingNome && items.length > 0) {
      const lastItem = items[items.length - 1]
      const combinedNome = `${lastItem.nome} ${rawLine}`.replace(/\s+/g, ' ').trim().toUpperCase()
      if (!isMonsterItem(combinedNome)) {
        lastItem.nome = combinedNome
        lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${rawLine}`
        continue
      }
    }

    const match = findClassInLine(rawLine)
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
          }
        }
        pendingNome = null
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
        nome: finalNome,
        classe,
        status: currentStatus,
        definicaoOriginal: match.definicao,
        observacao,
        rawSourceLine: rawLine,
      })
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
        nome,
        classe,
        status: currentStatus,
        definicaoOriginal: match.definicao,
        observacao,
        rawSourceLine: `${pendingNome} -> ${rawLine}`,
      })
      pendingNome = null
      continue
    }

    if (pendingNome) {
      // Avaliar se rawLine é fragmento curto de dosagem/apresentação
      const isShortFragment =
        rawLine.length < 35 &&
        (/^(AMPOLA|FRASCO|ML|MG|G|COMPRIMIDO|GOTAS|POMADA|CREME|SUSPENSAO|SOLUCAO|CAPSULA|ADESIVO|SERINGA|ENVELOPE)\b/i.test(
          rawLine,
        ) ||
          /(\d+\s*(MG|ML|G|UI|MCG|%))\b/i.test(rawLine) ||
          rawLine === 'ML' ||
          rawLine === 'G' ||
          rawLine === 'COMPRIMIDO' ||
          rawLine === 'AMPOLA' ||
          rawLine.endsWith('ML') ||
          rawLine.endsWith('G') ||
          rawLine.endsWith('COMPRIMIDO'))

      if (isShortFragment) {
        const combined = `${pendingNome} ${rawLine}`.replace(/\s+/g, ' ').trim()
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
            nome: combMatch.restOfLine.trim().toUpperCase(),
            classe: combMatch.className,
            status: currentStatus,
            definicaoOriginal: combMatch.definicao,
            observacao,
            rawSourceLine: combined,
          })
          pendingNome = null
          continue
        } else {
          pendingNome = `${pendingNome} ${rawLine}`
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
      }
      pendingNome = rawLine
      continue
    }

    pendingNome = rawLine
  }

  // Deduplicação e sanitização de ruídos
  const sanitized = sanitizeAndFilterItems(items, unrecognized)

  return {
    items: sanitized,
    unrecognized,
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

  // Status padrão inicial da página 1 (no documento Anexo I, inicia com Padronizados)
  let currentStatus: StatusPadronizacao = 'Padronizado'

  // pendingNome pode atravessar páginas (ex: DIMENIDRINATO na pág. 3 -> B6 DL na pág. 4, EPISOL na pág. 13 -> G na pág. 14)
  let pendingNome: string | null = null
  let pendingPageNumber = 1

  for (const page of pages) {
    const lines = page.lines

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim()
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
          }
          pendingNome = null
        }
        continue
      }

      // Descartar ruídos, rodapés e cabeçalhos de coluna
      // IMPORTANTE: Se tiver pendingNome e a linha for ruído (ex: rodapé de fim de página ou cabeçalho de início de página),
      // o pendingNome é PRESERVADO para poder anexar a continuação que vem após o cabeçalho da próxima página!
      if (isNoiseLine(rawLine)) {
        continue
      }

      // Verificar se a linha atual é uma continuação óbvia de um item anterior que já foi registrado
      // CASO ESPECIAL: Quando o nome quebrou em 2 linhas, a primeira linha continha a classe e a segunda era apenas continuação
      // (ex: "AMOXICILINA 875MG + CLAVULANATO Antibacteriano Padrão" seguido de "125MG COMPRIMIDO")
      // OU a continuação caiu na página seguinte (ex: "B6 DL) AMPOLA 10 ML" no topo da pág 4, após "DIMENIDRINATO... Antibacteriano Padrão" no fim da pág 3)
      if (isContinuationLine(rawLine) && !pendingNome && items.length > 0) {
        const lastItem = items[items.length - 1]
        // Anexar ao nome do último item se não virar monstro
        const combinedNome = `${lastItem.nome} ${rawLine}`.replace(/\s+/g, ' ').trim().toUpperCase()
        if (!isMonsterItem(combinedNome)) {
          lastItem.nome = combinedNome
          lastItem.rawSourceLine = `${lastItem.rawSourceLine || ''} + ${rawLine}`
          continue
        }
      }

      // Tentar casar classe e nome na mesma linha
      const match = findClassInLine(rawLine)

      if (match.matched && match.restOfLine) {
        // Se a linha casou nome + classe
        let finalNome = match.restOfLine.trim().toUpperCase()

        // Se havia um pendingNome anterior e ele parece ser o início deste medicamento:
        // ex: pendingNome = "TRAMADOL 100MG/ML GOTAS FRASCO 10", rawLine = "ML Analgésico opioide Padrão"
        // ou pendingNome = "ACIDO ACETILSALICILICO 100MG", rawLine = "COMPRIMIDO Antiagregante plaquetário Padrão"
        // ou pendingNome = "SULFA + TRIMETOPRIMA 200MG/5ML + 40MG/5ML SUSPENSAO ORAL FRASCO 100", rawLine = "ML Antibacteriano Padrão"
        if (pendingNome) {
          const combined = `${pendingNome} ${finalNome}`.replace(/\s+/g, ' ').trim()
          if (!isMonsterItem(combined)) {
            finalNome = combined
          } else {
            // Se virar monstro, pendingNome anterior era órfão
            if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
              unrecognized.push({
                pageNumber: pendingPageNumber,
                text: pendingNome,
                reason: 'Linha sem classe associada antes de outro medicamento.',
              })
            }
          }
          pendingNome = null
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
          nome: finalNome,
          classe,
          status: currentStatus,
          definicaoOriginal: match.definicao,
          observacao,
          rawSourceLine: rawLine,
          pageNumber: page.pageNumber,
        })
        continue
      }

      // Se a linha casou apenas com uma classe (ex: linha seguinte da tabela) e temos um pendingNome
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
          nome,
          classe,
          status: currentStatus,
          definicaoOriginal: match.definicao,
          observacao,
          rawSourceLine: `${pendingNome} -> ${rawLine}`,
          pageNumber: page.pageNumber,
        })
        pendingNome = null
        continue
      }

      // Se temos um pendingNome anterior e esta linha não casou classe:
      if (pendingNome) {
        if (isContinuationLine(rawLine)) {
          // Tentar ver se concatenando gera um match com classe
          const combined = `${pendingNome} ${rawLine}`.replace(/\s+/g, ' ').trim()
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
              nome: combMatch.restOfLine.trim().toUpperCase(),
              classe: combMatch.className,
              status: currentStatus,
              definicaoOriginal: combMatch.definicao,
              observacao,
              rawSourceLine: combined,
              pageNumber: page.pageNumber,
            })
            pendingNome = null
            continue
          }

          // Não casou classe ainda, acumular fragmento
          pendingNome = `${pendingNome} ${rawLine}`
          continue
        }

        // NÃO é continuação: a linha anterior era um item órfão, não deve fundir com a linha atual!
        if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
          unrecognized.push({
            pageNumber: pendingPageNumber,
            text: pendingNome,
            reason: 'Classe terapêutica não identificada para este item.',
          })
        }
        pendingNome = rawLine
        pendingPageNumber = page.pageNumber
        continue
      }

      // Se não casou na mesma linha nem temos pendingNome:
      // Se for uma continuação solta (isContinuationLine) e temos items anteriores, já foi tratada acima.
      // Se não, armazenar como possível início de nome para a próxima linha
      pendingNome = rawLine
      pendingPageNumber = page.pageNumber
    }
  }

  // Fim de todas as páginas com pendingNome não resolvido
  if (pendingNome && pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
    unrecognized.push({
      pageNumber: pendingPageNumber,
      text: pendingNome,
      reason: 'Classe terapêutica não identificada ao fim do documento.',
    })
  }

  // Deduplicação e sanitização de monstros
  const sanitized = sanitizeAndFilterItems(items, unrecognized)

  return {
    items: sanitized,
    unrecognized,
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
  // ex: "125mg comprimido", "150 ml", "70 ml", "20 ml", "10 ml", "250 mg", "90 doses", "100 ml"
  if (/^\d+(\s*,\s*\d+|\s*\.\s*\d+)?\s*(mg|ml|g|ui|mcg|%|meq|doses)\b/i.test(norm)) {
    return true
  }

  // 4. Começa com forma farmacêutica / apresentação / via / complemento de embalagem:
  // ex: "oral frasco 15 ml", "suspensao oral frasco 100 ml", "comprimido revestido...", "solucao..."
  if (
    /^(oral|suspensao|solucao|po para|para solucao|solucao otologica|solucao oftalmica|gel|creme|pomada|xarope|gotas|spray|sache|caneta|adesivo|flaconete|bolsa|seringa|envelope|frasco|ampola|comprimido|capsula|dragea|drágea|qsp)\b/i.test(
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
    norm.length <= 75
  ) {
    return true
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

  // 2. Se contém 3 ou mais repetições de "COMPRIMIDO" ou "CAPSULA"
  const compCount = (upper.match(/\bCOMPRIMIDO\b/g) || []).length
  if (compCount >= 3) return true

  const capsCount = (upper.match(/\bCAPSULA\b/g) || []).length
  if (capsCount >= 3) return true

  // Se tem combinação excessiva de formas farmacêuticas diferentes repetidas
  const ampCount = (upper.match(/\bAMPOLA\b/g) || []).length
  const frascoCount = (upper.match(/\bFRASCO\b/g) || []).length
  if (compCount >= 2 && ampCount >= 2) return true
  if (compCount + capsCount + ampCount + frascoCount >= 5) return true

  // 3. Padrões de cabeçalho residuais
  if (upper.startsWith('###') || upper.startsWith('##') || upper.startsWith('||')) return true
  if (upper.includes('NOME DO MEDICAMENTO') || upper.includes('ANTIBACTERIANO ANTIBACTERIANO'))
    return true

  return false
}

function sanitizeAndFilterItems(
  items: ParsedMedicamento[],
  unrecognized: UnrecognizedItem[],
): ParsedMedicamento[] {
  const uniqueItems: ParsedMedicamento[] = []
  const seenMap = new Map<string, number>()

  for (const item of items) {
    let nomeLimpo = (item.nome || '')
      .replace(/^#+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!nomeLimpo || nomeLimpo.length < 3) continue
    if (nomeLimpo.startsWith('||') || nomeLimpo.includes('ANTIBACTERIANO ANTIBACTERIANO')) continue
    if (/^(NOME DO MEDICAMENTO|MEDICAMENTO|CLASSE|DEFINICAO)$/i.test(nomeLimpo)) continue

    // Guardrail: Rejeitar fragmentos órfãos isolados que porventura tenham chegado aqui
    // Ex: "125MG COMPRIMIDO", "G", "ML", "COMPRIMIDO", "AMPOLA 10 ML"
    if (isContinuationLine(nomeLimpo) && !item.classe) {
      unrecognized.push({
        pageNumber: item.pageNumber || 0,
        text: nomeLimpo,
        reason: 'Fragmento órfão sem medicamento ou classe associada descartado.',
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
      continue
    }

    item.nome = nomeLimpo.toUpperCase()

    const key = makeMedicamentoKey(item.nome, item.classe)
    if (!seenMap.has(key)) {
      seenMap.set(key, uniqueItems.length)
      uniqueItems.push(item)
    }
  }

  return uniqueItems
}
