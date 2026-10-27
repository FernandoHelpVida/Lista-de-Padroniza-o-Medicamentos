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
  'Anticolinérgico/antiespasmódico',
  'Anti-inflamatório não esteroidal',
  'Anti-inflamatório intestinal',
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

        // Se a linha tem nome mas não tem classe, pode ser a primeira linha de um nome quebrado
        if (nome && !classe) {
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
    const match = findClassInLine(rawLine)
    if (match.matched && match.restOfLine) {
      // Linha casou nome + classe: é um medicamento independente!
      // NÃO concatenar com pendingNome anterior se ele já era outra linha
      if (pendingNome) {
        if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
          unrecognized.push({
            pageNumber: 0,
            text: pendingNome,
            reason: 'Linha sem classe associada antes de outro item completo.',
          })
        }
        pendingNome = null
      }

      const nome = match.restOfLine.trim().toUpperCase()
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

  for (const page of pages) {
    const lines = page.lines

    let pendingNome: string | null = null

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim()
      if (!rawLine) continue

      // Verificar se esta linha é um cabeçalho que altera o status da seção
      const sectionStatus = detectSectionStatus(rawLine)
      if (sectionStatus) {
        currentStatus = sectionStatus
        pendingNome = null
        continue
      }

      // Descartar ruídos, rodapés e cabeçalhos de coluna
      if (isNoiseLine(rawLine)) {
        continue
      }

      // Tentar casar classe e nome na mesma linha
      const match = findClassInLine(rawLine)

      if (match.matched && match.restOfLine) {
        // Se a linha casou nome + classe, este é um medicamento independente!
        // Se havia um pendingNome acumulado anteriormente, ele NÃO deve ser fundido a um
        // medicamento completo que já possui nome + classe próprios.
        if (pendingNome) {
          // Registrar o pendingNome órfão como não reconhecido se parecer medicamento
          if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
            unrecognized.push({
              pageNumber: page.pageNumber,
              text: pendingNome,
              reason: 'Linha sem classe associada antes de outro medicamento.',
            })
          }
          pendingNome = null
        }

        const nome = match.restOfLine.trim().toUpperCase()
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

      // Se temos um pendingNome anterior e esta linha não é uma classe:
      // Avaliar estritamente se rawLine é um fragmento de continuação legítimo.
      // Continuação legítima: linha curta SEM classe própria, contendo apenas complemento
      // de apresentação/dosagem/forma farmacêutica (ex: "AMPOLA 10 ML", "COMPRIMIDO", "250MG/5ML", "120 ML").
      if (pendingNome) {
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

        // NÃO é fragmento curto: a linha anterior era um item órfão, não deve fundir com a linha atual!
        if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)) {
          unrecognized.push({
            pageNumber: page.pageNumber,
            text: pendingNome,
            reason: 'Classe terapêutica não identificada para este item.',
          })
        }
        pendingNome = rawLine
        continue
      }

      // Se não casou na mesma linha, armazenar como possível nome para a próxima linha
      pendingNome = rawLine
    }

    // Fim da página com pendingNome não resolvido
    if (
      pendingNome &&
      pendingNome.length > 4 &&
      /[0-9]|MG|ML|G|UI|MCG|COMP|AMP/i.test(pendingNome)
    ) {
      unrecognized.push({
        pageNumber: page.pageNumber,
        text: pendingNome,
        reason: 'Classe terapêutica não identificada ao fim da página.',
      })
    }
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
export function isMonsterItem(nome: string): boolean {
  if (!nome) return false
  const upper = nome.toUpperCase().trim()

  // 1. Limiar de tamanho excessivo: um nome de medicamento legítimo raramente passa de 120 caracteres
  // Exceções muito raras de fórmulas compostas não contêm 3+ repetições de formas
  if (upper.length > 120) {
    // Contar ocorrências de formas farmacêuticas comuns
    const compCount = (upper.match(/\bCOMPRIMIDO\b/g) || []).length
    const capsCount = (upper.match(/\bCAPSULA\b/g) || []).length
    const ampCount = (upper.match(/\bAMPOLA\b/g) || []).length
    const frascoCount = (upper.match(/\bFRASCO\b/g) || []).length
    const totalForms = compCount + capsCount + ampCount + frascoCount
    if (totalForms >= 2) return true
  }

  // 2. Se contém 3 ou mais "COMPRIMIDO" ou "CAPSULA" mesmo com tamanho menor
  const compCount = (upper.match(/\bCOMPRIMIDO\b/g) || []).length
  if (compCount >= 2) return true

  const capsCount = (upper.match(/\bCAPSULA\b/g) || []).length
  if (capsCount >= 2) return true

  // 3. Padrões de cabeçalho Markdown residuais
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
