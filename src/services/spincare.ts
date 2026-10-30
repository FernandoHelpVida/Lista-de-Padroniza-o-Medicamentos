/**
 * Serviços tipados de integração com o middleware SpinCare (Help Vida).
 * Todas as requisições passam pelo backend PocketBase (/backend/v1/spincare/*)
 * que injeta credenciais seguras e registra auditoria LGPD.
 */
import pb from '@/lib/pocketbase/client'

export interface SpincareConfig {
  id?: string
  configured: boolean
  is_active: boolean
  base_url: string
  auth_type: 'bearer' | 'api_key_header' | 'basic'
  header_name: string
  token_prefix: string
  endpoint_patients: string
  endpoint_budgets: string
  endpoint_prescriptions?: string
  has_login?: boolean
  login_masked?: string
  has_password?: boolean
  has_token: boolean
  token_masked?: string
  last_tested_at?: string
  last_test_status?: string
  last_test_message?: string
}

export interface SaveSpincareConfigInput {
  base_url: string
  auth_type?: 'bearer' | 'api_key_header' | 'basic'
  header_name?: string
  token_prefix?: string
  api_login?: string
  api_password?: string
  api_token?: string
  endpoint_patients: string
  endpoint_budgets: string
  endpoint_prescriptions?: string
  is_active?: boolean
}

export interface TestConnectionResult {
  success: boolean
  statusCode?: number
  message: string
  testedAt?: string
  details?: Record<string, unknown>
}

export interface SpincarePatient {
  id: string
  nome: string
  documento: string
  dataNascimento: string
  telefone: string
  email: string
  endereco: string
  convenio: string
  modalidade: string
  statusAtendimento: string
  active?: boolean
}

export interface SpincareBudgetItem {
  id?: string
  codigo?: string
  descricao: string
  unidade?: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

export interface SpincareBudget {
  id: string
  numero: string
  pacienteId: string
  pacienteNome: string
  status: string
  dataAprovacao: string
  anoAprovacao: number | null
  valor: number
  observacao: string
  itens: SpincareBudgetItem[]
}

export interface SpincareConvenioComContagem {
  name: string
  count: number
}

export interface SpincarePatientsSearchResult {
  total: number
  page: number
  limit: number
  items: SpincarePatient[]
  convenios?: string[]
  conveniosComContagem?: SpincareConvenioComContagem[]
  modalidades?: string[]
}

export interface SpincarePatientDetailResult {
  patient: SpincarePatient
  budgets: SpincareBudget[]
}

export interface SpincareBudgetsResult {
  total: number
  startDate: string
  endDate: string
  statusFilter: string
  page: number
  limit: number
  items: SpincareBudget[]
}

export interface SpincarePrescriptionItem {
  id: string
  codigo?: string
  descricao: string
  posologia?: string
  dose?: string
  frequencia?: string
  viaAdministracao?: string
  unidade?: string
  quantidade?: number
  observacao?: string
  fornecimento?: string
}
export interface SpincarePrescription {
  id: string
  numero: string
  pacienteId: string
  pacienteNome: string
  medicoPrescritor: string
  medicoId?: string
  dataPrescricao: string
  dataInicial: string
  dataFinal: string
  status: string
  tipo?: string
  itens: SpincarePrescriptionItem[]
}

export interface SpincarePrescriptionsResult {
  total: number
  startDate: string
  endDate: string
  page: number
  limit: number
  items: SpincarePrescription[]
}

export interface CheckMedicationOccurrence {
  prescricaoId: string
  prescricaoNumero: string
  pacienteId: string
  pacienteNome: string
  medicoPrescritor: string
  dataPrescricao: string
  dataInicial: string
  dataFinal: string
  status: string
  item: {
    id: string
    codigo: string
    descricao: string
    posologia: string
    dose: string
    viaAdministracao: string
    unidade: string
    quantidade: number
    observacao: string
    fornecimento: string
  }
}

export interface CheckMedicationCandidate {
  id: string
  name: string
  document?: string
  registration_number?: string
  birth_date?: string
  health_insurance_name?: string
  active?: boolean
}

export interface CheckMedicationResult {
  success: boolean
  found: boolean
  hasHomonyms?: boolean
  homonymWarning?: string
  candidates?: CheckMedicationCandidate[]
  resolvedPatient?: {
    id: string
    name: string
  } | null
  totalOccurrences: number
  prescriptionsCount: number
  analyzedPrescriptionsCount: number
  searchedMedication: string
  searchedPatient: string
  startDate: string
  endDate: string
  occurrences: CheckMedicationOccurrence[]
}

export interface SyncPrescriptionsResult {
  success: boolean
  trigger: 'manual' | 'cron'
  totalFetched: number
  created: number
  updated: number
  ignored: number
  syncedAt: string
  durationMs: number
  alreadyRunning?: boolean
  message?: string
}

export interface SyncStatusResult {
  isRunning: boolean
  totalPrescriptions: number
  lastSyncedAt: string
}

/**
 * Recupera o status atual da configuração do SpinCare.
 */
export async function getSpincareConfig(): Promise<SpincareConfig> {
  return await pb.send<SpincareConfig>('/backend/v1/spincare/config', {
    method: 'GET',
  })
}

/**
 * Salva os parâmetros da integração com o SpinCare (Admin only).
 */
export async function saveSpincareConfig(
  data: SaveSpincareConfigInput,
): Promise<{ success: boolean; message: string }> {
  return await pb.send<{ success: boolean; message: string }>('/backend/v1/spincare/config', {
    method: 'POST',
    body: data,
  })
}

/**
 * Testa a conexão com a API do SpinCare (Admin only).
 */
export async function testSpincareConnection(
  data?: Partial<SaveSpincareConfigInput>,
): Promise<TestConnectionResult> {
  return await pb.send<TestConnectionResult>('/backend/v1/spincare/test-connection', {
    method: 'POST',
    body: data || {},
  })
}

/**
 * Busca pacientes ao vivo no SpinCare por nome e/ou documento.
 */
export async function searchSpincarePatients(params: {
  query?: string
  documento?: string
  convenio?: string
  fetchAll?: boolean
  limit?: number
  page?: number
}): Promise<SpincarePatientsSearchResult> {
  return await pb.send<SpincarePatientsSearchResult>('/backend/v1/spincare/patients/search', {
    method: 'POST',
    body: params,
  })
}

/**
 * Obtém os dados cadastrais completos do paciente e seus orçamentos aprovados.
 */
export async function getSpincarePatientById(
  patientId: string,
): Promise<SpincarePatientDetailResult> {
  return await pb.send<SpincarePatientDetailResult>(
    `/backend/v1/spincare/patients/${encodeURIComponent(patientId)}`,
    {
      method: 'GET',
    },
  )
}

/**
 * Busca a listagem de orçamentos aprovados no SpinCare (padrão >= 2026-01-01).
 */
export async function getSpincareBudgets(params?: {
  startDate?: string
  endDate?: string
  status?: string
  search?: string
  patientId?: string
  fetchAll?: boolean
  limit?: number
  page?: number
}): Promise<SpincareBudgetsResult> {
  const query = new URLSearchParams()
  if (params?.startDate) query.set('start_date', params.startDate)
  if (params?.endDate) query.set('end_date', params.endDate)
  if (params?.status) query.set('status', params.status)
  if (params?.search) query.set('search', params.search)
  if (params?.patientId) query.set('patient_id', params.patientId)
  if (params?.fetchAll !== undefined) query.set('fetchAll', String(params.fetchAll))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.page) query.set('page', String(params.page))

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return await pb.send<SpincareBudgetsResult>(`/backend/v1/spincare/budgets${queryString}`, {
    method: 'GET',
  })
}

/**
 * Busca prescrições médicas no SpinCare (padrão >= 2026-01-01).
 * Suporta paginação completa server-side, busca por paciente e filtro de datas.
 */
export async function getSpincarePrescriptions(params?: {
  startDate?: string
  endDate?: string
  search?: string
  patientId?: string
  statusId?: number
  fetchAll?: boolean
  limit?: number
  page?: number
}): Promise<SpincarePrescriptionsResult> {
  const query = new URLSearchParams()
  if (params?.startDate) query.set('start_date', params.startDate)
  if (params?.endDate) query.set('end_date', params.endDate)
  if (params?.search) query.set('search', params.search)
  if (params?.patientId) query.set('patient_id', params.patientId)
  if (params?.statusId !== undefined) query.set('status_id', String(params.statusId))
  if (params?.fetchAll !== undefined) query.set('fetchAll', String(params.fetchAll))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.page) query.set('page', String(params.page))

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return await pb.send<SpincarePrescriptionsResult>(
    `/backend/v1/spincare/prescriptions${queryString}`,
    {
      method: 'GET',
    },
  )
}

/**
 * Realiza a busca combinada exaustiva server-side de medicamento prescrito no período.
 * Avalia TODAS as prescrições do período no servidor com matching tolerante.
 */
export async function checkSpincareMedicationPrescribed(params: {
  medication: string
  patientName?: string
  patientId?: string
  startDate?: string
  endDate?: string
}): Promise<CheckMedicationResult> {
  return await pb.send<CheckMedicationResult>(
    '/backend/v1/spincare/prescriptions/check-medication',
    {
      method: 'POST',
      body: {
        medication: params.medication,
        patient_name: params.patientName,
        patient_id: params.patientId,
        start_date: params.startDate,
        end_date: params.endDate,
      },
    },
  )
}

/**
 * Dispara manualmente a sincronização (CDC) de prescrições a partir de 2026.
 */
export async function triggerPrescriptionsSync(): Promise<SyncPrescriptionsResult> {
  return await pb.send<SyncPrescriptionsResult>('/backend/v1/spincare/prescriptions/sync', {
    method: 'POST',
  })
}

/**
 * Consulta o status atual da replicação de prescrições (se está em execução, total e última atualização).
 */
export async function getPrescriptionsSyncStatus(): Promise<SyncStatusResult> {
  return await pb.send<SyncStatusResult>('/backend/v1/spincare/prescriptions/sync-status', {
    method: 'GET',
  })
}

export interface PrescricaoSyncRecord {
  id: string
  spincare_id: string
  numero: string
  paciente_id: string
  paciente_nome: string
  medico_prescritor: string
  medico_id: string
  data_prescricao: string
  data_prescricao_iso: string
  data_inicial: string
  data_inicial_iso: string
  data_final: string
  data_final_iso: string
  status: string
  tipo: string
  total_itens: number
  itens: SpincarePrescriptionItem[]
  payload: Record<string, unknown>
  synced_at: string
  created: string
  updated: string
}

export interface SyncBudgetsResult {
  success: boolean
  trigger?: string
  totalFetched: number
  created: number
  updated: number
  ignored: number
  syncedAt: string
  durationMs: number
  alreadyRunning?: boolean
  message?: string
}

export interface BudgetSyncStatusResult {
  isRunning: boolean
  totalBudgets: number
  lastSyncedAt: string
}

export interface OrcamentoSyncRecord {
  id: string
  spincare_id: string
  numero: string
  paciente_id: string
  paciente_nome: string
  status: string
  data_aprovacao: string
  data_aprovacao_iso: string
  data_inicial: string
  data_inicial_iso: string
  data_final: string
  data_final_iso: string
  ano_aprovacao: number
  valor_total: number
  convenio: string
  observacao: string
  total_itens: number
  itens: SpincareBudgetItem[]
  payload: Record<string, unknown>
  synced_at: string
  created: string
  updated: string
}

/**
 * Dispara manualmente a sincronização (CDC) de orçamentos a partir de 2026.
 */
export async function triggerBudgetsSync(): Promise<SyncBudgetsResult> {
  return await pb.send<SyncBudgetsResult>('/backend/v1/spincare/budgets/sync', {
    method: 'POST',
  })
}

/**
 * Consulta o status atual da replicação de orçamentos (se está em execução, total e última atualização).
 */
export async function getBudgetsSyncStatus(): Promise<BudgetSyncStatusResult> {
  return await pb.send<BudgetSyncStatusResult>('/backend/v1/spincare/budgets/sync-status', {
    method: 'GET',
  })
}
