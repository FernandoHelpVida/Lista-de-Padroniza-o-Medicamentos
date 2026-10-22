import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

// Dicionário amigável de campos para português
const FIELD_NAMES_PT: Record<string, string> = {
  email: 'E-mail institucional',
  password: 'Senha',
  passwordConfirm: 'Confirmação de senha',
  oldPassword: 'Senha atual',
  name: 'Nome completo',
  role: 'Perfil de acesso',
  justificativa: 'Justificativa clínica',
  status: 'Status',
  medicamento: 'Medicamento',
  resposta_comissao: 'Parecer da comissão',
  nome: 'Nome do medicamento',
  classe: 'Classe terapêutica',
}

// Mapeamento de mensagens conhecidas do PocketBase para pt-BR
function translatePocketBaseMessage(msg: string, field?: string): string {
  const lower = msg.toLowerCase().trim()

  if (lower.includes('must be at least') && lower.includes('characters')) {
    const minMatch = msg.match(/\d+/)
    const min = minMatch ? minMatch[0] : '8'
    return `O campo deve ter no mínimo ${min} caracteres.`
  }

  if (
    lower.includes('cannot be blank') ||
    lower.includes('missing required') ||
    lower.includes('is required')
  ) {
    return field ? `${FIELD_NAMES_PT[field] || field} é obrigatório.` : 'Este campo é obrigatório.'
  }

  if (
    lower.includes('already exists') ||
    lower.includes('unique constraint') ||
    lower.includes('must be unique')
  ) {
    if (field === 'email') {
      return 'Este e-mail já está cadastrado no sistema Help Vida.'
    }
    if (field === 'nome') {
      return 'Já existe um medicamento cadastrado com este nome.'
    }
    return 'Já existe um registro com estes mesmos dados.'
  }

  if (lower.includes('invalid email') || lower.includes('must be a valid email')) {
    return 'Informe um endereço de e-mail institucional válido.'
  }

  if (lower.includes('values do not match') || lower.includes('password confirm')) {
    return 'A confirmação de senha não coincide com a senha digitada.'
  }

  if (lower.includes('failed to authenticate') || lower.includes('invalid credentials')) {
    return 'E-mail institucional ou senha incorretos. Verifique suas credenciais.'
  }

  if (lower.includes('failed to create record')) {
    return 'Não foi possível cadastrar o registro. Verifique se os dados preenchidos estão corretos.'
  }

  if (lower.includes('failed to update record')) {
    return 'Não foi possível salvar as alterações do registro.'
  }

  if (lower.includes('failed to delete record')) {
    return 'Não foi possível excluir o registro.'
  }

  return msg
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      const rawMsg = (detail as { message: string }).message
      errors[field] = translatePocketBaseMessage(rawMsg, field)
    }
  }
  return errors
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage = 'Ocorreu um erro inesperado.',
): string {
  if (!error) return fallbackMessage

  if (error instanceof ClientResponseError) {
    // 1. Verificar se há erros detalhados de campos
    const fieldMap = extractFieldErrors(error)
    const fieldEntries = Object.entries(fieldMap)
    if (fieldEntries.length > 0) {
      return fieldEntries.map(([f, msg]) => `${FIELD_NAMES_PT[f] || f}: ${msg}`).join('\n')
    }

    // 2. Verificar mensagem do payload de resposta
    if (error.response?.message && typeof error.response.message === 'string') {
      const translated = translatePocketBaseMessage(error.response.message)
      if (translated && translated !== error.response.message) {
        return translated
      }
    }

    // 3. Status HTTP específico
    if (error.status === 400) {
      return 'Dados inválidos. Verifique os campos preenchidos e tente novamente.'
    }
    if (error.status === 401) {
      return 'Sua sessão expirou ou credenciais inválidas. Faça login novamente.'
    }
    if (error.status === 403) {
      return 'Você não possui permissão para executar esta operação.'
    }
    if (error.status === 404) {
      return 'Registro não encontrado.'
    }
    if (error.status >= 500) {
      return 'Servidor temporariamente indisponível. Tente novamente em alguns instantes.'
    }

    return translatePocketBaseMessage(error.message) || fallbackMessage
  }

  if (error instanceof Error) {
    return translatePocketBaseMessage(error.message)
  }

  if (typeof error === 'string') {
    return translatePocketBaseMessage(error)
  }

  return fallbackMessage
}
