import type { ExtractedPageText } from './pdfLoader'

export type StatusPadronizacao = 'Padronizado' | 'Não Padronizado' | 'Inativo'

export interface ParsedMedicamento {
  nome: string
  classe: string
  status: StatusPadronizacao
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
  'Analgésico opioide',
  'Analgésico/antitérmico',
  'Antibacteriano',
  'Antifúngico',
  'Gastrointestinal',
  'Água/Diluente',
  'Anestésico local',
  'Ansiolítico/sedativo',
  'Antiagregante plaquetário',
  'Antiarrítmico',
  'Antiasmático',
  'Anticoagulante',
  'Anticolinérgico/antiespasmódico',
  'Antidemencial',
  'Antidepressivo',
  'Antidiabético',
  'Antiemético/antivertiginoso',
  'Antiepiléptico',
  'Antigotoso',
  'Anti-hipertensivo',
  'Anti-histamínico',
  'Anti-inflamatório não esteroidal',
  'Anti-inflamatório intestinal',
  'Antiparasitário',
  'Antiparkinsoniano',
  'Antipsicótico',
  'Antitussígeno',
  'Antiviral',
  'Antialérgico/estimulante do apetite',
  'Broncodilatador',
  'Cardiovascular',
  'Corticosteroide',
  'Diurético',
  'Eletrólito/Solução',
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
export function makeMedicamentoKey(nome: string, classe: string): string {
  return `${normalizeStr(nome)}||${normalizeStr(classe)}`
}

/**
 * Detecta se uma linha é cabeçalho de seção de status
 */
function detectSectionStatus(line: string): StatusPadronizacao | null {
  const norm = normalizeStr(line)

  // Inativos (páginas 9-10)
  if (
    norm.includes('medicamentos inativos') ||
    norm.includes('inativos no sistema') ||
    norm.includes('itens inativos')
  ) {
    return 'Inativo'
  }

  // Não padronizados (páginas 6-9)
  if (
    norm.includes('nao padronizados') ||
    norm.includes('nao padronizado') ||
    norm.includes('medicamentos nao padronizados')
  ) {
    return 'Não Padronizado'
  }

  // Padronizados (páginas 1-5)
  if (
    norm.includes('medicamentos padronizados') ||
    norm.includes('relacao dos medicamentos padronizados') ||
    norm.includes('itens padronizados')
  ) {
    return 'Padronizado'
  }

  return null
}

/**
 * Linhas que devem ser ignoradas (cabeçalhos de página, rodapés, paginação, títulos)
 */
function isNoiseLine(line: string): boolean {
  const norm = normalizeStr(line)
  if (!norm) return true

  // Cabeçalho institucional ou título do anexo
  if (norm.includes('relacao dos medicamentos avaliados')) return true
  if (norm.includes('definicao de padronizacao')) return true
  if (norm.includes('anexo i') || norm.includes('anexo 1')) return true
  if (norm.includes('help vida') || norm.includes('helpvida')) return true
  if (norm.includes('spincare')) return true

  // Cabeçalho das colunas da tabela
  if (norm === 'medicamento' || norm === 'classe' || norm === 'medicamentos') return true
  if (norm === 'medicamento classe' || norm === 'medicamento / classe') return true
  if (norm === 'classe terapeutica' || norm === 'medicamento classe terapeutica') return true

  // Rodapés ou paginação
  if (/^pagina \d+( de \d+)?$/i.test(norm)) return true
  if (/^\d+ \/ \d+$/i.test(norm) || /^\d+ of \d+$/i.test(norm)) return true
  if (/^pag\.? \d+/i.test(norm)) return true

  // Observações gerais repetidas
  if (norm.includes('deverao ser solicitados mediante justificativa medica')) return true
  if (norm.includes('justificativa medica fundamentada')) return true

  return false
}

/**
 * Tenta casar uma classe terapêutica no final da linha ou isolada
 */
function findClassInLine(line: string): {
  className: string
  restOfLine: string
  matched: boolean
} {
  const normLine = normalizeStr(line)

  // 1. Procurar pelas classes conhecidas (priorizando as maiores/mais específicas)
  const sortedKnown = [...KNOWN_CLASSES].sort((a, b) => b.length - a.length)

  for (const cls of sortedKnown) {
    const normCls = normalizeStr(cls)

    // A classe pode estar no final da linha: "NOME DO MEDICAMENTO 10MG CLASSE"
    if (normLine.endsWith(normCls)) {
      const idx = normLine.lastIndexOf(normCls)
      const rest = line.substring(0, idx).trim()
      if (rest.length > 2) {
        return { className: cls, restOfLine: rest, matched: true }
      }
    }

    // A classe pode ser a linha inteira (em tabelas onde a classe fica numa linha isolada)
    if (normLine === normCls) {
      return { className: cls, restOfLine: '', matched: true }
    }
  }

  // 2. Tentar detectar via delimitador comum (ex: " | ", " - ", "\t", " ; ")
  const delimiters = [' | ', ' - ', '\t', '; ']
  for (const delim of delimiters) {
    if (line.includes(delim)) {
      const parts = line.split(delim).map((p) => p.trim())
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1]
        const normLast = normalizeStr(lastPart)
        const matchCls = sortedKnown.find((c) => normalizeStr(c) === normLast)
        if (matchCls) {
          return {
            className: matchCls,
            restOfLine: parts.slice(0, -1).join(' ').trim(),
            matched: true,
          }
        }
      }
    }
  }

  return { className: '', restOfLine: line, matched: false }
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
    let pendingLineNum = -1

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim()
      if (!rawLine) continue

      // Verificar se esta linha é um cabeçalho que altera o status da seção
      const sectionStatus = detectSectionStatus(rawLine)
      if (sectionStatus) {
        currentStatus = sectionStatus
        continue
      }

      // Descartar ruídos, rodapés e cabeçalhos de coluna
      if (isNoiseLine(rawLine)) {
        continue
      }

      // Tentar casar classe e nome na mesma linha
      const match = findClassInLine(rawLine)

      if (match.matched && match.restOfLine) {
        // Encontrou nome e classe juntos na mesma linha
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
          observacao,
          rawSourceLine: rawLine,
          pageNumber: page.pageNumber,
        })
        pendingNome = null
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
          observacao,
          rawSourceLine: `${pendingNome} -> ${rawLine}`,
          pageNumber: page.pageNumber,
        })
        pendingNome = null
        continue
      }

      // Se temos um pendingNome anterior e esta linha não é uma classe, pode ser:
      // a) A continuação do nome anterior (nome longo em 2 linhas)
      // b) Uma tentativa frustrada de casar
      if (pendingNome) {
        // Tentar juntar com a linha anterior
        const combined = `${pendingNome} ${rawLine}`
        const combinedMatch = findClassInLine(combined)

        if (combinedMatch.matched && combinedMatch.restOfLine) {
          items.push({
            nome: combinedMatch.restOfLine.trim().toUpperCase(),
            classe: combinedMatch.className,
            status: currentStatus,
            rawSourceLine: combined,
            pageNumber: page.pageNumber,
          })
          pendingNome = null
          continue
        } else {
          // A linha anterior era órfã, registrar como não reconhecida se parecer um medicamento
          if (pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|COMP|AMP/i.test(pendingNome)) {
            unrecognized.push({
              pageNumber: page.pageNumber,
              text: pendingNome,
              reason: 'Classe terapêutica não identificada para este item.',
            })
          }
          pendingNome = rawLine
          pendingLineNum = i
          continue
        }
      }

      // Se não casou na mesma linha, armazenar como possível nome para a próxima linha
      pendingNome = rawLine
      pendingLineNum = i
    }

    // Fim da página com pendingNome não resolvido
    if (pendingNome && pendingNome.length > 4 && /[0-9]|MG|ML|G|UI|COMP|AMP/i.test(pendingNome)) {
      unrecognized.push({
        pageNumber: page.pageNumber,
        text: pendingNome,
        reason: 'Classe terapêutica não identificada ao fim da página.',
      })
    }
  }

  // Deduplicação intra-arquivo mantendo a primeira ocorrência ou atualizando se tiver mais detalhes
  const uniqueItems: ParsedMedicamento[] = []
  const seenMap = new Map<string, number>()

  for (const item of items) {
    const key = makeMedicamentoKey(item.nome, item.classe)
    if (!seenMap.has(key)) {
      seenMap.set(key, uniqueItems.length)
      uniqueItems.push(item)
    }
  }

  return {
    items: uniqueItems,
    unrecognized,
    totalPages: pages.length,
    totalItems: uniqueItems.length,
  }
}
