import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

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
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
  }

  // 1. Erros específicos por campo (validação de formulário)
  const fieldErrors = extractFieldErrors(error)
  const fieldMsgs = Object.values(fieldErrors)
  if (fieldMsgs.length > 0) {
    return fieldMsgs.join(' ')
  }

  // 2. Erro retornado no corpo da resposta (ex.: { error: "mensagem" } ou { message: "mensagem" })
  const responseData = error.response?.data
  if (responseData && typeof responseData === 'object') {
    const customError = (responseData as Record<string, unknown>).error
    if (typeof customError === 'string' && customError.trim()) {
      return customError.trim()
    }
    const customMsg = (responseData as Record<string, unknown>).message
    if (typeof customMsg === 'string' && customMsg.trim()) {
      return customMsg.trim()
    }
  }

  // 3. Mensagem do próprio ClientResponseError (evitando a frase genérica padrão em inglês quando possível)
  if (error.message && error.message !== 'Something went wrong while processing your request.') {
    return error.message
  }

  // 4. Mensagens contextuais por código HTTP se a mensagem for genérica
  if (error.status === 403) {
    return 'Acesso negado. Você não possui permissão para executar esta ação.'
  }
  if (error.status === 401) {
    return 'Sessão expirada ou não autenticada. Faça login novamente.'
  }
  if (error.status === 404) {
    return 'Recurso não encontrado no servidor.'
  }
  if (error.status >= 500) {
    return 'Falha no servidor ao processar a requisição. Tente novamente em instantes.'
  }

  return error.message || 'Ocorreu um erro inesperado.'
}
