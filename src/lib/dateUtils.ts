/**
 * Utilitários para parsing e formatação segura de datas no fuso horário do Brasil (America/Sao_Paulo).
 *
 * Atenção ao bug crítico corrigido:
 * Strings de data pura (sem hora / sem 'T' / sem 'Z') como "2026-09-30" ou "01/09/2026"
 * NÃO devem passar por new Date(raw) / Intl, pois new Date("2026-09-30") interpreta como
 * meia-noite UTC (00:00:00Z) e, ao converter para America/Sao_Paulo (UTC-3), volta um dia (vira 29/09 21:00).
 *
 * Apenas strings com indicação explícita de horário/fuso ('T', 'Z' ou espaço seguido de hora)
 * são convertidas pelo fuso horário quando solicitadas ou quando têm sufixo UTC.
 */

export interface ParseDateOptions {
  interpretInSaoPauloTz?: boolean
}

/**
 * Converte data dd/mm/aaaa, yyyy-mm-dd ou ISO 8601 com hora para número comparável yyyymmdd.
 * Exemplo: "2026-09-30" -> 20260930, "01/09/2026" -> 20260901, "2026-10-01T03:59:00Z" -> 20260930 (em SP).
 */
export function parseDateToComparable(
  dateStr: string | null | undefined,
  options?: ParseDateOptions,
): number | null {
  if (!dateStr || dateStr === '—') return null
  const raw = String(dateStr).trim()
  if (!raw) return null

  // Verifica se a string contém indicação de hora ou fuso
  // Ex: "2026-10-01T03:59:00Z", "2026-10-01 03:59:00", "2026-10-01T03:59:00"
  const hasTimeOrTz =
    raw.includes('T') ||
    raw.includes('Z') ||
    /\s\d{1,2}:\d{2}/.test(raw) ||
    /[+-]\d{2}:\d{2}$/.test(raw)

  // Apenas passa por new Date() / Intl se houver hora/fuso E (options?.interpretInSaoPauloTz ou tiver T/Z)
  if (hasTimeOrTz && (options?.interpretInSaoPauloTz || raw.includes('T') || raw.includes('Z'))) {
    try {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) {
        const formatter = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const parts = formatter.formatToParts(d)
        const y = parts.find((p) => p.type === 'year')?.value
        const m = parts.find((p) => p.type === 'month')?.value
        const day = parts.find((p) => p.type === 'day')?.value
        if (y && m && day) {
          return parseInt(`${y}${m.padStart(2, '0')}${day.padStart(2, '0')}`, 10)
        }
      }
    } catch (_) {
      // Fallback para parse textual abaixo
    }
  }

  // Parse puramente textual para datas puras ou strings sem conversão de fuso necessária
  const s = raw.split('T')[0].split(' ')[0]
  if (s.includes('/')) {
    const parts = s.split('/')
    if (parts.length === 3) {
      // Formato dd/mm/aaaa
      if (parts[2].length === 4) {
        return parseInt(`${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`, 10)
      }
      // Formato aaaa/mm/dd caso ocorra
      if (parts[0].length === 4) {
        return parseInt(`${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`, 10)
      }
    }
  } else if (s.includes('-')) {
    const parts = s.split('-')
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // Formato yyyy-mm-dd
        return parseInt(`${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`, 10)
      } else if (parts[2].length === 4) {
        // Formato dd-mm-yyyy
        return parseInt(`${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`, 10)
      }
    }
  }

  return null
}

/**
 * Formata com segurança uma string ISO (com ou sem hora) para dd/mm/aaaa no Brasil.
 */
export function formatIsoToBr(isoDate: string | null | undefined): string {
  if (!isoDate || isoDate === '—') return '—'
  const raw = String(isoDate).trim()

  const hasTimeOrTz = raw.includes('T') || raw.includes('Z') || /\s\d{1,2}:\d{2}/.test(raw)

  if (hasTimeOrTz) {
    try {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      }
    } catch (_) {
      // Fallback
    }
  }

  const comp = parseDateToComparable(raw)
  if (comp) {
    const str = String(comp)
    return `${str.substring(6, 8)}/${str.substring(4, 6)}/${str.substring(0, 4)}`
  }
  return raw
}
