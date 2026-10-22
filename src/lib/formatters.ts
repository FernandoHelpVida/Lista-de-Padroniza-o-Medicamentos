/**
 * Utilitários para formatação segura de datas e strings no app Help Vida.
 * Evita exceções do tipo RangeError ("Invalid time value") ao lidar com datas vazias, nulas ou inválidas do backend.
 */

export interface FormatarDataOptions {
  /** Se deve incluir horário (hh:mm). Padrão: false */
  incluirHora?: boolean
  /** Se deve incluir segundos (hh:mm:ss). Padrão: false */
  incluirSegundos?: boolean
  /** Texto de fallback quando o valor for ausente ou inválido. Padrão: '—' */
  fallback?: string
}

/**
 * Converte qualquer valor de data (string, número, Date, null, undefined) em texto formatado pt-BR.
 * Retorna o fallback seguro sem lançar exceções.
 */
export function formatarDataSegura(
  valor: string | number | Date | null | undefined,
  options: FormatarDataOptions = {},
): string {
  const { incluirHora = false, incluirSegundos = false, fallback = '—' } = options

  if (!valor) {
    return fallback
  }

  try {
    const data = valor instanceof Date ? valor : new Date(valor)

    // Validação de data válida (NaN indica Invalid Date)
    if (Number.isNaN(data.getTime())) {
      return fallback
    }

    const intlOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }

    if (incluirHora) {
      intlOptions.hour = '2-digit'
      intlOptions.minute = '2-digit'
    }

    if (incluirSegundos) {
      intlOptions.second = '2-digit'
    }

    return data.toLocaleDateString('pt-BR', intlOptions)
  } catch {
    return fallback
  }
}
