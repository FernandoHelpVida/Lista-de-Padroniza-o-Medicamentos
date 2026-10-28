import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { MedicamentoRecord } from '@/pages/Index'
import {
  parseSpreadsheetFile,
  normalizeStr,
  ParsedMedicamento,
  StatusPadronizacao,
  UnrecognizedItem,
  ItemDescartado,
  ItemFaltanteRelatorio,
  buildSpreadsheetMissingReport,
  exportSpreadsheetMissingItemsToCsv,
} from '@/lib/spreadsheet/spreadsheetParser'
import { runSpreadsheetParserValidationTests } from '@/lib/spreadsheet/spreadsheetParserValidation.test'
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Search,
  Filter,
  Check,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  FileCheck2,
  AlertCircle,
  Download,
  History,
  User as UserIcon,
  Calendar,
  Trash2,
  Copy,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarDataSegura } from '@/lib/formatters'

export type ItemDiffStatus = 'NOVO' | 'EXISTENTE' | 'SEM_ALTERACAO'

export interface PreviewItem extends ParsedMedicamento {
  diffStatus: ItemDiffStatus
  existingId?: string
  existingStatus?: StatusPadronizacao
  selected: boolean
}

export interface HistoricoImportacaoRecord {
  id: string
  nome_arquivo: string
  total_itens: number
  criados: number
  atualizados: number
  inalterados: number
  ignorados: number
  usuario?: string
  created: string
  expand?: {
    usuario?: {
      name?: string
      email?: string
    }
  }
}

export default function Importar() {
  const { user, isAdmin, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados do processo
  const [existingMeds, setExistingMeds] = useState<MedicamentoRecord[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionStage, setExtractionStage] = useState('')

  // Itens analisados
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [unrecognizedItems, setUnrecognizedItems] = useState<UnrecognizedItem[]>([])
  const [descartadosList, setDescartadosList] = useState<ItemDescartado[]>([])
  const [documentStats, setDocumentStats] = useState<{
    totalLinhas: number
    fileName: string
    fileSize: string
    sheetName: string
  } | null>(null)

  // Estado para expandir/colapsar tabela detalhada de duplicados
  const [duplicatesTableExpanded, setDuplicatesTableExpanded] = useState(false)
  const [duplicatesFilterSearch, setDuplicatesFilterSearch] = useState('')

  // Estado para o painel de itens faltantes
  const [missingTableExpanded, setMissingTableExpanded] = useState(true)
  const [missingFilterSearch, setMissingFilterSearch] = useState('')
  const [missingFilterOrigem, setMissingFilterOrigem] = useState<
    'TODOS' | 'descarte_registrado' | 'sem_correspondencia'
  >('TODOS')

  // Filtros da tabela de pré-visualização
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDiff, setFilterDiff] = useState<'TODOS' | ItemDiffStatus>('TODOS')

  // Estado de gravação
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'importar' | 'historico'>('importar')
  const [historicoList, setHistoricoList] = useState<HistoricoImportacaoRecord[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [importSummary, setImportSummary] = useState<{
    novos: number
    atualizados: number
    inalterados: number
    ignorados: number
  } | null>(null)

  // Estados para o diálogo de zerar catálogo de medicamentos
  const [zerarModalOpen, setZerarModalOpen] = useState(false)
  const [zerarConfirmationText, setZerarConfirmationText] = useState('')
  const [zerandoCatalogo, setZerandoCatalogo] = useState(false)

  // Carregar histórico de importações
  const loadHistorico = async () => {
    setLoadingHistorico(true)
    try {
      const records = await pb
        .collection('historico_importacoes')
        .getFullList<HistoricoImportacaoRecord>({
          sort: '-created',
          expand: 'usuario',
        })
      setHistoricoList(records)
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
    } finally {
      setLoadingHistorico(false)
    }
  }

  // 1. Carregar base de medicamentos existente para comparação
  const loadExistingMedicamentos = async () => {
    try {
      const records = await pb.collection<MedicamentoRecord>('medicamentos').getFullList({
        sort: 'pdfId',
      })
      setExistingMeds(records)
    } catch (err) {
      console.error('Erro ao carregar medicamentos existentes:', err)
      toast({
        title: 'Aviso de sincronização',
        description:
          getErrorMessage(err) || 'Não foi possível carregar os medicamentos já cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoadingExisting(false)
    }
  }

  useEffect(() => {
    loadExistingMedicamentos()
    loadHistorico()

    // Auto-execução dos testes de validação do parser de planilha
    try {
      const testOutcome = runSpreadsheetParserValidationTests()
      console.log('[SPREADSHEET-TESTS] Auto-validation passed:', testOutcome)
    } catch (testErr) {
      console.warn('[SPREADSHEET-TESTS] Warning in spreadsheet validation tests:', testErr)
    }
  }, [])

  // Mapas de medicamentos existentes no banco: prioritário por pdfId e fallback por nome
  const existingByPdfId = useMemo(() => {
    const map = new Map<number, MedicamentoRecord>()
    for (const med of existingMeds) {
      if (med.pdfId && med.pdfId >= 1 && med.pdfId <= 482) {
        map.set(med.pdfId, med)
      }
    }
    return map
  }, [existingMeds])

  const existingMapByName = useMemo(() => {
    const map = new Map<string, MedicamentoRecord>()
    for (const med of existingMeds) {
      const key = normalizeStr(med.nome)
      if (key) {
        map.set(key, med)
      }
    }
    return map
  }, [existingMeds])

  // Processar arquivo de planilha (XLSX ou CSV) selecionado pelo usuário
  const processSpreadsheetFileOrBlob = async (
    fileOrBlob: File | Blob,
    fileName: string,
    fileSizeStr: string,
  ) => {
    setExtracting(true)
    setExtractionProgress(15)
    setExtractionStage('Lendo arquivo de planilha...')
    setImportSummary(null)

    try {
      setExtractionProgress(40)
      setExtractionStage('Analisando linhas, colunas e cabeçalhos...')

      const parseResult = await parseSpreadsheetFile(fileOrBlob, fileName)

      setExtractionProgress(75)
      setExtractionStage('Validando regras de negócio e mapeando status...')

      if (
        !parseResult ||
        (parseResult.items.length === 0 && parseResult.descartados.length === 0)
      ) {
        throw new Error(
          'A planilha enviada não contém linhas de medicamentos reconhecíveis. Verifique as colunas (ID, Nome do medicamento, Classe, Definição).',
        )
      }

      setExtractionProgress(90)
      setExtractionStage('Comparando com a base de dados Help Vida atual...')

      // Cruzar com os dados existentes por casamento PRIORITÁRIO por pdfId (Regra Help Vida Oficial)
      const previews: PreviewItem[] = parseResult.items.map((item) => {
        let existing: MedicamentoRecord | undefined = undefined
        if (item.pdfId && item.pdfId >= 1 && item.pdfId <= 482) {
          existing = existingByPdfId.get(item.pdfId)
        }
        if (!existing) {
          const key = normalizeStr(item.nome)
          existing = existingMapByName.get(key)
        }

        let diffStatus: ItemDiffStatus = 'NOVO'
        let existingId: string | undefined = undefined
        let existingStatus: StatusPadronizacao | undefined = undefined

        if (existing) {
          existingId = existing.id
          existingStatus = existing.status
          const statusMudou = existing.status !== item.status
          const nomeMudou = normalizeStr(existing.nome) !== normalizeStr(item.nome)
          const classeMudou = Boolean(
            item.classe && normalizeStr(existing.classe) !== normalizeStr(item.classe),
          )
          const itemClasseDetalhada = (item.classeDetalhada || '').trim()
          const existingClasseDetalhada = (existing.classe_detalhada || '').trim()
          const classeDetalhadaMudou = Boolean(
            itemClasseDetalhada &&
            normalizeStr(existingClasseDetalhada) !== normalizeStr(itemClasseDetalhada),
          )
          const pdfIdMudou = !existing.pdfId && item.pdfId

          if (statusMudou || nomeMudou || classeMudou || classeDetalhadaMudou || pdfIdMudou) {
            diffStatus = 'EXISTENTE' // dados mudaram, precisa atualizar
          } else {
            diffStatus = 'SEM_ALTERACAO' // exatamente igual
          }
        } else {
          diffStatus = 'NOVO'
        }

        return {
          ...item,
          diffStatus,
          existingId,
          existingStatus,
          selected: true, // selecionar por padrão para sincronização completa
        }
      })

      // Ordenar por ID oficial crescente (1..482)
      previews.sort((a, b) => a.pdfId - b.pdfId)

      setPreviewItems(previews)
      setUnrecognizedItems(parseResult.unrecognized)
      setDescartadosList(parseResult.descartados || [])
      setDocumentStats({
        totalLinhas: parseResult.totalLinhasLidas,
        fileName,
        fileSize: fileSizeStr,
        sheetName: parseResult.nomeAbaUsada || 'Medicamentos',
      })

      setExtractionProgress(100)
      const countPad = previews.filter((p) => p.status === 'Padronizado').length
      const countNao = previews.filter((p) => p.status === 'Não Padronizado').length
      const countInat = previews.filter((p) => p.status === 'Inativo').length

      // Gravar log de auditoria no audit_logs automaticamente
      try {
        await pb.collection('audit_logs').create({
          colecao: 'medicamentos',
          registro_id: 'audit_planilha_result',
          acao: 'AUDIT_PLANILHA_482',
          usuario_nome: user?.name || user?.email || 'Auditoria Help Vida',
          status_anterior: 'Conferência de planilha semanal',
          status_novo: `${previews.length} (${countPad} Padronizados, ${countNao} Não Padronizados, ${countInat} Inativos)`,
          detalhes: JSON.stringify({
            arquivo: fileName,
            total_linhas_lidas: parseResult.totalLinhasLidas,
            itens_validos: previews.length,
            descartados_count: parseResult.descartados.length,
            padronizados: countPad,
            nao_padronizados: countNao,
            inativos: countInat,
            regua_482_completa:
              previews.length === 482 && countPad === 238 && countNao === 217 && countInat === 27,
          }),
        })
      } catch (logErr) {
        console.warn('Erro ao salvar log de auditoria da planilha:', logErr)
      }

      toast({
        title: 'Planilha Carregada com Sucesso!',
        description: `${previews.length} medicamentos identificados (${countPad} Padronizados, ${countNao} Não Padronizados, ${countInat} Inativos).`,
      })
    } catch (err: unknown) {
      console.error('Falha ao processar planilha:', err)
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o arquivo de planilha. Verifique se o formato é .xlsx ou .csv válido.'
      toast({
        title: 'Erro na leitura da planilha',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
    }
  }

  // Manipular upload de arquivo pelo usuário (.xlsx ou .csv)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    const isXlsx =
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'
    const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv'

    if (!isXlsx && !isCsv) {
      toast({
        title: 'Formato inválido',
        description:
          'Por favor, selecione uma planilha Excel (.xlsx) ou arquivo separado por vírgula (.csv).',
        variant: 'destructive',
      })
      return
    }

    setSelectedFile(file)
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2)
    const sizeLabel =
      file.size > 1024 * 1024 ? `${sizeInMb} MB` : `${Math.round(file.size / 1024)} KB`
    await processSpreadsheetFileOrBlob(file, file.name, sizeLabel)
  }

  // Estrutura para análise de itens duplicados entre os extraídos
  const duplicateStats = useMemo(() => {
    // 1. Duplicados por pdfId (IDs repetidos na planilha)
    const pdfIdDupMap = new Map<number, PreviewItem[]>()
    // 2. Duplicados por nome normalizado
    const nameMap = new Map<string, PreviewItem[]>()

    for (const item of previewItems) {
      if (item.pdfId && item.pdfId >= 1 && item.pdfId <= 482) {
        const list = pdfIdDupMap.get(item.pdfId) || []
        list.push(item)
        pdfIdDupMap.set(item.pdfId, list)
      }

      const key = normalizeStr(item.nome)
      if (key) {
        const list = nameMap.get(key) || []
        list.push(item)
        nameMap.set(key, list)
      }
    }

    const duplicatesByPdfId = Array.from(pdfIdDupMap.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([pdfId, list]) => ({
        pdfId,
        count: list.length,
        nomes: list.map((i) => i.nome),
        items: list,
      }))

    const duplicateNamesList = Array.from(nameMap.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => {
        const first = list[0]
        const statuses = list.map((i) => i.status)
        const uniqueStatuses = new Set(statuses)
        const hasConflict = uniqueStatuses.size > 1

        const resolvePrecedence = (stList: StatusPadronizacao[]): StatusPadronizacao => {
          if (stList.includes('Inativo')) return 'Inativo'
          if (stList.includes('Não Padronizado')) return 'Não Padronizado'
          return 'Padronizado'
        }

        return {
          nome: first.nome,
          normalizedKey: key,
          count: list.length,
          statuses,
          hasConflict,
          resolvedStatus: resolvePrecedence(statuses),
          classes: Array.from(new Set(list.map((i) => i.classe).filter(Boolean))),
          items: list,
        }
      })
      .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome))

    const uniqueKeysSelected = new Set(
      previewItems
        .filter((i) => i.selected)
        .map((i) => normalizeStr(i.nome))
        .filter(Boolean),
    )
    const catalogoFinalPrevisto = uniqueKeysSelected.size

    return {
      duplicates: duplicateNamesList,
      totalDuplicatesCount: duplicateNamesList.length,
      totalRepetitions: duplicateNamesList.reduce((acc, d) => acc + (d.count - 1), 0),
      catalogoFinalPrevisto,
      duplicatesByPdfId,
    }
  }, [previewItems])

  // Contagens dos itens
  const counts = useMemo(() => {
    const total = previewItems.length
    const novos = previewItems.filter((i) => i.diffStatus === 'NOVO').length
    const existentes = previewItems.filter((i) => i.diffStatus === 'EXISTENTE').length
    const semAlteracao = previewItems.filter((i) => i.diffStatus === 'SEM_ALTERACAO').length
    const selecionados = previewItems.filter((i) => i.selected).length

    // Contagens de padronização exigidas pela auditoria oficial:
    // 238 padronizados, 217 não padronizados, 27 inativos = 482
    const padronizados = previewItems.filter((i) => i.status === 'Padronizado').length
    const naoPadronizados = previewItems.filter((i) => i.status === 'Não Padronizado').length
    const inativos = previewItems.filter((i) => i.status === 'Inativo').length
    const atendeReguaOficial =
      total === 482 && padronizados === 238 && naoPadronizados === 217 && inativos === 27

    // Contagem de IDs extraídos válidos (1 a 482)
    const validPdfIds = new Set(
      previewItems
        .map((i) => i.pdfId)
        .filter((id): id is number => typeof id === 'number' && id >= 1 && id <= 482),
    )
    const pdfIdsCount = validPdfIds.size

    // Medicamentos existentes no banco que NÃO estão presentes nesta importação (ausentes)
    const ausentesNoBanco = existingMeds.filter((m) => {
      if (m.pdfId && m.pdfId >= 1 && m.pdfId <= 482) {
        return !validPdfIds.has(m.pdfId)
      }
      return false
    })

    return {
      total,
      novos,
      existentes,
      semAlteracao,
      selecionados,
      padronizados,
      naoPadronizados,
      inativos,
      atendeReguaOficial,
      pdfIdsCount,
      ausentesNoBanco,
    }
  }, [previewItems, existingMeds])

  // Relatório oficial de itens faltantes no intervalo 1..482
  const missingItemsReport = useMemo(() => {
    return buildSpreadsheetMissingReport(previewItems, descartadosList, 1, 482)
  }, [previewItems, descartadosList])

  // Filtros da tabela de itens faltantes
  const filteredMissingItems = useMemo(() => {
    const q = missingFilterSearch.toLowerCase().trim()
    return missingItemsReport.filter((item) => {
      if (missingFilterOrigem !== 'TODOS' && item.origemEvidencia !== missingFilterOrigem) {
        return false
      }
      if (q) {
        const idMatch = item.pdfId.toString().includes(q)
        const motivoMatch = item.motivo.toLowerCase().includes(q)
        const rawMatch = (item.rawText || '').toLowerCase().includes(q)
        const secaoMatch = (item.secao || '').toLowerCase().includes(q)
        if (!idMatch && !motivoMatch && !rawMatch && !secaoMatch) {
          return false
        }
      }
      return true
    })
  }, [missingItemsReport, missingFilterSearch, missingFilterOrigem])

  // Exportar relatório de itens faltantes em CSV
  const handleExportMissingCsv = () => {
    if (missingItemsReport.length === 0) {
      toast({
        title: 'Nenhum item faltante',
        description: 'Todos os 482 IDs da régua oficial foram identificados com sucesso (482/482).',
      })
      return
    }

    try {
      const csvContent = exportSpreadsheetMissingItemsToCsv(missingItemsReport)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const fileName = `relatorio-itens-faltantes-planilha-${new Date().toISOString().split('T')[0]}.csv`
      link.setAttribute('href', url)
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'Relatório CSV exportado',
        description: `${missingItemsReport.length} itens faltantes exportados com sucesso.`,
      })
    } catch (err) {
      console.error('Erro ao exportar CSV de faltantes:', err)
      toast({
        title: 'Erro na exportação',
        description: 'Não foi possível gerar o arquivo CSV.',
        variant: 'destructive',
      })
    }
  }

  // Filtragem da lista de pré-visualização
  const filteredPreview = useMemo(() => {
    const q = filterSearch.toLowerCase().trim()

    return previewItems.filter((item) => {
      if (filterDiff !== 'TODOS' && item.diffStatus !== filterDiff) {
        return false
      }
      if (q) {
        const matchId = item.pdfId.toString().includes(q)
        const matchNome = item.nome.toLowerCase().includes(q)
        const matchClasse = item.classe.toLowerCase().includes(q)
        if (!matchId && !matchNome && !matchClasse) return false
      }
      return true
    })
  }, [previewItems, filterSearch, filterDiff])

  // Alternar seleção individual
  const toggleItemSelection = (index: number) => {
    setPreviewItems((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], selected: !copy[index].selected }
      return copy
    })
  }

  // Selecionar / desselecionar todos os filtrados
  const handleSelectAllFiltered = (selected: boolean) => {
    const filteredIds = new Set(filteredPreview.map((item) => item.pdfId))

    setPreviewItems((prev) =>
      prev.map((item) => {
        if (filteredIds.has(item.pdfId)) {
          return { ...item, selected }
        }
        return item
      }),
    )
  }

  // Executar a sincronização / gravação dos medicamentos
  const handleExecuteImport = async () => {
    const toImport = previewItems.filter((i) => i.selected)
    if (toImport.length === 0) {
      toast({
        title: 'Nenhum medicamento selecionado',
        description: 'Selecione ao menos um medicamento para importar.',
        variant: 'destructive',
      })
      return
    }

    setImporting(true)
    setImportProgress(10)

    let countNovos = 0
    let countAtualizados = 0
    let countInalterados = 0
    const countIgnorados = previewItems.length - toImport.length

    try {
      let syncedViaBackend = false

      // Tentativa 1: Endpoint otimizado de bulk-sync no backend (/backend/v1/medicamentos/bulk-sync)
      try {
        const syncData = await pb.send<{
          criados: number
          atualizados: number
          inalterados: number
          total_catalogo_final?: number
        }>('/backend/v1/medicamentos/bulk-sync', {
          method: 'POST',
          body: {
            items: toImport.map((i) => ({
              pdfId: i.pdfId,
              nome: i.nome.trim(),
              classe: i.classe.trim(),
              classe_detalhada: (i.classeDetalhada || '').trim(),
              status: i.status,
              descricao: i.descricao || '',
              observacao: i.observacao || '',
            })),
            record_history: true,
            file_name:
              documentStats?.fileName || selectedFile?.name || 'planilha_medicamentos.xlsx',
            ignorados: countIgnorados,
          },
        })

        if (syncData) {
          countNovos = syncData.criados || 0
          countAtualizados = syncData.atualizados || 0
          countInalterados = syncData.inalterados || 0
          syncedViaBackend = true
          setImportProgress(100)
        }
      } catch (bkErr) {
        console.warn('Endpoint de bulk-sync falhou, executando em lotes client-side:', bkErr)
      }

      // Tentativa 2: Fallback direto no PocketBase client-side por pdfId
      if (!syncedViaBackend) {
        const currentDbMeds = await pb.collection('medicamentos').getFullList<{
          id: string
          pdfId: number
          nome: string
          status: string
          classe: string
          classe_detalhada?: string
          observacao?: string
        }>({ fields: 'id,pdfId,nome,status,classe,classe_detalhada,observacao' })

        const dbByPdfId = new Map<
          number,
          { id: string; status: string; classe: string; classe_detalhada?: string; nome: string }
        >()
        for (const m of currentDbMeds) {
          if (m.pdfId) {
            dbByPdfId.set(m.pdfId, {
              id: m.id,
              status: m.status,
              classe: m.classe,
              classe_detalhada: m.classe_detalhada,
              nome: m.nome,
            })
          }
        }

        let idx = 0
        for (const item of toImport) {
          const existing = dbByPdfId.get(item.pdfId)

          const payload = {
            pdfId: item.pdfId,
            nome: item.nome,
            classe: item.classe,
            classe_detalhada: (item.classeDetalhada || '').trim(),
            status: item.status,
            descricao: item.descricao || '',
            observacao: item.observacao || '',
          }

          if (existing) {
            const mudouStatus = existing.status !== item.status
            const mudouClasse = existing.classe !== item.classe
            const mudouClasseDetalhada =
              (existing.classe_detalhada || '').trim() !== payload.classe_detalhada
            const mudouNome = existing.nome !== item.nome

            if (mudouStatus || mudouClasse || mudouClasseDetalhada || mudouNome) {
              await pb.collection('medicamentos').update(existing.id, payload)
              countAtualizados++
            } else {
              countInalterados++
            }
          } else {
            await pb.collection('medicamentos').create(payload)
            countNovos++
          }

          idx++
          setImportProgress(Math.round((idx / toImport.length) * 100))
        }

        // Gravar no histórico de importações
        try {
          await pb.collection('historico_importacoes').create({
            nome_arquivo:
              documentStats?.fileName || selectedFile?.name || 'planilha_medicamentos.xlsx',
            total_itens: previewItems.length,
            criados: countNovos,
            atualizados: countAtualizados,
            inalterados: countInalterados,
            ignorados: countIgnorados,
            usuario: user?.id || null,
          })
        } catch (histErr) {
          console.error('Erro ao registrar histórico de importação:', histErr)
        }
      }

      // Atualizar lista local de medicamentos e histórico
      await loadExistingMedicamentos()
      await loadHistorico()

      const summary = {
        novos: countNovos,
        atualizados: countAtualizados,
        inalterados: countInalterados,
        ignorados: countIgnorados,
      }
      setImportSummary(summary)

      // Atualizar status dos itens na tela
      setPreviewItems((prev) =>
        prev.map((item) => {
          if (item.selected) {
            return {
              ...item,
              diffStatus: 'SEM_ALTERACAO',
              existingStatus: item.status,
              selected: false,
            }
          }
          return item
        }),
      )

      // Verificar total real no banco após a sincronização
      const finalDbList = await pb.collection('medicamentos').getFullList({ fields: 'id' })
      const totalGravado = finalDbList.length

      toast({
        title: 'Sincronização 100% Concluída!',
        description: `Catálogo atualizado com sucesso (${countNovos} novos criados, ${countAtualizados} atualizados, ${countInalterados} sem alteração). Total no banco: ${totalGravado}.`,
      })
    } catch (err: unknown) {
      console.error('Erro na gravação:', err)
      toast({
        title: 'Erro na importação',
        description: getErrorMessage(err) || 'Falha ao sincronizar registros com o banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  // Ação administrativa: Zerar completamente o catálogo de medicamentos
  const handleZerarCatalogo = async () => {
    if (zerarConfirmationText.trim() !== 'ZERAR') {
      toast({
        title: 'Confirmação necessária',
        description: 'Digite exatamente a palavra ZERAR para autorizar a limpeza permanente.',
        variant: 'destructive',
      })
      return
    }

    setZerandoCatalogo(true)
    try {
      let itensApagados = 0
      let backendSuccess = false

      // Tentativa 1: Endpoint otimizado no backend
      try {
        const response = await pb.send<{
          success: boolean
          message: string
          itens_apagados: number
          timestamp: string
        }>('/backend/v1/medicamentos/zerar-catalogo', {
          method: 'POST',
        })
        if (response && response.success) {
          itensApagados = response.itens_apagados || 0
          backendSuccess = true
        }
      } catch (bkErr) {
        console.warn('Endpoint zerar-catalogo falhou, tentando fallback client-side:', bkErr)
      }

      // Tentativa 2: Fallback client-side caso a rota retorne erro
      if (!backendSuccess) {
        const existing = await pb.collection('medicamentos').getFullList({ fields: 'id' })
        itensApagados = existing.length
        for (const item of existing) {
          await pb.collection('medicamentos').delete(item.id)
        }
      }

      toast({
        title: 'Catálogo de medicamentos zerado',
        description: `${itensApagados} medicamento(s) foram apagados do banco de dados com sucesso.`,
      })

      // Fechar modal e resetar estado
      setZerarModalOpen(false)
      setZerarConfirmationText('')

      // Limpar estados locais de pré-visualização e recarregar dados do banco
      setPreviewItems([])
      setUnrecognizedItems([])
      setDescartadosList([])
      setSelectedFile(null)
      setDocumentStats(null)
      setImportSummary(null)

      // Atualizar lista de medicamentos existentes (deve vir 0) e o histórico de importações
      await loadExistingMedicamentos()
      await loadHistorico()
    } catch (err: unknown) {
      console.error('Erro ao zerar catálogo:', err)
      const errorMsg = getErrorMessage(err)
      toast({
        title: 'Erro ao zerar catálogo',
        description:
          errorMsg && errorMsg !== 'Something went wrong while processing your request.'
            ? errorMsg
            : 'Não foi possível concluir o esvaziamento da coleção de medicamentos. Verifique as permissões de administrador.',
        variant: 'destructive',
      })
    } finally {
      setZerandoCatalogo(false)
    }
  }

  // Se não for admin, exibir aviso de acesso restrito
  if (!authLoading && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-rose-200 shadow-sm space-y-4">
          <div className="h-14 w-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Acesso Restrito a Administradores</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            A importação e atualização em lote da lista de padronização por planilha é permitida
            exclusivamente para membros da comissão técnica e farmacêuticos administradores da Help
            Vida.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => navigate('/medicamentos')}
              className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Voltar ao Catálogo de Medicamentos
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/medicamentos')}
            className="h-9 w-9 p-0 rounded-xl border-emerald-950/15 text-[#0C4336] hover:bg-[#E6F5F2]"
            title="Voltar aos Medicamentos"
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight">
              Importação da Padronização por Planilha
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Atualização semanal de medicamentos via arquivo Excel (.xlsx) ou CSV oficial da Help
              Vida
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Destaque: Zerar catálogo de medicamentos (Admin) */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setZerarConfirmationText('')
                setZerarModalOpen(true)
              }}
              disabled={extracting || importing || zerandoCatalogo}
              className="h-9 min-h-[44px] sm:min-h-[36px] border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 text-xs font-bold"
              title="Esvaziar completamente a tabela de medicamentos para subir nova importação"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
              Zerar Catálogo
            </Button>
          )}
        </div>
      </div>

      {/* Abas: Importar / Histórico */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'importar' | 'historico')}
        className="w-full"
      >
        <TabsList className="bg-white border border-emerald-950/10 p-1 rounded-xl h-11 w-full sm:w-auto grid grid-cols-2">
          <TabsTrigger
            value="importar"
            className="text-xs font-bold data-[state=active]:bg-[#0F5342] data-[state=active]:text-white rounded-lg px-4"
          >
            <UploadCloud size={15} className="mr-1.5" />
            Nova Importação
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="text-xs font-bold data-[state=active]:bg-[#0F5342] data-[state=active]:text-white rounded-lg px-4"
          >
            <History size={15} className="mr-1.5" />
            Histórico ({historicoList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="space-y-4 sm:space-y-6 mt-4">
          {/* Resumo pós-importação */}
          {importSummary && (
            <Card className="border-emerald-500/30 bg-[#E6F5F2]/80 shadow-xs">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#0F5342] text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 size={22} className="text-[#F5B31C]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0C4336]">
                      Sincronização da Planilha Concluída com Sucesso!
                    </h4>
                    <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs">
                      <span className="font-semibold text-emerald-800">
                        Novos cadastrados: <strong>{importSummary.novos}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-amber-800">
                        Atualizados: <strong>{importSummary.atualizados}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-medium text-slate-600">
                        Sem alteração: {importSummary.inalterados}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-medium text-slate-500">
                        Desmarcados: {importSummary.ignorados}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/medicamentos')}
                  className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold shrink-0"
                >
                  Ver no Catálogo &rarr;
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Área de Upload / Seleção de Arquivo de Planilha */}
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-[#0D8272]" />
                  1. Selecionar Arquivo da Planilha (.xlsx ou .csv)
                </CardTitle>
                {documentStats && (
                  <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-xs font-semibold">
                    Aba &quot;{documentStats.sheetName}&quot; • {documentStats.totalLinhas} linhas
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500">
                A planilha oficial deve conter as colunas: <strong>ID</strong> (1 a 482),{' '}
                <strong>Nome do medicamento</strong>, <strong>Classe</strong> e{' '}
                <strong>Definição</strong> (&quot;Padrão&quot;, &quot;NÃO padrão&quot; ou
                &quot;Inativo&quot;).
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition',
                  'hover:border-[#0D8272] hover:bg-[#F4FAF8]',
                  extracting ? 'pointer-events-none opacity-60' : '',
                  selectedFile
                    ? 'border-emerald-400 bg-[#F4FAF8]/60'
                    : 'border-slate-200 bg-slate-50/50',
                )}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="h-12 w-12 rounded-2xl bg-white border border-emerald-900/10 flex items-center justify-center text-[#0D8272] shadow-xs">
                    <FileSpreadsheet size={26} />
                  </div>

                  {selectedFile ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-[#0C4336]">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {documentStats?.fileSize || 'Arquivo carregado'} • Clique para selecionar
                        outra planilha
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-700">
                        Clique aqui para carregar a planilha Excel (.xlsx) ou CSV semanal
                      </p>
                      <p className="text-xs text-slate-400">
                        Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou CSV exportado
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Progresso da Leitura */}
              {extracting && (
                <div className="space-y-2 p-4 rounded-xl bg-emerald-50/60 border border-emerald-950/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#0C4336] flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D8272]" />
                      {extractionStage}
                    </span>
                    <span className="font-mono text-emerald-800 font-bold">
                      {extractionProgress}%
                    </span>
                  </div>
                  <Progress value={extractionProgress} className="h-2 bg-emerald-100" />
                </div>
              )}

              {/* Barra de Progresso da Gravação */}
              {importing && (
                <div className="space-y-2 p-4 rounded-xl bg-[#FEF8EC] border border-[#F5B31C]/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#92400E] flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5B31C]" />
                      Sincronizando medicamentos no banco de dados...
                    </span>
                    <span className="font-mono text-amber-900 font-bold">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2 bg-amber-100" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Tabela de Conferência e Pré-visualização */}
          {previewItems.length > 0 && (
            <Card className="border-emerald-950/10 bg-white shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                      <FileCheck2 className="h-5 w-5 text-[#0D8272]" />
                      2. Conferência Prévia dos Medicamentos (Régua Oficial 1–482)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Verifique a auditoria com a régua oficial de 482 itens antes de sincronizar
                      semanalmente.
                    </CardDescription>
                  </div>

                  {/* Botão de Gravação Principal */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    <div className="text-right sm:text-right hidden sm:block">
                      <div className="text-xs font-bold text-[#0C4336]">
                        Itens selecionados:{' '}
                        <span className="font-mono text-emerald-800">
                          {counts.selecionados} medicamentos
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {counts.novos} novos • {counts.existentes} a atualizar •{' '}
                        {counts.semAlteracao} sem alteração
                      </div>
                    </div>
                    <Button
                      onClick={handleExecuteImport}
                      disabled={importing || counts.selecionados === 0}
                      className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold h-10 min-h-[42px] px-5 rounded-xl shadow-xs"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Sincronizando ({importProgress}%)...
                        </>
                      ) : (
                        <>
                          <Check className="mr-1.5 h-4 w-4 text-[#F5B31C]" />
                          Importar Planilha ({counts.selecionados} itens)
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Painel de Auditoria de Status da Régua Oficial (238 / 217 / 27 = 482) */}
                <div className="mt-3 p-3.5 rounded-xl border border-emerald-950/15 bg-[#F4FAF8] space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#0C4336] uppercase tracking-wider">
                        Régua Oficial Help Vida:
                      </span>
                      {counts.atendeReguaOficial ? (
                        <Badge className="bg-[#0F5342] text-white text-[11px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-[#F5B31C]" />
                          Contagem 100% Exata (482/482 itens)
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] font-bold">
                          {counts.total} de 482 itens esperados
                        </Badge>
                      )}

                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[11px] font-mono font-bold">
                        IDs extraídos: {counts.pdfIdsCount} de 482
                      </Badge>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Meta: 238 Padronizados • 217 Não Padronizados • 27 Inativos
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-950/10 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          Total Geral
                        </span>
                        {counts.total === 482 ? (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-base font-extrabold text-[#0C4336]">
                          {counts.total}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">/ 482</span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-950/10 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-emerald-700">
                          Padronizados
                        </span>
                        {counts.padronizados === 238 ? (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-base font-extrabold text-emerald-800">
                          {counts.padronizados}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">/ 238</span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-950/10 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-amber-700">
                          Não Padronizados
                        </span>
                        {counts.naoPadronizados === 217 ? (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-base font-extrabold text-amber-800">
                          {counts.naoPadronizados}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">/ 217</span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-950/10 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-600">
                          Inativos
                        </span>
                        {counts.inativos === 27 ? (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-base font-extrabold text-slate-700">
                          {counts.inativos}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">/ 27</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Painel "Relação de Duplicados" (IDs ou nomes repetidos) */}
                <div className="mt-2 p-3.5 rounded-xl border border-amber-900/20 bg-[#FFFDF7] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Copy size={14} />
                      </div>
                      <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                        Relação de Duplicados
                      </h4>
                      {duplicateStats.duplicatesByPdfId.length > 0 ? (
                        <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] font-bold">
                          {duplicateStats.duplicatesByPdfId.length} IDs repetidos detectados!
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                          IDs 100% únicos (zero colisão)
                        </Badge>
                      )}

                      {duplicateStats.totalDuplicatesCount > 0 && (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                          {duplicateStats.totalDuplicatesCount} nomes repetidos
                        </Badge>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDuplicatesTableExpanded(!duplicatesTableExpanded)}
                      className="h-7 text-xs font-semibold border-amber-900/20 text-amber-950 hover:bg-amber-50"
                    >
                      {duplicatesTableExpanded ? 'Ocultar Duplicados' : 'Ver Detalhes'}
                      {duplicatesTableExpanded ? (
                        <ChevronUp size={13} className="ml-1" />
                      ) : (
                        <ChevronDown size={13} className="ml-1" />
                      )}
                    </Button>
                  </div>

                  {duplicatesTableExpanded && (
                    <div className="space-y-2 pt-1">
                      {duplicateStats.duplicates.length === 0 &&
                      duplicateStats.duplicatesByPdfId.length === 0 ? (
                        <p className="text-xs text-emerald-800">
                          Nenhum registro duplicado encontrado na planilha.
                        </p>
                      ) : (
                        <div className="border border-amber-900/15 rounded-lg overflow-hidden bg-white max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-amber-50/70 text-amber-950 font-bold uppercase text-[10px] tracking-wider border-b border-amber-900/10 sticky top-0 z-10">
                              <tr>
                                <th className="py-2 px-3">Medicamento</th>
                                <th className="py-2 px-3 text-center w-24">Ocorrências</th>
                                <th className="py-2 px-3 text-center w-36">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-900/5">
                              {duplicateStats.duplicates.map((dup) => (
                                <tr key={dup.normalizedKey} className="hover:bg-amber-50/30">
                                  <td className="py-2 px-3 font-semibold text-slate-800">
                                    {dup.nome}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                                      {dup.count}x
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Badge className="bg-[#E6F5F2] text-[#0C4336] text-[10px]">
                                      {dup.resolvedStatus}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bloco de Sinalização de Itens Ausentes no Banco (NUNCA deletados silenciosamente) */}
                {counts.ausentesNoBanco.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl border border-rose-300 bg-rose-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <AlertTriangle size={15} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-rose-950">
                          {counts.ausentesNoBanco.length} medicamento(s) com ID cadastrado não
                          constam nesta planilha
                        </p>
                        <p className="text-[11px] text-rose-800">
                          Permanecem preservados no banco e sinalizados como ausentes (nenhum
                          registro é apagado silenciosamente).
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-rose-600 text-white text-[10px] font-bold shrink-0">
                      Preservados no catálogo
                    </Badge>
                  </div>
                )}

                {/* Chips de Resumo de Casamento com o Banco de Dados */}
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <button
                    onClick={() => setFilterDiff('TODOS')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 min-h-[32px]',
                      filterDiff === 'TODOS'
                        ? 'bg-[#0F5342] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    <span>Todos</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 bg-black/10 rounded-full">
                      {counts.total}
                    </span>
                  </button>

                  <button
                    onClick={() => setFilterDiff('NOVO')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 min-h-[32px]',
                      filterDiff === 'NOVO'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100',
                    )}
                  >
                    <PlusCircle size={13} className="text-emerald-500" />
                    <span>Novos (ID novo)</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 bg-emerald-200/50 rounded-full font-bold">
                      {counts.novos}
                    </span>
                  </button>

                  <button
                    onClick={() => setFilterDiff('EXISTENTE')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 min-h-[32px]',
                      filterDiff === 'EXISTENTE'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 border border-amber-200/60 hover:bg-amber-100',
                    )}
                  >
                    <RefreshCw size={13} className="text-amber-500" />
                    <span>A Atualizar (ID já cadastrado)</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 bg-amber-200/60 rounded-full font-bold">
                      {counts.existentes}
                    </span>
                  </button>

                  <button
                    onClick={() => setFilterDiff('SEM_ALTERACAO')}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 min-h-[32px]',
                      filterDiff === 'SEM_ALTERACAO'
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    <CheckCircle2 size={13} className="text-slate-400" />
                    <span>Sem alteração</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-200 rounded-full">
                      {counts.semAlteracao}
                    </span>
                  </button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Filtro de Texto e Ações de Seleção Rápida */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Filtrar por ID, nome ou classe..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="h-9 pl-8 text-xs bg-[#F4FAF8] border-emerald-950/15"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAllFiltered(true)}
                      className="text-xs h-8 text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                    >
                      Marcar visíveis
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAllFiltered(false)}
                      className="text-xs h-8 text-slate-600 border-slate-200 hover:bg-slate-50"
                    >
                      Desmarcar visíveis
                    </Button>
                  </div>
                </div>

                {/* Tabela de Itens da Planilha */}
                <div className="border border-emerald-950/10 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4FAF8] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-emerald-950/10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <Checkbox
                            checked={
                              filteredPreview.length > 0 && filteredPreview.every((i) => i.selected)
                            }
                            onCheckedChange={(checked) => handleSelectAllFiltered(Boolean(checked))}
                            aria-label="Selecionar todos os visíveis"
                          />
                        </th>
                        <th className="py-2.5 px-3 w-16 text-center font-mono">ID PDF</th>
                        <th className="py-2.5 px-3">Nome do Medicamento</th>
                        <th className="py-2.5 px-3">Classe Terapêutica</th>
                        <th className="py-2.5 px-3">Definição / Status</th>
                        <th className="py-2.5 px-3">Situação na Base</th>
                        <th className="py-2.5 px-3 w-16 text-center">Linha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/5">
                      {filteredPreview.map((item, idx) => {
                        const originalIndex = previewItems.findIndex((p) => p.pdfId === item.pdfId)

                        return (
                          <tr
                            key={`${item.pdfId}-${idx}`}
                            className={cn(
                              'hover:bg-emerald-50/40 transition',
                              item.selected ? 'bg-white' : 'bg-slate-50/50 opacity-60',
                            )}
                          >
                            <td className="py-2 px-3 text-center">
                              <Checkbox
                                checked={item.selected}
                                onCheckedChange={() => toggleItemSelection(originalIndex)}
                                aria-label={`Selecionar ${item.nome}`}
                              />
                            </td>

                            <td className="py-2 px-3 text-center">
                              <Badge className="bg-[#0F5342]/10 text-[#0F5342] border-[#0F5342]/20 font-mono text-[11px] font-bold">
                                #{item.pdfId}
                              </Badge>
                            </td>

                            <td className="py-2 px-3 font-semibold text-slate-900">
                              <span className="block leading-tight">{item.nome}</span>
                              {item.observacao && (
                                <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                                  {item.observacao}
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3 text-slate-600 font-medium">
                              <div>{item.classe}</div>
                              {item.classeDetalhada && (
                                <div
                                  className="text-[11px] text-[#0D8272] font-normal truncate max-w-xs mt-0.5"
                                  title={item.classeDetalhada}
                                >
                                  {item.classeDetalhada}
                                </div>
                              )}
                            </td>

                            <td className="py-2 px-3">
                              {item.status === 'Padronizado' && (
                                <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[10px] font-bold">
                                  Padronizado
                                </Badge>
                              )}
                              {item.status === 'Não Padronizado' && (
                                <Badge className="bg-[#FEF8EC] text-[#B45309] border border-[#F5B31C]/40 text-[10px] font-bold">
                                  Não Padronizado
                                </Badge>
                              )}
                              {item.status === 'Inativo' && (
                                <Badge className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                                  Inativo
                                </Badge>
                              )}
                            </td>

                            <td className="py-2 px-3">
                              {item.diffStatus === 'NOVO' && (
                                <Badge className="bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 w-fit">
                                  <PlusCircle size={11} />
                                  NOVO ITEM
                                </Badge>
                              )}
                              {item.diffStatus === 'EXISTENTE' && (
                                <div className="space-y-0.5">
                                  <Badge className="bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 w-fit">
                                    <RefreshCw size={10} />
                                    ATUALIZAR
                                  </Badge>
                                  <span className="text-[10px] text-slate-500 block">
                                    Status atual: &quot;{item.existingStatus}&quot;
                                  </span>
                                </div>
                              )}
                              {item.diffStatus === 'SEM_ALTERACAO' && (
                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                  <CheckCircle2 size={12} className="text-slate-400" />
                                  Já cadastrado igual
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3 text-center text-[11px] text-slate-400 font-mono">
                              {item.linhaPlanilha || '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredPreview.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Nenhum medicamento encontrado para os filtros selecionados.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 3. Relatório de Itens Faltantes (IDs 1-482 ausentes ou descartados) */}
          {previewItems.length > 0 && missingItemsReport.length > 0 && (
            <Card className="border-rose-200 bg-rose-50/30 shadow-xs">
              <CardHeader className="pb-3 border-b border-rose-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 text-rose-600" />
                      </div>
                      <CardTitle className="text-sm sm:text-base font-bold text-rose-950 flex items-center gap-2">
                        Relatório de Itens Faltantes
                        <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold">
                          {missingItemsReport.length}{' '}
                          {missingItemsReport.length === 1 ? 'item faltante' : 'itens faltantes'}
                        </Badge>
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-rose-900/80 leading-relaxed">
                      Cruzamento oficial da régua Help Vida (intervalo 1–482) com os IDs da
                      planilha. Apresenta o motivo do descarte ou ausência de cada ID.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportMissingCsv}
                      className="h-8 text-xs font-semibold border-rose-300 text-rose-800 hover:bg-rose-100/70 flex items-center gap-1.5"
                    >
                      <Download size={13} className="text-rose-700" />
                      Exportar Relatório em CSV
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMissingTableExpanded(!missingTableExpanded)}
                      className="h-8 px-2 text-rose-700 hover:bg-rose-100/50"
                      aria-label={
                        missingTableExpanded
                          ? 'Ocultar tabela de faltantes'
                          : 'Mostrar tabela de faltantes'
                      }
                    >
                      {missingTableExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Button>
                  </div>
                </div>

                {/* Filtros do Relatório de Faltantes */}
                {missingTableExpanded && (
                  <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rose-400" />
                      <Input
                        type="search"
                        placeholder="Filtrar por ID, motivo ou linha..."
                        value={missingFilterSearch}
                        onChange={(e) => setMissingFilterSearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-white border-rose-200 text-rose-950 placeholder:text-rose-400/80 focus-visible:ring-rose-400"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-rose-800 mr-1 flex items-center gap-1">
                        <Filter size={12} />
                        Origem:
                      </span>
                      <button
                        type="button"
                        onClick={() => setMissingFilterOrigem('TODOS')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[11px] font-medium transition',
                          missingFilterOrigem === 'TODOS'
                            ? 'bg-rose-700 text-white font-bold'
                            : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50',
                        )}
                      >
                        Todos ({missingItemsReport.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setMissingFilterOrigem('descarte_registrado')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[11px] font-medium transition',
                          missingFilterOrigem === 'descarte_registrado'
                            ? 'bg-amber-700 text-white font-bold'
                            : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50',
                        )}
                      >
                        Descarte Registrado (
                        {
                          missingItemsReport.filter(
                            (m) => m.origemEvidencia === 'descarte_registrado',
                          ).length
                        }
                        )
                      </button>
                      <button
                        type="button"
                        onClick={() => setMissingFilterOrigem('sem_correspondencia')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[11px] font-medium transition',
                          missingFilterOrigem === 'sem_correspondencia'
                            ? 'bg-slate-700 text-white font-bold'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100',
                        )}
                      >
                        Sem Correspondência (
                        {
                          missingItemsReport.filter(
                            (m) => m.origemEvidencia === 'sem_correspondencia',
                          ).length
                        }
                        )
                      </button>
                    </div>
                  </div>
                )}
              </CardHeader>

              {missingTableExpanded && (
                <CardContent className="pt-3">
                  <div className="border border-rose-200/80 rounded-xl overflow-hidden overflow-x-auto bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-100/60 text-rose-900 font-bold uppercase text-[10px] tracking-wider border-b border-rose-200/70">
                        <tr>
                          <th className="py-2 px-3 w-16 text-center font-mono">ID</th>
                          <th className="py-2 px-3 w-48">Motivo do Descarte / Ausência</th>
                          <th className="py-2 px-3">Texto Bruto da Linha</th>
                          <th className="py-2 px-3 w-20 text-center">Linha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {filteredMissingItems.map((missing) => (
                          <tr key={missing.pdfId} className="hover:bg-rose-50/50 transition">
                            <td className="py-2 px-3 text-center">
                              <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-mono text-[11px] font-bold">
                                #{missing.pdfId}
                              </Badge>
                            </td>

                            <td className="py-2 px-3">
                              {missing.origemEvidencia === 'descarte_registrado' ? (
                                <div className="space-y-0.5">
                                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-semibold">
                                    Descarte Registrado
                                  </Badge>
                                  <p className="text-[11px] text-slate-700 leading-snug">
                                    {missing.motivo}
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]">
                                    Sem Correspondência
                                  </Badge>
                                  <p className="text-[11px] text-slate-500 italic">
                                    Nenhuma linha da planilha referenciou este ID.
                                  </p>
                                </div>
                              )}
                            </td>

                            <td className="py-2 px-3 font-mono text-[11px] text-slate-800 break-words max-w-md">
                              {missing.rawText ? (
                                <span className="bg-slate-50 px-2 py-1 rounded border border-slate-200 inline-block">
                                  {missing.rawText}
                                </span>
                              ) : (
                                <span className="text-slate-300 italic text-[10px]">
                                  (Ausente na planilha enviada)
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3 text-center text-[11px] text-slate-400 font-mono">
                              {missing.linha ? `Linha ${missing.linha}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredMissingItems.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Nenhum item faltante encontrado para o filtro digitado.
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* 4. Bloco de Linhas Descartadas / Não Reconhecidas */}
          {descartadosList.length > 0 && (
            <Card className="border-amber-200/80 bg-amber-50/40 shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Linhas Descartadas com Motivo ({descartadosList.length})
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300">
                    Auditoria
                  </Badge>
                </div>
                <CardDescription className="text-xs text-amber-800/80">
                  Linhas da planilha que apresentaram erros de validação (ID duplicado, nome vazio
                  ou definição inválida).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {descartadosList.map((desc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <div className="space-y-0.5">
                        <p className="font-mono font-semibold text-slate-800">{desc.rawText}</p>
                        <p className="text-[11px] text-amber-700">{desc.motivo}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {desc.linha ? `Linha ${desc.linha}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA HISTÓRICO DE IMPORTAÇÕES */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <History className="h-5 w-5 text-[#0D8272]" />
                  Histórico de Importações Concluídas
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Registro de auditoria com data, hora, usuário responsável e quantitativo de itens
                  processados.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistorico}
                disabled={loadingHistorico}
                className="h-8 text-xs border-emerald-950/15 text-[#0C4336] hover:bg-[#E6F5F2]"
              >
                <RefreshCw size={12} className={cn('mr-1.5', loadingHistorico && 'animate-spin')} />
                Atualizar Histórico
              </Button>
            </CardHeader>
            <CardContent>
              {loadingHistorico ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0D8272] mb-2" />
                  <p className="text-xs">Carregando histórico de importações...</p>
                </div>
              ) : historicoList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="text-xs font-medium text-slate-600">
                    Nenhuma importação registrada até o momento.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Ao confirmar uma importação nesta tela, um registro com o nome do arquivo, seu
                    usuário e as quantidades processadas será arquivado aqui automaticamente.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoList.map((item) => {
                    const dataFormatada = formatarDataSegura(item.created, {
                      incluirHora: true,
                      fallback: 'Data indisponível',
                    })
                    const autorNome =
                      item.expand?.usuario?.name ||
                      item.expand?.usuario?.email ||
                      'Usuário institucional'

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 sm:p-4 rounded-xl border border-emerald-950/10 bg-[#F4FAF8]/60 hover:bg-[#F4FAF8] transition space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4 text-[#0D8272] shrink-0" />
                              <h4 className="text-xs sm:text-sm font-bold text-[#0C4336] truncate">
                                {item.nome_arquivo}
                              </h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                              <span className="flex items-center gap-1 font-medium">
                                <Calendar size={12} className="text-slate-400" />
                                {dataFormatada}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <UserIcon size={12} className="text-[#0D8272]" />
                                {autorNome}
                              </span>
                            </div>
                          </div>

                          <Badge className="bg-[#0F5342] text-white text-[11px] font-bold w-fit">
                            {item.total_itens} itens analisados
                          </Badge>
                        </div>

                        {/* Detalhes de criação/atualização */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-emerald-950/10 text-xs">
                          <div className="bg-white p-2 rounded-lg border border-emerald-950/5">
                            <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                              Criados
                            </span>
                            <span className="text-sm font-bold text-emerald-900">
                              {item.criados || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-emerald-950/5">
                            <span className="text-[10px] uppercase font-bold text-amber-700 block">
                              Atualizados
                            </span>
                            <span className="text-sm font-bold text-amber-900">
                              {item.atualizados || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-emerald-950/5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">
                              Inalterados
                            </span>
                            <span className="text-sm font-bold text-slate-700">
                              {item.inalterados || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-emerald-950/5">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Ignorados
                            </span>
                            <span className="text-sm font-bold text-slate-500">
                              {item.ignorados || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de Confirmação Dupla: Zerar Catálogo de Medicamentos */}
      <Dialog open={zerarModalOpen} onOpenChange={setZerarModalOpen}>
        <DialogContent className="max-w-md w-[92vw] sm:w-full p-5 sm:p-6 rounded-2xl bg-white border-rose-200 shadow-xl">
          <DialogHeader className="text-left space-y-2">
            <div className="h-11 w-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle size={24} className="text-rose-600" />
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-rose-950">
              Zerar Todo o Catálogo de Medicamentos?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed space-y-2 pt-1">
              <span className="block font-semibold text-rose-900">
                Atenção: Esta ação é permanente e irreversível!
              </span>
              <span className="block">
                Todos os medicamentos atualmente cadastrados no banco de dados (
                <strong>{existingMeds.length} itens</strong>) serão apagados permanentemente da
                coleção{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-slate-800">
                  medicamentos
                </code>
                .
              </span>
              <span className="block text-slate-500">
                O histórico de importações anteriores e as solicitações não serão apagados. Um
                registro de auditoria da limpeza será criado automaticamente no histórico.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <label
              htmlFor="confirm-zerar-input"
              className="text-xs font-semibold text-slate-700 block"
            >
              Para confirmar, digite exatamente a palavra{' '}
              <span className="font-mono font-bold text-rose-700 select-all">ZERAR</span> abaixo:
            </label>
            <Input
              id="confirm-zerar-input"
              type="text"
              value={zerarConfirmationText}
              onChange={(e) => setZerarConfirmationText(e.target.value)}
              placeholder="Digite ZERAR"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="text-sm sm:text-base font-mono tracking-wider h-11 border-rose-300 focus-visible:ring-rose-500 uppercase"
            />
          </div>

          <DialogFooter className="pt-3 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setZerarModalOpen(false)
                setZerarConfirmationText('')
              }}
              disabled={zerandoCatalogo}
              className="w-full sm:w-auto h-11 sm:h-9 min-h-[44px] sm:min-h-[36px] text-xs font-medium text-slate-600 border-slate-300"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleZerarCatalogo}
              disabled={zerandoCatalogo || zerarConfirmationText.trim() !== 'ZERAR'}
              className="w-full sm:w-auto h-11 sm:h-9 min-h-[44px] sm:min-h-[36px] text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs"
            >
              {zerandoCatalogo ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Esvaziando catálogo...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Sim, Zerar Catálogo Permanentemente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
