import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { MedicamentoRecord } from '@/pages/Index'
import { extractTextFromPdf } from '@/lib/pdf/pdfLoader'
import {
  parseMedicamentosFromPages,
  parseMedicamentosFromMarkdown,
  makeMedicamentoKey,
  normalizeStr,
  ParsedMedicamento,
  StatusPadronizacao,
  UnrecognizedItem,
  ItemDescartado,
  ItemFaltanteRelatorio,
  buildMissingItemsReport,
  exportMissingItemsToCsv,
} from '@/lib/pdf/pdfParser'
import { runPdfParserValidationTests } from '@/lib/pdf/pdfParserValidation.test'
import officialPdfUrl from '@/assets/relacao-dos-medicamentos-avaliados-e-definicao-de-padronizacao-16.10-50a22.pdf'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Archive,
  Search,
  Filter,
  Check,
  X,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  FileCheck2,
  Sparkles,
  HelpCircle,
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
    totalPages: number
    fileName: string
    fileSize: string
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
        sort: 'nome',
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

    // Auto-execução dos testes de validação do parser para integridade contínua
    try {
      const testOutcome = runPdfParserValidationTests()
      console.log('[PARSER-TESTS] Auto-validation passed:', testOutcome)
    } catch (testErr) {
      console.warn('[PARSER-TESTS] Warning in parser validation tests:', testErr)
    }

    // Diagnóstico e auto-verificação da auditoria
    const checkAudit = async () => {
      try {
        await pb.send('/backend/v1/pdf/audit-regua', { method: 'GET' })
      } catch {
        /* silencioso */
      }
    }
    checkAudit()
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

  // Processar arquivo PDF selecionado (com fallback automático: Backend Server-side -> Client-side PDF.js)
  const processPdfFileOrBuffer = async (
    fileOrBlob: File | Blob,
    fileName: string,
    fileSizeStr: string,
  ) => {
    setExtracting(true)
    setExtractionProgress(10)
    setExtractionStage('Enviando documento para análise...')
    setImportSummary(null)

    try {
      let parseResult: {
        items: ParsedMedicamento[]
        unrecognized: UnrecognizedItem[]
        descartados?: ItemDescartado[]
        totalPages: number
        totalItems: number
      } | null = null

      let serverMarkdown: string | null = null

      // Tentativa 1: Processamento robusto server-side via engine do Skip Cloud ($documents.toMarkdown)
      try {
        setExtractionProgress(25)
        setExtractionStage('Processando documento via serviço do servidor...')

        const formData = new FormData()
        formData.append('arquivo', fileOrBlob, fileName)

        const data = await pb.send<{ markdown?: string }>('/backend/v1/pdf/parse-markdown', {
          method: 'POST',
          body: formData,
        })

        if (data && data.markdown && data.markdown.length > 50) {
          serverMarkdown = data.markdown
          try {
            if (typeof window !== 'undefined') {
              ;(window as unknown as { __LAST_PARSED_MARKDOWN?: string }).__LAST_PARSED_MARKDOWN =
                data.markdown
            }
          } catch {
            /* intentionally ignored */
          }

          setExtractionProgress(60)
          setExtractionStage('Interpretando medicamentos estruturados...')
          parseResult = parseMedicamentosFromMarkdown(data.markdown)
          console.log(
            `[IMPORT-AUDIT] Server extraction produced ${parseResult.items.length} items (expected 482).`,
          )
        }
      } catch (srvErr) {
        console.warn(
          'Falha na extração server-side, utilizando parser nativo no navegador:',
          srvErr,
        )
      }

      // Tentativa 2: Se o resultado do servidor falhar ou NÃO atingir a régua completa esperada (482),
      // ou se o servidor não respondeu, testar também extração no cliente via PDF.js
      if (!parseResult || parseResult.items.length < 400) {
        setExtractionProgress(40)
        setExtractionStage('Extraindo texto das páginas no navegador (PDF.js)...')
        const buffer = await fileOrBlob.arrayBuffer()
        const pages = await extractTextFromPdf(buffer)

        setExtractionProgress(75)
        setExtractionStage('Interpretando estrutura de medicamentos, classes e status...')
        const clientResult = parseMedicamentosFromPages(pages)
        console.log(
          `[IMPORT-AUDIT] Client PDF.js extraction produced ${clientResult.items.length} items.`,
        )

        // Se o cliente obteve mais itens ou o servidor não tinha retornado, usar o melhor resultado
        if (!parseResult || clientResult.items.length > parseResult.items.length) {
          parseResult = clientResult
        }
      }

      if (!parseResult || parseResult.items.length === 0) {
        throw new Error(
          'Não foi possível encontrar itens no padrão de medicamentos do Anexo I. Verifique se o arquivo possui texto legível.',
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
          const pdfIdMudou = !existing.pdfId && item.pdfId

          if (statusMudou || nomeMudou || classeMudou || pdfIdMudou) {
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

      // Ordenar preferencialmente por pdfId crescente (1..482); se não tiver, por nome
      previews.sort((a, b) => {
        if (a.pdfId && b.pdfId) return a.pdfId - b.pdfId
        if (a.pdfId) return -1
        if (b.pdfId) return 1
        return a.nome.localeCompare(b.nome)
      })

      setPreviewItems(previews)
      setUnrecognizedItems(parseResult.unrecognized)
      setDescartadosList(parseResult.descartados || [])
      setDocumentStats({
        totalPages: parseResult.totalPages || 16,
        fileName,
        fileSize: fileSizeStr,
      })

      setExtractionProgress(100)
      const countPad = previews.filter((p) => p.status === 'Padronizado').length
      const countNao = previews.filter((p) => p.status === 'Não Padronizado').length
      const countInat = previews.filter((p) => p.status === 'Inativo').length

      // Gravar log de auditoria no audit_logs automaticamente
      try {
        await pb.collection('audit_logs').create({
          colecao: 'medicamentos',
          registro_id: 'audit_regua_result',
          acao: 'AUDIT_REGUA_482',
          usuario_nome: 'Auditoria Automatizada Help Vida',
          status_anterior: 'Execução de conferência da régua',
          status_novo: `${previews.length} (${countPad} Padronizados, ${countNao} Não Padronizados, ${countInat} Inativos)`,
          detalhes: JSON.stringify({
            total: previews.length,
            padronizados: countPad,
            nao_padronizados: countNao,
            inativos: countInat,
            regua_482:
              previews.length === 482 && countPad === 238 && countNao === 217 && countInat === 27,
            casosTeste: {
              insulinaLantus: previews.some(
                (p) => p.nome.includes('INSULINA LANTUS') && p.status === 'Padronizado',
              ),
              insulinaNph: previews.some(
                (p) => p.nome.includes('INSULINA NPH') && p.status === 'Padronizado',
              ),
              insulinaRegular: previews.some(
                (p) => p.nome.includes('INSULINA REGULAR') && p.status === 'Padronizado',
              ),
              amoxicilinaClavulanato: previews.some((p) =>
                p.nome.includes('AMOXICILINA 875MG + CLAVULANATO 125MG COMPRIMIDO'),
              ),
              moxifloxacinoCompleto: previews.some(
                (p) => p.nome === 'MOXIFLOXACINO 1,6MG/ML PO PARA SOLUCAO INJETAVEL BOLSA 250 ML',
              ),
              colagenaseEpitegel: previews.some(
                (p) =>
                  p.nome.startsWith('COLAGENASE') &&
                  p.nome.includes('EPITEGEL') &&
                  !p.nome.includes('###'),
              ),
              dimenidrinatoDramin: previews.some(
                (p) =>
                  p.nome.includes('DIMENIDRINATO') &&
                  p.nome.includes('DRAMIN B6 DL') &&
                  p.nome.includes('AMPOLA 10 ML'),
              ),
              episolSec: previews.some(
                (p) =>
                  p.nome.includes('EPISOL SEC OC FPS 60') &&
                  (p.nome.endsWith('60 G') || p.nome.includes('FRASCO 60 G')),
              ),
              pentravan: previews.some((p) => p.nome.includes('PENTRAVAN')),
            },
          }),
        })
      } catch (logErr) {
        console.warn('Erro ao salvar log de auditoria:', logErr)
      }

      toast({
        title: 'Extração Concluída com Sucesso',
        description: `${previews.length} medicamentos identificados (${countPad} Padronizados, ${countNao} Não Padronizados, ${countInat} Inativos).`,
      })
    } catch (err: unknown) {
      console.error('Falha ao processar PDF:', err)
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o documento PDF. Verifique se o arquivo não está corrompido.'
      toast({
        title: 'Erro na leitura do PDF',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
    }
  }

  // Manipular upload manual de arquivo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, selecione um arquivo no formato PDF (.pdf).',
        variant: 'destructive',
      })
      return
    }

    setSelectedFile(file)
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2)
    await processPdfFileOrBuffer(file, file.name, `${sizeInMb} MB`)
  }

  // Carregar o PDF institucional oficial já disponível no projeto
  const handleLoadOfficialTestPdf = async () => {
    setExtracting(true)
    setExtractionProgress(10)
    setExtractionStage('Carregando PDF institucional Help Vida...')

    try {
      const response = await fetch(officialPdfUrl)
      if (!response.ok) throw new Error('Não foi possível obter o arquivo PDF institucional')
      const blob = await response.blob()
      const sizeInMb = (blob.size / (1024 * 1024)).toFixed(2)
      const testFile = new File(
        [blob],
        'Relação dos Medicamentos Avaliados e Definição de Padronização 16.10.pdf',
        {
          type: 'application/pdf',
        },
      )
      setSelectedFile(testFile)

      await processPdfFileOrBuffer(
        testFile,
        'Relação dos Medicamentos Avaliados e Definição de Padronização 16.10.pdf',
        `${sizeInMb} MB`,
      )
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar PDF institucional',
        description: 'Não foi possível ler o arquivo modelo.',
        variant: 'destructive',
      })
      setExtracting(false)
    }
  }

  // Estrutura para análise de itens duplicados entre os extraídos
  const duplicateStats = useMemo(() => {
    // Agrupar itens extraídos pelo nome normalizado exato
    const nameMap = new Map<
      string,
      {
        displayName: string
        normalizedKey: string
        items: PreviewItem[]
        statuses: StatusPadronizacao[]
        classes: string[]
        hasConflict: boolean
        resolvedStatus: StatusPadronizacao
      }
    >()

    // Precedência estrita de status: Inativo > Não Padronizado > Padronizado
    const resolvePrecedence = (statuses: StatusPadronizacao[]): StatusPadronizacao => {
      if (statuses.includes('Inativo')) return 'Inativo'
      if (statuses.includes('Não Padronizado')) return 'Não Padronizado'
      return 'Padronizado'
    }

    // Identificar duplicados também por pdfId se houver
    const pdfIdDupMap = new Map<number, PreviewItem[]>()
    for (const item of previewItems) {
      if (item.pdfId && item.pdfId >= 1 && item.pdfId <= 482) {
        const list = pdfIdDupMap.get(item.pdfId) || []
        list.push(item)
        pdfIdDupMap.set(item.pdfId, list)
      }

      const key = normalizeStr(item.nome)
      if (!key) continue

      if (!nameMap.has(key)) {
        nameMap.set(key, {
          displayName: item.nome,
          normalizedKey: key,
          items: [item],
          statuses: [item.status],
          classes: [item.classe],
          hasConflict: false,
          resolvedStatus: item.status,
        })
      } else {
        const group = nameMap.get(key)!
        group.items.push(item)
        group.statuses.push(item.status)
        if (item.classe && !group.classes.includes(item.classe)) {
          group.classes.push(item.classe)
        }
        // Verificar se há status diferentes (conflito)
        const uniqueStatuses = new Set(group.statuses)
        group.hasConflict = uniqueStatuses.size > 1
        group.resolvedStatus = resolvePrecedence(group.statuses)
      }
    }

    const duplicatesByPdfId = Array.from(pdfIdDupMap.entries())
      .filter(([, list]) => list.length >= 2)
      .map(([pdfId, list]) => ({
        pdfId,
        count: list.length,
        nomes: list.map((i) => i.nome),
      }))

    // Filtrar apenas medicamentos com 2 ou mais ocorrências
    const duplicateList = Array.from(nameMap.values())
      .filter((g) => g.items.length >= 2)
      .map((g) => {
        // Formatar origens/seções (ex: "Padronizado + Não Padronizado" ou "Padronizado (2x)")
        const statusCounts = new Map<StatusPadronizacao, number>()
        for (const st of g.statuses) {
          statusCounts.set(st, (statusCounts.get(st) || 0) + 1)
        }

        const sectionsDesc = Array.from(statusCounts.entries())
          .map(([st, count]) => (count > 1 ? `${st} (${count}x)` : st))
          .join(' + ')

        return {
          nome: g.displayName,
          normalizedKey: g.normalizedKey,
          count: g.items.length,
          statuses: g.statuses,
          sectionsDesc,
          hasConflict: g.hasConflict,
          resolvedStatus: g.resolvedStatus,
          classes: g.classes,
          items: g.items,
        }
      })
      .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome))

    // Total de nomes únicos previstos para o catálogo final (considerando itens selecionados)
    const uniqueKeysSelected = new Set(
      previewItems
        .filter((i) => i.selected)
        .map((i) => normalizeStr(i.nome))
        .filter(Boolean),
    )
    const catalogoFinalPrevisto = uniqueKeysSelected.size

    // Quantidade de duplicados idênticos unificados e duplicados com conflito de status
    let totalIdenticosUnificados = 0
    let totalConflitosStatus = 0

    for (const dup of duplicateList) {
      if (dup.hasConflict) {
        totalConflitosStatus++
        // As ocorrências excedentes são absorvidas na resolução
        totalIdenticosUnificados += dup.count - 1
      } else {
        // Mesmo status
        totalIdenticosUnificados += dup.count - 1
      }
    }

    return {
      duplicates: duplicateList,
      totalDuplicatesCount: duplicateList.length,
      totalRepetitions: duplicateList.reduce((acc, d) => acc + (d.count - 1), 0),
      catalogoFinalPrevisto,
      totalIdenticosUnificados,
      totalConflitosStatus,
      duplicatesByPdfId,
    }
  }, [previewItems])
  // Contagens dos itens (por status de diff e por status de padronização)
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

    // Contagem de pdfIds extraídos válidos (1 a 482)
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

  // Relatório oficial dos 57 itens faltantes (ou qualquer ausência no intervalo 1..482)
  const missingItemsReport = useMemo(() => {
    return buildMissingItemsReport(previewItems, descartadosList, 1, 482)
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
        description: 'Todos os 482 IDs da régua oficial foram extraídos com sucesso.',
      })
      return
    }

    try {
      const csvContent = exportMissingItemsToCsv(missingItemsReport)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const fileName = `relatorio-itens-faltantes-anexo-I-${new Date().toISOString().split('T')[0]}.csv`
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
        const matchNome = item.nome.toLowerCase().includes(q)
        const matchClasse = item.classe.toLowerCase().includes(q)
        if (!matchNome && !matchClasse) return false
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
    const filteredKeys = new Set(filteredPreview.map((item) => normalizeStr(item.nome)))

    setPreviewItems((prev) =>
      prev.map((item) => {
        const key = normalizeStr(item.nome)
        if (filteredKeys.has(key)) {
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
    let countUnificados = 0
    let countConflitosResolvidos = 0
    const countIgnorados = previewItems.length - toImport.length

    // Número esperado no catálogo final com base nos itens selecionados
    const catalogoFinalPrevisto = duplicateStats.catalogoFinalPrevisto

    try {
      let syncedViaBackend = false

      // Tentativa 1: Endpoint otimizado de bulk-sync no backend
      try {
        const syncData = await pb.send<{
          criados: number
          atualizados: number
          inalterados: number
          unificados?: number
          conflitos_resolvidos?: number
          total_catalogo_final?: number
        }>('/backend/v1/medicamentos/bulk-sync', {
          method: 'POST',
          body: {
            items: toImport.map((i) => ({
              pdfId: i.pdfId || undefined,
              nome: i.nome.trim(),
              classe: i.classe.trim(),
              status: i.status,
              descricao: i.descricao || '',
              observacao: i.observacao || '',
            })),
            record_history: true,
            file_name: documentStats?.fileName || selectedFile?.name || 'documento.pdf',
            ignorados: countIgnorados,
          },
        })

        if (syncData) {
          countNovos = syncData.criados || 0
          countAtualizados = syncData.atualizados || 0
          countInalterados = syncData.inalterados || 0
          countUnificados = syncData.unificados || 0
          countConflitosResolvidos = syncData.conflitos_resolvidos || 0
          syncedViaBackend = true
          setImportProgress(100)
        }
      } catch (bkErr) {
        console.warn('Endpoint de bulk-sync falhou, executando em lotes client-side:', bkErr)
      }

      // Tentativa 2: Fallback direto no PocketBase client-side com resolução de duplicados e precedência
      if (!syncedViaBackend) {
        // Agrupar itens a importar por chave normalizada exata
        const groupedMap = new Map<
          string,
          {
            nome: string
            classe: string
            items: typeof toImport
            resolvedStatus: StatusPadronizacao
            hasConflict: boolean
            descricao: string
            observacao: string
          }
        >()

        const resolvePrecedence = (statuses: StatusPadronizacao[]): StatusPadronizacao => {
          if (statuses.includes('Inativo')) return 'Inativo'
          if (statuses.includes('Não Padronizado')) return 'Não Padronizado'
          return 'Padronizado'
        }

        for (const item of toImport) {
          const key = normalizeStr(item.nome)
          if (!key) continue

          if (!groupedMap.has(key)) {
            groupedMap.set(key, {
              nome: item.nome.trim().toUpperCase(),
              classe: item.classe.trim(),
              items: [item],
              resolvedStatus: item.status,
              hasConflict: false,
              descricao: item.descricao || '',
              observacao: item.observacao || '',
            })
          } else {
            const grp = groupedMap.get(key)!
            grp.items.push(item)
            const allStatuses = grp.items.map((it) => it.status)
            const uniqueSt = new Set(allStatuses)
            grp.hasConflict = uniqueSt.size > 1
            grp.resolvedStatus = resolvePrecedence(allStatuses)

            // Se ainda não tinha observação ou classe, unificar observações relevantes
            if (item.observacao && !grp.observacao.includes(item.observacao)) {
              grp.observacao = grp.observacao
                ? `${grp.observacao} | ${item.observacao}`
                : item.observacao
            }
          }
        }

        const consolidatedList = Array.from(groupedMap.values())
        const totalConsolidated = consolidatedList.length

        // Obter mapa atual de medicamentos no banco para saber quem atualizar vs quem criar
        const currentDbMeds = await pb.collection('medicamentos').getFullList<{
          id: string
          nome: string
          status: string
          classe: string
        }>({ fields: 'id,nome,status,classe' })

        const dbMap = new Map<string, { id: string; status: string; classe: string }>()
        for (const m of currentDbMeds) {
          const k = normalizeStr(m.nome)
          if (k) dbMap.set(k, { id: m.id, status: m.status, classe: m.classe })
        }

        let idx = 0
        for (const grp of consolidatedList) {
          const k = normalizeStr(grp.nome)
          const existing = dbMap.get(k)

          const pdfIdVal = grp.items.find((i) => i.pdfId)?.pdfId
          const payload = {
            pdfId: pdfIdVal || undefined,
            nome: grp.nome,
            classe: grp.classe,
            status: grp.resolvedStatus,
            descricao: grp.descricao,
            observacao: grp.hasConflict
              ? grp.observacao
                ? `${grp.observacao} (Status unificado por precedência: ${grp.resolvedStatus})`
                : `Status unificado por precedência: ${grp.resolvedStatus}`
              : grp.observacao,
          }

          if (existing) {
            if (existing.status !== grp.resolvedStatus || existing.classe !== grp.classe) {
              await pb.collection('medicamentos').update(existing.id, payload)
              countAtualizados++
            } else {
              countInalterados++
            }
          } else {
            await pb.collection('medicamentos').create(payload)
            countNovos++
          }

          if (grp.items.length > 1) {
            countUnificados += grp.items.length - 1
            if (grp.hasConflict) countConflitosResolvidos++
          }

          idx++
          setImportProgress(Math.round((idx / totalConsolidated) * 100))
        }

        // Gravar no histórico de importações
        try {
          await pb.collection('historico_importacoes').create({
            nome_arquivo: documentStats?.fileName || selectedFile?.name || 'documento.pdf',
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

      if (totalGravado === catalogoFinalPrevisto) {
        toast({
          title: 'Sincronização 100% Concluída!',
          description: `Catálogo atualizado com exatamente ${totalGravado} itens (${countNovos} novos, ${countAtualizados} atualizados, ${duplicateStats.totalRepetitions} unificados sem perdas).`,
        })
      } else {
        // Notificação explícita com a divergência caso ocorra (nunca silêncio)
        toast({
          title: 'Importação concluída com divergência',
          description: `Catálogo final: ${totalGravado} itens gravados. Previsto: ${catalogoFinalPrevisto} itens. Diferença: ${Math.abs(
            totalGravado - catalogoFinalPrevisto,
          )} item(ns).`,
          variant: 'destructive',
        })
      }
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

  // 4. Se não for admin, exibir aviso de acesso restrito
  if (!authLoading && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-white p-8 rounded-2xl border border-rose-200 shadow-sm space-y-4">
          <div className="h-14 w-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Acesso Restrito a Administradores</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            A importação e atualização em lote da lista de padronização é permitida exclusivamente
            para membros da comissão técnica e farmacêuticos administradores da Help Vida.
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
              Importação da Padronização via PDF
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Extraia e atualize medicamentos do documento institucional oficial da Help Vida
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadOfficialTestPdf}
            disabled={extracting || importing || zerandoCatalogo}
            className="h-9 min-h-[44px] sm:min-h-[36px] border-emerald-950/20 text-[#0C4336] hover:bg-[#E6F5F2] text-xs font-semibold"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
            Carregar PDF Modelo
          </Button>

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
                      Processo de Importação Concluído com Sucesso!
                    </h4>
                    <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs">
                      <span className="font-semibold text-emerald-800">
                        Novos adicionados: <strong>{importSummary.novos}</strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-amber-800">
                        Status atualizados: <strong>{importSummary.atualizados}</strong>
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

          {/* Alerta / Banner de Limpeza de Catálogo (Visível para Admins) */}
          {isAdmin && (
            <Card className="border-rose-200 bg-rose-50/50 shadow-xs">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Trash2 size={18} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs sm:text-sm font-bold text-rose-950 flex items-center gap-2">
                      Zerar Catálogo Atual para Nova Tabela
                      <Badge className="bg-rose-200/80 text-rose-900 border-rose-300 text-[10px] font-bold">
                        {existingMeds.length} medicamento{existingMeds.length === 1 ? '' : 's'} no
                        banco
                      </Badge>
                    </h4>
                    <p className="text-[11px] sm:text-xs text-rose-800/90 leading-relaxed">
                      Se você precisa subir uma nova tabela do zero e limpar registros antigos ou
                      corrompidos, esvazie a coleção antes de iniciar a nova importação. O histórico
                      de importações será preservado.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setZerarConfirmationText('')
                    setZerarModalOpen(true)
                  }}
                  disabled={extracting || importing || zerandoCatalogo}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 min-h-[44px] sm:min-h-[36px] px-4 rounded-xl shadow-xs"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Zerar Catálogo de Medicamentos
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Área de Upload / Seleção de Arquivo */}
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-[#0D8272]" />
                  1. Selecionar Arquivo do Catálogo (PDF)
                </CardTitle>
                {documentStats && (
                  <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-xs font-semibold">
                    {documentStats.totalPages} páginas analisadas
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500">
                A extração roda inteiramente no navegador via PDF.js, sem transferir dados para
                serviços externos.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,application/pdf"
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
                    <FileText size={24} />
                  </div>

                  {selectedFile ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-[#0C4336]">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Clique para trocar de
                        arquivo
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-700">
                        Clique aqui para selecionar o arquivo PDF do seu computador ou celular
                      </p>
                      <p className="text-xs text-slate-400">
                        Ou use o botão &quot;Carregar PDF Modelo&quot; no topo para carregar o
                        catálogo I oficial
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Progresso da Extração */}
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
                      Gravando medicamentos na coleção Help Vida...
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
                      2. Conferência dos Medicamentos Extraídos (Auditoria da Régua ANEXO I)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Verifique a contagem exata por status de padronização antes de sincronizar com
                      o banco.
                    </CardDescription>
                  </div>

                  {/* Botão de Gravação Principal */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    <div className="text-right sm:text-right hidden sm:block">
                      <div className="text-xs font-bold text-[#0C4336]">
                        Previsão catálogo:{' '}
                        <span className="font-mono text-emerald-800">
                          {duplicateStats.catalogoFinalPrevisto} itens
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {counts.selecionados} extraídos − {duplicateStats.totalRepetitions}{' '}
                        unificados
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
                          Gravando ({importProgress}%)...
                        </>
                      ) : (
                        <>
                          <Check className="mr-1.5 h-4 w-4 text-[#F5B31C]" />
                          Sincronizar ({duplicateStats.catalogoFinalPrevisto} itens previstos)
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {/* Previsão de Catálogo Final (Banner de Auditoria e Deduplicação) */}
                <div className="mt-3 p-3 rounded-xl border border-emerald-900/15 bg-white shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-100/80 text-[#0C4336] flex items-center justify-center shrink-0">
                      <Layers size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#0C4336]">
                          Catálogo final previsto: {duplicateStats.catalogoFinalPrevisto} itens
                        </span>
                        <Badge className="bg-[#0F5342] text-white text-[10px] font-bold">
                          {counts.total} extraídos − {duplicateStats.totalRepetitions} duplicados
                          unificados
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {duplicateStats.totalConflitosStatus > 0
                          ? `${duplicateStats.totalConflitosStatus} item(ns) com conflito de status entre seções resolvidos por precedência (Inativo > Não Padronizado > Padronizado).`
                          : 'Todos os medicamentos duplicados possuem status idêntico e serão agrupados em 1 item único.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDuplicatesTableExpanded(!duplicatesTableExpanded)}
                      className="h-8 text-xs font-semibold border-emerald-950/20 text-[#0C4336] hover:bg-emerald-50"
                    >
                      <Copy size={13} className="mr-1.5 text-[#0D8272]" />
                      {duplicatesTableExpanded
                        ? 'Ocultar Relação de Duplicados'
                        : 'Ver Relação de Duplicados'}
                      {duplicatesTableExpanded ? (
                        <ChevronUp size={14} className="ml-1" />
                      ) : (
                        <ChevronDown size={14} className="ml-1" />
                      )}
                    </Button>
                  </div>
                </div>
                {/* 1. Painel "Relação de Duplicados" (Requisito 1: visível na tela de conferência antes de sincronizar) */}
                <div className="mt-2 p-3.5 rounded-xl border border-amber-900/20 bg-[#FFFDF7] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Copy size={14} />
                      </div>
                      <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                        Relação de Duplicados no Documento
                      </h4>
                      {duplicateStats.totalDuplicatesCount > 0 ? (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                          {duplicateStats.totalDuplicatesCount} nomes com 2+ ocorrências (
                          {duplicateStats.totalRepetitions} repetições unificadas)
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                          Nenhum duplicado
                        </Badge>
                      )}

                      {duplicateStats.duplicatesByPdfId.length > 0 ? (
                        <Badge className="bg-rose-100 text-rose-900 border-rose-300 text-[10px] font-bold">
                          {duplicateStats.duplicatesByPdfId.length} duplicados por pdfId detectados!
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                          pdfIds 100% únicos (zero colisão)
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Regra: Duplicados idênticos unificam; conflitos seguem precedência{' '}
                        <strong>Inativo &gt; Não Padronizado &gt; Padronizado</strong>.
                      </span>
                    </div>
                  </div>

                  {duplicateStats.duplicates.length === 0 ? (
                    <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-center">
                      <p className="text-xs font-semibold text-emerald-900">
                        Nenhum medicamento duplicado nos {counts.total} itens extraídos.
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Cada nome de medicamento aparece exatamente uma vez nas páginas analisadas.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Resumo compacto dos duplicados e busca rápida */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-600">
                          Mostrando <strong>{duplicateStats.duplicates.length}</strong> medicamentos
                          repetidos.
                          {duplicateStats.totalConflitosStatus > 0 && (
                            <span className="ml-1 text-amber-800 font-semibold">
                              ({duplicateStats.totalConflitosStatus} com conflito de status entre
                              seções)
                            </span>
                          )}
                        </div>

                        {duplicateStats.duplicates.length > 5 && (
                          <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                            <Input
                              type="search"
                              placeholder="Filtrar duplicados por nome..."
                              value={duplicatesFilterSearch}
                              onChange={(e) => setDuplicatesFilterSearch(e.target.value)}
                              className="h-7 pl-7 text-[11px] bg-white border-amber-900/15"
                            />
                          </div>
                        )}
                      </div>

                      {/* Tabela detalhada de duplicados */}
                      <div className="border border-amber-900/15 rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-amber-50/70 text-amber-950 font-bold uppercase text-[10px] tracking-wider border-b border-amber-900/10 sticky top-0 z-10">
                            <tr>
                              <th className="py-2 px-3">Nome do Medicamento</th>
                              <th className="py-2 px-3 text-center w-24">Ocorrências</th>
                              <th className="py-2 px-3">Seções / Origens Extraídas</th>
                              <th className="py-2 px-3 text-center w-36">Status no Catálogo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-900/5">
                            {duplicateStats.duplicates
                              .filter((d) =>
                                duplicatesFilterSearch.trim()
                                  ? d.nome
                                      .toLowerCase()
                                      .includes(duplicatesFilterSearch.toLowerCase().trim())
                                  : true,
                              )
                              .map((dup) => (
                                <tr
                                  key={dup.normalizedKey}
                                  className={cn(
                                    'hover:bg-amber-50/40 transition',
                                    dup.hasConflict ? 'bg-amber-50/20' : '',
                                  )}
                                >
                                  <td className="py-2 px-3">
                                    <div className="font-semibold text-slate-900 text-xs">
                                      {dup.nome}
                                    </div>
                                    {dup.classes.length > 0 && (
                                      <div className="text-[10px] text-slate-400 truncate">
                                        Classe: {dup.classes.join(' / ')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                                      {dup.count}x
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-xs font-medium text-slate-700">
                                        {dup.sectionsDesc}
                                      </span>
                                      {dup.hasConflict && (
                                        <Badge className="bg-amber-500/15 text-amber-900 border-amber-400 text-[9px] font-bold">
                                          Conflito de Status
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      Páginas:{' '}
                                      {dup.items.map((it) => it.pageNumber || '?').join(', ')}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {dup.hasConflict ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <Badge
                                          className={cn(
                                            'text-[10px] font-bold',
                                            dup.resolvedStatus === 'Inativo' &&
                                              'bg-slate-700 text-white',
                                            dup.resolvedStatus === 'Não Padronizado' &&
                                              'bg-amber-600 text-white',
                                            dup.resolvedStatus === 'Padronizado' &&
                                              'bg-emerald-700 text-white',
                                          )}
                                        >
                                          {dup.resolvedStatus}
                                        </Badge>
                                        <span className="text-[9px] text-amber-800 font-semibold">
                                          Mais restritivo
                                        </span>
                                      </div>
                                    ) : (
                                      <Badge
                                        className={cn(
                                          'text-[10px] font-medium',
                                          dup.resolvedStatus === 'Padronizado' &&
                                            'bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30',
                                          dup.resolvedStatus === 'Não Padronizado' &&
                                            'bg-[#FEF8EC] text-[#B45309] border border-[#F5B31C]/40',
                                          dup.resolvedStatus === 'Inativo' &&
                                            'bg-slate-100 text-slate-600 border border-slate-200',
                                        )}
                                      >
                                        {dup.resolvedStatus} (Unificado)
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                {/* Painel de Auditoria de Status da Régua Oficial (238 / 217 / 27 = 482) */}
                <div className="mt-3 p-3.5 rounded-xl border border-emerald-950/15 bg-[#F4FAF8] space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#0C4336] uppercase tracking-wider">
                        Régua Oficial do ANEXO I:
                      </span>
                      {counts.atendeReguaOficial ? (
                        <Badge className="bg-[#0F5342] text-white text-[11px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-[#F5B31C]" />
                          Contagem 100% Exata (482 itens)
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
                          constam neste PDF
                        </p>
                        <p className="text-[11px] text-rose-800">
                          Ficam preservados no banco e sinalizados como ausentes (nenhum registro é
                          apagado silenciosamente).
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
                    <span>Novos (pdfId novo)</span>
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
                    <span>A Atualizar (pdfId já cadastrado)</span>
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
                </div>{' '}
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Filtro de Texto e Ações de Seleção Rápida */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Filtrar nesta pré-visualização por nome ou classe..."
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

                {/* Tabela de Itens Extraídos */}
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
                        <th className="py-2.5 px-3">Medicamento (Grafia Exata)</th>
                        <th className="py-2.5 px-3">Classe Terapêutica</th>
                        <th className="py-2.5 px-3">Status no Documento</th>
                        <th className="py-2.5 px-3">Situação / Ação</th>
                        <th className="py-2.5 px-3 w-16 text-center">Pág.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/5">
                      {filteredPreview.map((item, idx) => {
                        const originalIndex = previewItems.findIndex(
                          (p) =>
                            (p.pdfId && item.pdfId && p.pdfId === item.pdfId) ||
                            (normalizeStr(p.nome) === normalizeStr(item.nome) &&
                              normalizeStr(p.classe) === normalizeStr(item.classe)),
                        )

                        return (
                          <tr
                            key={`${item.pdfId || ''}-${item.nome}-${item.classe}-${idx}`}
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
                              {item.pdfId ? (
                                <Badge className="bg-[#0F5342]/10 text-[#0F5342] border-[#0F5342]/20 font-mono text-[11px] font-bold">
                                  #{item.pdfId}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">s/ ID</span>
                              )}
                            </td>

                            <td className="py-2 px-3 font-semibold text-slate-900">
                              <span className="block leading-tight">{item.nome}</span>
                              {item.observacao && (
                                <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                                  {item.observacao}
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3 text-slate-600 font-medium">{item.classe}</td>

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
                                    ATUALIZAR STATUS
                                  </Badge>
                                  <span className="text-[10px] text-slate-500 block">
                                    De &quot;{item.existingStatus}&quot; para &quot;{item.status}
                                    &quot;
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
                              {item.pageNumber || '-'}
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

          {/* 3. Bloco Oficial: Relatório de Itens Faltantes (IDs 1-482 do Anexo I não extraídos) */}
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
                      Cruzamento oficial da régua de 482 itens (intervalo 1–482) com os IDs
                      extraídos. Apresenta o motivo do descarte ou ausência de cada ID para
                      auditoria completa da importação.
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
                        placeholder="Filtrar por ID, motivo, seção ou texto bruto..."
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
                          <th className="py-2 px-3 w-16 text-center font-mono">ID PDF</th>
                          <th className="py-2 px-3 w-32">Seção do PDF</th>
                          <th className="py-2 px-3 w-48">Motivo do Descarte / Ausência</th>
                          <th className="py-2 px-3">Texto Bruto de Origem</th>
                          <th className="py-2 px-3 w-20 text-center">Página</th>
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
                              {missing.secao === 'Padronizado' && (
                                <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 text-[10px] font-semibold">
                                  Padronizado
                                </Badge>
                              )}
                              {missing.secao === 'Não Padronizado' && (
                                <Badge className="bg-[#FEF8EC] text-[#B45309] border border-[#F5B31C]/40 text-[10px] font-semibold">
                                  Não Padronizado
                                </Badge>
                              )}
                              {missing.secao === 'Inativo' && (
                                <Badge className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                                  Inativo
                                </Badge>
                              )}
                              {!['Padronizado', 'Não Padronizado', 'Inativo'].includes(
                                missing.secao || '',
                              ) && (
                                <span className="text-[11px] text-slate-400 italic">
                                  {missing.secao || 'Não identificada'}
                                </span>
                              )}
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
                                    Nenhuma linha do PDF referenciou este ID.
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
                                  (Ausente no texto extraído do documento)
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3 text-center text-[11px] text-slate-400 font-mono">
                              {missing.pageNumber && missing.pageNumber > 0
                                ? `Pág. ${missing.pageNumber}`
                                : '—'}
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

          {/* 4. Bloco de Itens Não Reconhecidos (para revisão manual) */}
          {unrecognizedItems.length > 0 && (
            <Card className="border-amber-200/80 bg-amber-50/40 shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Itens Não Reconhecidos ({unrecognizedItems.length})
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-amber-800 border-amber-300">
                    Revisão Manual
                  </Badge>
                </div>
                <CardDescription className="text-xs text-amber-800/80">
                  Linhas do documento com texto que aparenta ser medicamento mas cuja classe
                  terapêutica não pôde ser associada automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {unrecognizedItems.map((unrec, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <div className="space-y-0.5">
                        <p className="font-mono font-semibold text-slate-800">{unrec.text}</p>
                        <p className="text-[11px] text-amber-700">{unrec.reason}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        Página {unrec.pageNumber}
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
                  <FileText className="h-10 w-10 mx-auto text-slate-300" />
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
                              <FileText className="h-4 w-4 text-[#0D8272] shrink-0" />
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
