/**
 * Parse e conciliação do relatório "Saldo de Estoque Analítico" (XLSX) do SpinCare.
 * O parse é 100% em runtime a partir do upload do usuário — nada de dados
 * embutidos no código. Fonte: aba "Sheet Saldo de Estoque" (cabeçalhos na 1ª linha).
 */
import * as XLSX from 'xlsx'

export type CampoAlvo = 'code' | 'description' | 'saldo' | 'custo_medio'

export interface ColunaPlanilha {
  /** Índice da coluna na planilha (0-based). */
  indice: number
  /** Cabeçalho original (texto da 1ª linha não vazia). */
  cabecalho: string
}

export interface LinhaPreview {
  linha: number
  celulas: string[]
}

export interface ParsePlanilhaResult {
  colunas: ColunaPlanilha[]
  preview: LinhaPreview[]
  totalLinhas: number
  /** Todas as linhas como arrays de valores brutos (para reparse após mapeamento). */
  linhasBrutas: unknown[][]
  nomeAba: string
}

export interface LinhaMapeada {
  /** Identificador do produto — spincare_id (número) ou código (texto). */
  id: number | string
  spincare_id: number | null
  code: string
  description: string
  saldo: number | null
  custo_medio_report: number | null
  temCusto: boolean
  raw: Record<string, unknown>
}

export interface ResumoImport {
  totalLinhas: number
  novos: number
  atualizados: number
  ignorados: number
  motivosIgnorados: string[]
}

export interface Divergencia {
  spincare_id: number
  code: string
  description: string
  custoMedioRelatorio: number
  custoMedioBase: number
  diferenca: number
  fontePrecoBase: string
}

export interface RelatorioConciliacao {
  convergem: number
  divergem: number
  naoEncontrados: number
  semCustoRelatorio: Array<{
    spincare_id: number
    code: string
    description: string
    custoMedioBase: number
  }>
  divergencias: Divergencia[]
}

// ---------------------------------------------------------------------------
// Deteção de cabeçalhos / parsing
// ---------------------------------------------------------------------------

/** Normaliza texto para comparação de cabeçalhos (sem acento, minúsculo). */
export function normalizarCabecalho(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const SUGESTOES: Array<{ campo: CampoAlvo; padroes: string[] }> = [
  {
    campo: 'code',
    padroes: ['codigo', 'codigo produto', 'codigo do produto', 'cod produto', 'cod', 'code', 'sku'],
  },
  {
    campo: 'description',
    padroes: [
      'descricao',
      'descricao produto',
      'descricao do produto',
      'produto',
      'produto descricao',
      'nome produto',
      'description',
    ],
  },
  {
    campo: 'saldo',
    padroes: [
      'saldo',
      'saldo atual',
      'saldo estoque',
      'saldo de estoque',
      'estoque',
      'quantidade',
      'qt',
      'qtd',
      'qtde',
    ],
  },
  {
    campo: 'custo_medio',
    padroes: [
      'custo medio',
      'custo medio unitario',
      'custo medio unit',
      'cm',
      'custo medio r$',
      'valor custo medio',
      'preco medio',
      'custo unitario medio',
      'unit cost',
      'medium_cost',
    ],
  },
]

/** Auto-sugestão de mapeamento por nomes aproximados. */
export function sugerirMapeamento(colunas: ColunaPlanilha[]): Record<CampoAlvo, number | null> {
  const map: Record<CampoAlvo, number | null> = {
    code: null,
    description: null,
    saldo: null,
    custo_medio: null,
  }
  for (const col of colunas) {
    const norm = normalizarCabecalho(col.cabecalho)
    for (const sug of SUGESTOES) {
      if (map[sug.campo] !== null) continue
      const match = sug.padroes.some(
        (p) => norm === p || norm.startsWith(p + ' ') || norm.includes(p),
      )
      if (match) {
        map[sug.campo] = col.indice
        break
      }
    }
  }
  return map
}

function celulaParaTexto(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toLocaleDateString('pt-BR')
  return String(v).trim()
}

function celulaParaNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s) return null
  // Aceita "1.234,56", "1234.56", "R$ 6,54", "6.54"
  const limpo = s
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** Interpreta a célula de código: vira id numérico (spincare_id) quando puro número. */
function celulaParaId(v: unknown): number | string {
  const texto = celulaParaTexto(v)
  if (/^\d+$/.test(texto.replace(/^0+/, '') || texto)) {
    return Number(texto)
  }
  return texto
}

/** Lê o XLSX e devolve cabeçalhos + preview das 10 primeiras linhas + linhas brutas. */
export async function parsePlanilhaSaldo(file: File): Promise<ParsePlanilhaResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const nomeAba = workbook.SheetNames[0]
  if (!nomeAba) throw new Error('A planilha não tem nenhuma aba.')
  const ws = workbook.Sheets[nomeAba]
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  })
  if (matriz.length < 2) {
    throw new Error('A planilha não tem linhas de dados além do cabeçalho.')
  }
  const cabecalhos = (matriz[0] || []).map((c) => celulaParaTexto(c))
  const colunas = cabecalhos
    .map((cabecalho, indice) => ({ indice, cabecalho }))
    .filter((c) => c.cabecalho !== '')
  const linhasDados = matriz.slice(1)
  const preview = linhasDados.slice(0, 10).map((linha, i) => ({
    linha: i + 1,
    celulas: cabecalhos.map((_, ci) => celulaParaTexto(linha?.[ci])),
  }))
  return {
    colunas,
    preview,
    totalLinhas: linhasDados.length,
    linhasBrutas: linhasDados,
    nomeAba,
  }
}

/** Aplica o mapeamento confirmado pelo usuário às linhas brutas. */
export function mapearLinhas(
  parse: ParsePlanilhaResult,
  mapa: Record<CampoAlvo, number | null>,
): LinhaMapeada[] {
  const resultado: LinhaMapeada[] = []
  for (const linha of parse.linhasBrutas) {
    const raw: Record<string, unknown> = {}
    parse.colunas.forEach((c) => {
      raw[c.cabecalho] = linha?.[c.indice] ?? null
    })
    const codeCell = mapa.code !== null ? linha?.[mapa.code] : null
    const descCell = mapa.description !== null ? linha?.[mapa.description] : null
    const saldoCell = mapa.saldo !== null ? linha?.[mapa.saldo] : null
    const custoCell = mapa.custo_medio !== null ? linha?.[mapa.custo_medio] : null

    const id = celulaParaId(codeCell)
    const spincare_id = typeof id === 'number' ? id : null
    const code = typeof id === 'string' ? id : String(id)
    const description = celulaParaTexto(descCell)
    const saldo = celulaParaNumero(saldoCell)
    const custoMedio = celulaParaNumero(custoCell)

    // Sem id E sem descrição: linha vazia/lixo — ignorada na gravação.
    if (spincare_id === null && !code && !description) continue

    resultado.push({
      id,
      spincare_id,
      code,
      description,
      saldo,
      custo_medio_report: custoMedio,
      temCusto: custoMedio !== null && custoMedio > 0,
      raw,
    })
  }
  return resultado
}
