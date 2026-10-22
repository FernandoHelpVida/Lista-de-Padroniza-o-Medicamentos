import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { MedicamentoRecord } from '@/pages/Index'
import { extractTextFromPdf } from '@/lib/pdf/pdfLoader'
import {
  parseMedicamentosFromPages,
  makeMedicamentoKey,
  type ParsedMedicamento,
  type UnrecognizedItem,
  type StatusPadronizacao,
} from '@/lib/pdf/pdfParser'
import officialPdfUrl from '@/assets/relacao-dos-medicamentos-avaliados-e-definicao-de-padronizacao-16.10-9be5c.pdf'
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
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'

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
  const [documentStats, setDocumentStats] = useState<{
    totalPages: number
    fileName: string
    fileSize: string
  } | null>(null)

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
        description: 'Não foi possível carregar os medicamentos já cadastrados.',
        variant: 'destructive',
      })
    } finally {
      setLoadingExisting(false)
    }
  }

  useEffect(() => {
    loadExistingMedicamentos()
    loadHistorico()
  }, [])

  // Mapa de medicamentos existentes indexado pela chave normalizada (nome + classe)
  const existingMap = useMemo(() => {
    const map = new Map<string, MedicamentoRecord>()
    for (const med of existingMeds) {
      const key = makeMedicamentoKey(med.nome, med.classe)
      map.set(key, med)
    }
    return map
  }, [existingMeds])

  // Processar arquivo PDF selecionado
  const processPdfBuffer = async (buffer: ArrayBuffer, fileName: string, fileSizeStr: string) => {
    setExtracting(true)
    setExtractionProgress(15)
    setExtractionStage('Carregando biblioteca PDF.js...')
    setImportSummary(null)

    try {
      setExtractionProgress(35)
      setExtractionStage('Extraindo texto das páginas do documento...')
      const pages = await extractTextFromPdf(buffer)

      setExtractionProgress(70)
      setExtractionStage('Interpretando estrutura de medicamentos, classes e status...')
      const parseResult = parseMedicamentosFromPages(pages)

      setExtractionProgress(90)
      setExtractionStage('Comparando com a base de dados Help Vida atual...')

      // Cruzar com os dados existentes
      const previews: PreviewItem[] = parseResult.items.map((item) => {
        const key = makeMedicamentoKey(item.nome, item.classe)
        const existing = existingMap.get(key)

        let diffStatus: ItemDiffStatus = 'NOVO'
        let existingId: string | undefined = undefined
        let existingStatus: StatusPadronizacao | undefined = undefined

        if (existing) {
          existingId = existing.id
          existingStatus = existing.status
          if (existing.status !== item.status) {
            diffStatus = 'EXISTENTE' // status mudou, precisa atualizar
          } else {
            diffStatus = 'SEM_ALTERACAO' // dados idênticos
          }
        }

        return {
          ...item,
          diffStatus,
          existingId,
          existingStatus,
          // Por padrão, marcar NOVO e EXISTENTE (com alteração). Desmarcar SEM_ALTERACAO para economizar requests
          selected: diffStatus !== 'SEM_ALTERACAO',
        }
      })

      setPreviewItems(previews)
      setUnrecognizedItems(parseResult.unrecognized)
      setDocumentStats({
        totalPages: parseResult.totalPages,
        fileName,
        fileSize: fileSizeStr,
      })

      setExtractionProgress(100)
      toast({
        title: 'Extração Concluída',
        description: `${previews.length} medicamentos identificados no documento.`,
      })
    } catch (err: unknown) {
      console.error('Falha ao processar PDF:', err)
      const msg = err instanceof Error ? err.message : 'Não foi possível ler o documento PDF.'
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
    const buffer = await file.arrayBuffer()
    await processPdfBuffer(buffer, file.name, `${sizeInMb} MB`)
  }

  // Carregar o PDF de teste institucional já disponível no projeto
  const handleLoadOfficialTestPdf = async () => {
    setExtracting(true)
    setExtractionProgress(10)
    setExtractionStage('Carregando PDF institucional Help Vida (ANEXO I)...')

    try {
      const response = await fetch(officialPdfUrl)
      if (!response.ok) throw new Error('Não foi possível obter o arquivo PDF institucional')
      const blob = await response.blob()
      const sizeInMb = (blob.size / (1024 * 1024)).toFixed(2)
      const buffer = await blob.arrayBuffer()
      setSelectedFile(
        new File([blob], 'relacao-dos-medicamentos-avaliados-16.10.pdf', {
          type: 'application/pdf',
        }),
      )
      await processPdfBuffer(
        buffer,
        'Relação dos Medicamentos Avaliados e Definição de Padronização 16.10.pdf',
        `${sizeInMb} MB`,
      )
    } catch (err: unknown) {
      console.error(err)
      toast({
        title: 'Erro ao carregar PDF de teste',
        description: 'Não foi possível ler o arquivo modelo.',
        variant: 'destructive',
      })
      setExtracting(false)
    }
  }

  // Contagens dos itens
  const counts = useMemo(() => {
    const total = previewItems.length
    const novos = previewItems.filter((i) => i.diffStatus === 'NOVO').length
    const existentes = previewItems.filter((i) => i.diffStatus === 'EXISTENTE').length
    const semAlteracao = previewItems.filter((i) => i.diffStatus === 'SEM_ALTERACAO').length
    const selecionados = previewItems.filter((i) => i.selected).length

    return { total, novos, existentes, semAlteracao, selecionados }
  }, [previewItems])

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
    const filteredKeys = new Set(
      filteredPreview.map((item) => makeMedicamentoKey(item.nome, item.classe)),
    )

    setPreviewItems((prev) =>
      prev.map((item) => {
        const key = makeMedicamentoKey(item.nome, item.classe)
        if (filteredKeys.has(key)) {
          return { ...item, selected }
        }
        return item
      }),
    )
  }

  // Executar a gravação em lote no PocketBase
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
    setImportProgress(0)

    let countNovos = 0
    let countAtualizados = 0
    let countInalterados = 0
    let countIgnorados = previewItems.length - toImport.length

    try {
      for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i]

        const payload = {
          nome: item.nome.trim(),
          classe: item.classe.trim(),
          status: item.status,
          descricao: item.descricao || '',
          observacao: item.observacao || '',
        }

        if (item.diffStatus === 'EXISTENTE' && item.existingId) {
          // Atualizar medicamento existente
          await pb.collection('medicamentos').update(item.existingId, payload)
          countAtualizados++
        } else if (item.diffStatus === 'NOVO') {
          // Criar novo
          await pb.collection('medicamentos').create(payload)
          countNovos++
        } else if (item.diffStatus === 'SEM_ALTERACAO') {
          // Já estava idêntico (se o usuário marcou para regravar)
          if (item.existingId) {
            await pb.collection('medicamentos').update(item.existingId, payload)
          }
          countInalterados++
        }

        setImportProgress(Math.round(((i + 1) / toImport.length) * 100))
      }

      // Atualizar lista local de medicamentos
      await loadExistingMedicamentos()

      const summary = {
        novos: countNovos,
        atualizados: countAtualizados,
        inalterados: countInalterados,
        ignorados: countIgnorados,
      }
      setImportSummary(summary)

      // Gravar automaticamente no histórico de importações
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
        loadHistorico()
      } catch (histErr) {
        console.error('Erro ao registrar histórico de importação:', histErr)
      }

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

      toast({
        title: 'Importação finalizada com sucesso!',
        description: `${countNovos} novos medicamentos criados, ${countAtualizados} atualizados.`,
      })
    } catch (err: unknown) {
      console.error('Erro na gravação:', err)
      toast({
        title: 'Erro na importação',
        description: getErrorMessage(err, 'Falha ao sincronizar registros com o banco de dados.'),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
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
            disabled={extracting || importing}
            className="h-9 border-emerald-950/20 text-[#0C4336] hover:bg-[#E6F5F2] text-xs font-semibold"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
            Carregar PDF Modelo (ANEXO I)
          </Button>
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

          {/* Área de Upload / Seleção de Arquivo */}
          <Card className="border-emerald-950/10 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-[#0D8272]" />
                  1. Selecionar Arquivo do Novo ANEXO (PDF)
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
                        Ou use o botão &quot;Carregar PDF Modelo&quot; no topo para testar com o
                        ANEXO I oficial
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
                      2. Conferência dos Medicamentos Extraídos
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Verifique o casamento com a base atual. Você pode desmarcar itens que não
                      deseja gravar.
                    </CardDescription>
                  </div>

                  {/* Botão de Gravação Principal */}
                  <div className="flex items-center gap-2">
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
                          Importar {counts.selecionados} Medicamento
                          {counts.selecionados === 1 ? '' : 's'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Chips de Resumo de Casamento */}
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
                    <span>Novos</span>
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
                    <span>Com alteração</span>
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
                            makeMedicamentoKey(p.nome, p.classe) ===
                            makeMedicamentoKey(item.nome, item.classe),
                        )

                        return (
                          <tr
                            key={`${item.nome}-${item.classe}-${idx}`}
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

          {/* 3. Bloco de Itens Não Reconhecidos (para revisão manual) */}
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
                    const dataObj = new Date(item.created)
                    const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
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
    </div>
  )
}
