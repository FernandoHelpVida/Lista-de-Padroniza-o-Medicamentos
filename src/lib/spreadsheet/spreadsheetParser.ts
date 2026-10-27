import * as XLSX from 'xlsx'

export type StatusPadronizacao = 'Padronizado' | 'Não Padronizado' | 'Inativo'

export interface ParsedMedicamento {
  pdfId: number // ID oficial 1–482 (chave única do catálogo)
  nome: string
  classe: string
  status: StatusPadronizacao
  definicaoOriginal?: string
  descricao?: string
  observacao?: string
  linhaPlanilha?: number
}

export interface ItemDescartado {
  pdfId?: number
  linha?: number
  motivo: string
  rawText: string
  secao?: string
}

export interface UnrecognizedItem {
  text: string
  reason: string
  linha?: number
}

export interface ItemFaltanteRelatorio {
  pdfId: number
  secao?: string
  motivo: string
  rawText?: string
  origemEvidencia: 'descarte_registrado' | 'sem_correspondencia'
  linha?: number
}

export interface SpreadsheetParseResult {
  items: ParsedMedicamento[]
  unrecognized: UnrecognizedItem[]
  descartados: ItemDescartado[]
  totalLinhasLidas: number
  totalItensValidos: number
  nomeAbaUsada?: string
}

/**
 * Normaliza strings para comparação insensível a maiúsculas/minúsculas e acentuação
 */
export function normalizeStr(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza os nomes das colunas da planilha para encontrar ID, Nome, Classe e Definição
 */
export function normalizeHeader(header: string | null | undefined): string {
  if (!header) return ''
  return normalizeStr(header).replace(/[^a-z0-9]/g, '')
}

/**
 * Mapeia o valor da coluna 'Definição' para o enum de status oficial Help Vida:
 * "Padrão" -> "Padronizado"
 * "NÃO padrão" -> "Não Padronizado"
 * "Inativo" -> "Inativo"
 */
export function mapDefinicaoToStatus(
  definicao: string | null | undefined,
): StatusPadronizacao | null {
  if (!definicao) return null
  const norm = normalizeStr(definicao)

  if (norm.includes('inativ')) {
    return 'Inativo'
  }
  if (norm.includes('nao') || norm.includes('nao padrao') || norm.includes('nao padronizado')) {
    return 'Não Padronizado'
  }
  if (norm.includes('padrao') || norm.includes('padronizado')) {
    return 'Padronizado'
  }

  return null
}

/**
 * Parser de CSV em texto bruto (com suporte a delimitadores , e ;)
 */
export function parseCsvToRows(csvText: string): Array<Record<string, unknown>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  // Detectar delimitador (ponto-e-vírgula é comum no Brasil / Excel em pt-BR)
  const firstLine = lines[0]
  const countSemicolon = (firstLine.match(/;/g) || []).length
  const countComma = (firstLine.match(/,/g) || []).length
  const delimiter = countSemicolon >= countComma ? ';' : ','

  const splitLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = splitLine(lines[0])
  const rows: Array<Record<string, unknown>> = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells.every((c) => !c)) continue // linha em branco
    const rowObj: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      rowObj[h] = cells[idx] !== undefined ? cells[idx] : ''
    })
    rows.push(rowObj)
  }

  return rows
}

interface ColumnMapping {
  idKey: string
  nomeKey: string
  classeKey: string
  definicaoKey: string
}

function detectColumnMapping(sampleRow: Record<string, unknown>): ColumnMapping | null {
  const keys = Object.keys(sampleRow)
  let idKey = ''
  let nomeKey = ''
  let classeKey = ''
  let definicaoKey = ''

  for (const k of keys) {
    const norm = normalizeHeader(k)
    if (norm === 'id' || norm === 'idmedicamento' || norm === 'codigo' || norm === 'n') {
      idKey = k
    } else if (norm.includes('medicamento') || norm.includes('nome') || norm === 'produto') {
      nomeKey = k
    } else if (norm.includes('classe') || norm.includes('categoria')) {
      classeKey = k
    } else if (
      norm.includes('definicao') ||
      norm.includes('status') ||
      norm.includes('padronizacao')
    ) {
      definicaoKey = k
    }
  }

  // Se não encontrou por nome, tentar deduzir por posição se tiver 4 colunas
  if ((!idKey || !nomeKey || !definicaoKey) && keys.length >= 4) {
    idKey = idKey || keys[0]
    nomeKey = nomeKey || keys[1]
    classeKey = classeKey || keys[2]
    definicaoKey = definicaoKey || keys[3]
  }

  if (!idKey || !nomeKey || !definicaoKey) {
    return null
  }

  return { idKey, nomeKey, classeKey: classeKey || keys[2] || '', definicaoKey }
}

/**
 * Executa o parsing das linhas brutas (seja de XLSX ou CSV) com validação estrita:
 * - ID numérico único 1–482
 * - Nome obrigatório não vazio
 * - Definição mapeada para Padrão / NÃO padrão / Inativo
 * - Linhas com erro vão para a lista de descartados com motivo detalhado (nunca perdidas em silêncio)
 */
export function parseRawSpreadsheetRows(
  rows: Array<Record<string, unknown>>,
  sheetName = 'Medicamentos',
): SpreadsheetParseResult {
  const items: ParsedMedicamento[] = []
  const descartados: ItemDescartado[] = []
  const unrecognized: UnrecognizedItem[] = []

  if (!rows || rows.length === 0) {
    return {
      items: [],
      unrecognized: [],
      descartados: [],
      totalLinhasLidas: 0,
      totalItensValidos: 0,
      nomeAbaUsada: sheetName,
    }
  }

  const mapping = detectColumnMapping(rows[0])
  if (!mapping) {
    descartados.push({
      motivo:
        'Cabeçalhos obrigatórios não encontrados. A planilha deve conter as colunas: ID, Nome do medicamento, Classe, Definição.',
      rawText: Object.keys(rows[0] || {}).join(' | '),
    })
    return {
      items: [],
      unrecognized: [],
      descartados,
      totalLinhasLidas: rows.length,
      totalItensValidos: 0,
      nomeAbaUsada: sheetName,
    }
  }

  const seenIds = new Map<number, { linha: number; nome: string }>()

  rows.forEach((row, index) => {
    const linhaNum = index + 2 // considerando linha 1 como cabeçalho

    const rawId = row[mapping.idKey]
    const rawNome = row[mapping.nomeKey]
    const rawClasse = row[mapping.classeKey]
    const rawDefinicao = row[mapping.definicaoKey]

    const rawTextSnapshot = `ID: ${rawId ?? ''} | Nome: ${rawNome ?? ''} | Classe: ${rawClasse ?? ''} | Definição: ${rawDefinicao ?? ''}`

    // Pular linha se todos os campos estiverem vazios
    if (
      (rawId === undefined || rawId === null || String(rawId).trim() === '') &&
      (rawNome === undefined || rawNome === null || String(rawNome).trim() === '') &&
      (rawDefinicao === undefined || rawDefinicao === null || String(rawDefinicao).trim() === '')
    ) {
      return
    }

    // 1. Validação de ID
    const parsedId = Number(String(rawId).replace(/[^0-9]/g, ''))
    if (!parsedId || Number.isNaN(parsedId) || parsedId < 1 || parsedId > 482) {
      descartados.push({
        pdfId: parsedId > 0 ? parsedId : undefined,
        linha: linhaNum,
        motivo: `ID inválido ou fora do intervalo oficial Help Vida (1 a 482): "${rawId}"`,
        rawText: rawTextSnapshot,
      })
      unrecognized.push({
        text: rawTextSnapshot,
        reason: `ID inválido: ${rawId}`,
        linha: linhaNum,
      })
      return
    }

    // 2. Validação de duplicidade de ID
    if (seenIds.has(parsedId)) {
      const prev = seenIds.get(parsedId)!
      descartados.push({
        pdfId: parsedId,
        linha: linhaNum,
        motivo: `ID ${parsedId} duplicado na planilha (já encontrado na linha ${prev.linha}: "${prev.nome}")`,
        rawText: rawTextSnapshot,
      })
      return
    }

    // 3. Validação do Nome do Medicamento
    const nomeLimpo = String(rawNome || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()

    if (!nomeLimpo || nomeLimpo.length < 2) {
      descartados.push({
        pdfId: parsedId,
        linha: linhaNum,
        motivo: `Nome do medicamento obrigatório ausente ou vazio na linha ${linhaNum}`,
        rawText: rawTextSnapshot,
      })
      return
    }

    // 4. Validação e Mapeamento da Definição (Status)
    const definicaoStr = String(rawDefinicao || '').trim()
    const mappedStatus = mapDefinicaoToStatus(definicaoStr)

    if (!mappedStatus) {
      descartados.push({
        pdfId: parsedId,
        linha: linhaNum,
        motivo: `Definição de status inesperada ("${definicaoStr}"). Valores aceitos: "Padrão", "NÃO padrão" ou "Inativo".`,
        rawText: rawTextSnapshot,
        secao: definicaoStr || 'Indefinida',
      })
      return
    }

    const classeLimpa = String(rawClasse || '')
      .replace(/\s+/g, ' ')
      .trim()

    let observacaoFinal = ''
    if (mappedStatus === 'Não Padronizado') {
      observacaoFinal =
        'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
    } else if (mappedStatus === 'Inativo') {
      observacaoFinal = 'Medicamento inativo no sistema da farmácia.'
    }

    seenIds.set(parsedId, { linha: linhaNum, nome: nomeLimpo })

    items.push({
      pdfId: parsedId,
      nome: nomeLimpo,
      classe: classeLimpa,
      status: mappedStatus,
      definicaoOriginal: definicaoStr,
      observacao: observacaoFinal,
      linhaPlanilha: linhaNum,
    })
  })

  // Ordenar por ID crescente (1 a 482)
  items.sort((a, b) => a.pdfId - b.pdfId)

  return {
    items,
    unrecognized,
    descartados,
    totalLinhasLidas: rows.length,
    totalItensValidos: items.length,
    nomeAbaUsada: sheetName,
  }
}

/**
 * Lê um arquivo XLSX ou CSV a partir de um ArrayBuffer ou Blob
 */
export async function parseSpreadsheetFile(
  file: File | Blob,
  fileName = '',
): Promise<SpreadsheetParseResult> {
  const isCsv = fileName.toLowerCase().endsWith('.csv') || file.type === 'text/csv'

  if (isCsv) {
    const text = await file.text()
    const rows = parseCsvToRows(text)
    return parseRawSpreadsheetRows(rows, 'CSV')
  }

  // Tratar como XLSX / XLS via SheetJS
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('O arquivo de planilha enviado não contém nenhuma aba ou planilha válida.')
  }

  // Tentar encontrar aba com nome "Medicamentos" ou similar, senão usar a primeira aba
  let targetSheetName = workbook.SheetNames[0]
  for (const name of workbook.SheetNames) {
    const norm = normalizeStr(name)
    if (norm.includes('medicamento') || norm.includes('padroniz') || norm.includes('catalogo')) {
      targetSheetName = name
      break
    }
  }

  const sheet = workbook.Sheets[targetSheetName]
  if (!sheet) {
    throw new Error(`A aba "${targetSheetName}" não pôde ser lida.`)
  }

  // Converter para array de objetos mantendo cabeçalho
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  return parseRawSpreadsheetRows(rawRows, targetSheetName)
}

/**
 * Constrói o relatório oficial de faltantes no intervalo 1..482
 */
export function buildSpreadsheetMissingReport(
  items: ParsedMedicamento[],
  descartados: ItemDescartado[],
  minId = 1,
  maxId = 482,
): ItemFaltanteRelatorio[] {
  const presentIds = new Set<number>()
  for (const it of items) {
    if (it.pdfId >= minId && it.pdfId <= maxId) {
      presentIds.add(it.pdfId)
    }
  }

  const descartesPorId = new Map<number, ItemDescartado>()
  for (const d of descartados) {
    if (d.pdfId && d.pdfId >= minId && d.pdfId <= maxId && !descartesPorId.has(d.pdfId)) {
      descartesPorId.set(d.pdfId, d)
    }
  }

  const report: ItemFaltanteRelatorio[] = []

  for (let id = minId; id <= maxId; id++) {
    if (!presentIds.has(id)) {
      const descarte = descartesPorId.get(id)
      if (descarte) {
        report.push({
          pdfId: id,
          secao: descarte.secao || 'Descarte Registrado',
          motivo: descarte.motivo,
          rawText: descarte.rawText,
          origemEvidencia: 'descarte_registrado',
          linha: descarte.linha,
        })
      } else {
        report.push({
          pdfId: id,
          secao: 'Ausente na planilha',
          motivo: 'ID sem correspondência na planilha enviada',
          rawText: '',
          origemEvidencia: 'sem_correspondencia',
        })
      }
    }
  }

  report.sort((a, b) => a.pdfId - b.pdfId)
  return report
}

/**
 * Exporta o relatório de itens faltantes para formato CSV com BOM UTF-8
 */
export function exportSpreadsheetMissingItemsToCsv(items: ItemFaltanteRelatorio[]): string {
  const header = [
    'ID',
    'Status / Origem',
    'Motivo da Ausência / Descarte',
    'Linha',
    'Texto Bruto da Linha',
  ]
  const escapeCsv = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return ''
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const rows = items.map((i) => [
    i.pdfId,
    escapeCsv(i.secao || ''),
    escapeCsv(i.motivo),
    escapeCsv(i.linha || ''),
    escapeCsv(i.rawText || ''),
  ])

  const csvBody = [header.map((h) => `"${h}"`).join(';'), ...rows.map((r) => r.join(';'))].join(
    '\r\n',
  )

  return `\uFEFF${csvBody}`
}
