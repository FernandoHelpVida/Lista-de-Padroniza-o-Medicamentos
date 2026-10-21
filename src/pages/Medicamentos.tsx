import React, { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import type { MedicamentoRecord } from './Index'
import {
  Search,
  Download,
  Plus,
  Pill,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Archive,
  X,
  FileSpreadsheet,
  Edit3,
  Trash2,
  ExternalLink,
  ChevronDown,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'

const ITEMS_PER_PAGE = 25

export default function Medicamentos() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  const [todosMedicamentos, setTodosMedicamentos] = useState<MedicamentoRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Carregar dados e sincronizar via useRealtime
  useEffect(() => {
    let cancelled = false
    const loadMedicamentos = async () => {
      try {
        const records = await pb.collection<MedicamentoRecord>('medicamentos').getFullList({
          sort: 'nome',
        })
        if (!cancelled) {
          setTodosMedicamentos(records)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) setLoading(false)
      }
    }
    loadMedicamentos()
    return () => {
      cancelled = true
    }
  }, [])

  useRealtime<MedicamentoRecord>('medicamentos', (event) => {
    if (event.action === 'create') {
      setTodosMedicamentos((prev) => {
        const next = [...prev, event.record]
        return next.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      })
    } else if (event.action === 'update') {
      setTodosMedicamentos((prev) =>
        prev.map((item) => (item.id === event.record.id ? event.record : item)),
      )
    } else if (event.action === 'delete') {
      setTodosMedicamentos((prev) => prev.filter((item) => item.id !== event.record.id))
    }
  })

  // Filtros ativos a partir da URL
  const queryParam = searchParams.get('q') || ''
  const statusParam = searchParams.get('status') || 'Todos'
  const classeParam = searchParams.get('classe') || 'Todas'

  const [page, setPage] = useState(1)

  // Estado de detalhes e modais
  const [selectedMed, setSelectedMed] = useState<MedicamentoRecord | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MedicamentoRecord | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<MedicamentoRecord | null>(null)
  const [saving, setSaving] = useState(false)

  // Formulário de criar/editar
  const [formNome, setFormNome] = useState('')
  const [formClasse, setFormClasse] = useState('')
  const [formStatus, setFormStatus] = useState<'Padronizado' | 'Não Padronizado' | 'Inativo'>(
    'Padronizado',
  )
  const [formDescricao, setFormDescricao] = useState('')
  const [formObservacao, setFormObservacao] = useState('')

  // Redefinir página quando filtros mudam
  useEffect(() => {
    setPage(1)
  }, [queryParam, statusParam, classeParam])

  // Lista única e ordenada de classes terapêuticas
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>()
    todosMedicamentos.forEach((m) => {
      if (m.classe) set.add(m.classe)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [todosMedicamentos])

  // Contagens por status para os chips
  const statusCounts = useMemo(() => {
    return {
      Todos: todosMedicamentos.length,
      Padronizado: todosMedicamentos.filter((m) => m.status === 'Padronizado').length,
      'Não Padronizado': todosMedicamentos.filter((m) => m.status === 'Não Padronizado').length,
      Inativo: todosMedicamentos.filter((m) => m.status === 'Inativo').length,
    }
  }, [todosMedicamentos])

  // Atualizar URL query params
  const updateFilter = (updates: { q?: string; status?: string; classe?: string }) => {
    const nextParams = new URLSearchParams(searchParams)

    if (updates.q !== undefined) {
      if (updates.q.trim()) nextParams.set('q', updates.q.trim())
      else nextParams.delete('q')
    }

    if (updates.status !== undefined) {
      if (updates.status !== 'Todos') nextParams.set('status', updates.status)
      else nextParams.delete('status')
    }

    if (updates.classe !== undefined) {
      if (updates.classe !== 'Todas') nextParams.set('classe', updates.classe)
      else nextParams.delete('classe')
    }

    setSearchParams(nextParams, { replace: true })
  }

  const clearAllFilters = () => {
    setSearchParams({}, { replace: true })
  }

  const hasActiveFilters = Boolean(
    queryParam ||
    (statusParam && statusParam !== 'Todos') ||
    (classeParam && classeParam !== 'Todas'),
  )

  // Filtragem dos registros
  const filteredMedicamentos = useMemo(() => {
    const q = queryParam.toLowerCase().trim()

    return todosMedicamentos.filter((med) => {
      // Filtro de status
      if (statusParam && statusParam !== 'Todos') {
        if (med.status !== statusParam) return false
      }

      // Filtro de classe
      if (classeParam && classeParam !== 'Todas') {
        if (med.classe !== classeParam) return false
      }

      // Filtro de texto (nome ou classe)
      if (q) {
        const matchNome = med.nome.toLowerCase().includes(q)
        const matchClasse = med.classe.toLowerCase().includes(q)
        if (!matchNome && !matchClasse) return false
      }

      return true
    })
  }, [todosMedicamentos, queryParam, statusParam, classeParam])

  // Paginação client-side
  const paginatedMedicamentos = useMemo(() => {
    return filteredMedicamentos.slice(0, page * ITEMS_PER_PAGE)
  }, [filteredMedicamentos, page])

  const canLoadMore = paginatedMedicamentos.length < filteredMedicamentos.length

  // Exportar para CSV
  const exportToCsv = () => {
    if (filteredMedicamentos.length === 0) {
      toast({
        title: 'Nenhum medicamento para exportar',
        description: 'Ajuste os filtros antes de gerar o arquivo.',
        variant: 'destructive',
      })
      return
    }

    const header = [
      'Nome do Medicamento',
      'Classe Terapêutica',
      'Status de Padronização',
      'Descrição / Indicação',
      'Observações',
    ]
    const rows = filteredMedicamentos.map((m) => [
      `"${m.nome.replace(/"/g, '""')}"`,
      `"${m.classe.replace(/"/g, '""')}"`,
      `"${m.status}"`,
      `"${(m.descricao || '').replace(/"/g, '""')}"`,
      `"${(m.observacao || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `padronizacao-medicamentos-helpvida-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação Concluída',
      description: `${filteredMedicamentos.length} medicamentos exportados em formato CSV.`,
    })
  }

  // Abertura do modal de criação
  const handleOpenCreateModal = () => {
    setEditingRecord(null)
    setFormNome('')
    setFormClasse('')
    setFormStatus('Padronizado')
    setFormDescricao('')
    setFormObservacao('')
    setEditModalOpen(true)
  }

  // Abertura do modal de edição
  const handleOpenEditModal = (med: MedicamentoRecord) => {
    setEditingRecord(med)
    setFormNome(med.nome)
    setFormClasse(med.classe)
    setFormStatus(med.status)
    setFormDescricao(med.descricao || '')
    setFormObservacao(med.observacao || '')
    setEditModalOpen(true)
  }

  // Gravação no PocketBase (Create ou Update)
  const handleSaveMedicamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formNome.trim() || !formClasse.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe o nome e a classe terapêutica.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: formNome.trim().toUpperCase(),
        classe: formClasse.trim(),
        status: formStatus,
        descricao: formDescricao.trim(),
        observacao:
          formStatus === 'Não Padronizado' && !formObservacao.trim()
            ? 'Os medicamentos não padronizados deverão ser solicitados mediante justificativa médica fundamentada.'
            : formObservacao.trim(),
      }

      if (editingRecord) {
        await pb.collection('medicamentos').update(editingRecord.id, payload)
        toast({
          title: 'Medicamento atualizado',
          description: `${payload.nome} foi atualizado com sucesso.`,
        })
      } else {
        await pb.collection('medicamentos').create(payload)
        toast({
          title: 'Medicamento cadastrado',
          description: `${payload.nome} adicionado à padronização.`,
        })
      }

      setEditModalOpen(false)
      if (selectedMed && editingRecord && selectedMed.id === editingRecord.id) {
        setSelectedMed({ ...selectedMed, ...payload })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar medicamento.'
      toast({
        title: 'Erro ao salvar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Exclusão de medicamento
  const handleDeleteMedicamento = async () => {
    if (!recordToDelete) return
    setSaving(true)
    try {
      await pb.collection('medicamentos').delete(recordToDelete.id)
      toast({
        title: 'Medicamento excluído',
        description: `${recordToDelete.nome} foi removido com sucesso.`,
      })
      setDeleteConfirmOpen(false)
      if (selectedMed?.id === recordToDelete.id) {
        setSelectedMed(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir registro.'
      toast({
        title: 'Erro ao excluir',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      setRecordToDelete(null)
    }
  }

  const getStatusBadge = (status: MedicamentoRecord['status']) => {
    switch (status) {
      case 'Padronizado':
        return (
          <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/30 hover:bg-[#E6F5F2] text-[11px] font-bold flex items-center gap-1 shrink-0">
            <CheckCircle2 size={12} className="text-[#0D8272]" />
            Padronizado
          </Badge>
        )
      case 'Não Padronizado':
        return (
          <Badge className="bg-[#FEF8EC] text-[#B45309] border border-[#F5B31C]/40 hover:bg-[#FEF8EC] text-[11px] font-bold flex items-center gap-1 shrink-0">
            <AlertTriangle size={12} className="text-[#F5B31C]" />
            Não Padronizado
          </Badge>
        )
      case 'Inativo':
        return (
          <Badge className="bg-[#F1F5F9] text-[#475569] border border-slate-200 hover:bg-[#F1F5F9] text-[11px] font-semibold flex items-center gap-1 shrink-0">
            <Archive size={12} />
            Inativo
          </Badge>
        )
    }
  }

  const getStatusIconColor = (status: MedicamentoRecord['status']) => {
    switch (status) {
      case 'Padronizado':
        return 'text-[#0F5342] bg-[#E6F5F2] border-[#0D8272]/30'
      case 'Não Padronizado':
        return 'text-[#B45309] bg-[#FEF8EC] border-[#F5B31C]/40'
      case 'Inativo':
        return 'text-slate-500 bg-slate-100 border-slate-200'
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. CABEÇALHO DA PÁGINA (MOBILE OPTIMIZED) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0C4336] tracking-tight">
            Catálogo de Medicamentos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {filteredMedicamentos.length} medicamento
            {filteredMedicamentos.length === 1 ? '' : 's'} encontrado
            {filteredMedicamentos.length === 1 ? '' : 's'} de {todosMedicamentos.length} catalogados
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={exportToCsv}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial h-9 min-h-[38px] border-emerald-950/15 text-[#0C4336] hover:bg-[#E6F5F2] text-xs font-semibold"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-[#0D8272]" />
            Exportar CSV
          </Button>

          {isAdmin && (
            <Button
              onClick={handleOpenCreateModal}
              size="sm"
              className="flex-1 sm:flex-initial h-9 min-h-[38px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
              Novo Item
            </Button>
          )}
        </div>
      </div>

      {/* 2. BARRA DE BUSCA E FILTROS (MOBILE-FRIENDLY: CHIPS COM ROLAGEM HORIZONTAL SUAVE) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-950/10 shadow-xs space-y-3 sm:space-y-4">
        {/* Campo de Busca Otimizado para Toque */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-800/60" />
          <Input
            type="search"
            placeholder="Pesquisar por nome ou princípio ativo…"
            value={queryParam}
            onChange={(e) => updateFilter({ q: e.target.value })}
            className="pl-10 pr-9 h-11 text-sm bg-[#F4FAF8] border-emerald-900/15 rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0D8272]"
          />
          {queryParam && (
            <button
              onClick={() => updateFilter({ q: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5"
              aria-label="Limpar busca"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Linha de Chips de Status e Dropdown de Classe */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-0.5">
          {/* Status Chips - Scroll horizontal seguro no celular sem quebrar layout */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none -mx-1 px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:flex items-center gap-1 shrink-0">
              <Filter size={11} />
              Status:
            </span>

            {[
              { id: 'Todos', label: 'Todos', count: statusCounts.Todos },
              { id: 'Padronizado', label: 'Padronizados', count: statusCounts.Padronizado },
              {
                id: 'Não Padronizado',
                label: 'Não Padronizados',
                count: statusCounts['Não Padronizado'],
              },
              { id: 'Inativo', label: 'Inativos', count: statusCounts.Inativo },
            ].map((chip) => {
              const isSelected = (statusParam || 'Todos') === chip.id
              return (
                <button
                  key={chip.id}
                  onClick={() => updateFilter({ status: chip.id })}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 shrink-0 min-h-[34px] select-none',
                    isSelected
                      ? 'bg-[#0F5342] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 active:bg-[#E6F5F2]',
                  )}
                >
                  <span>{chip.label}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded-full font-mono',
                      isSelected
                        ? 'bg-[#F5B31C] text-[#0C4336] font-bold'
                        : 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {chip.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Filtro de Classe Terapêutica no mobile */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 hidden sm:inline">
              Classe:
            </span>
            <Select
              value={classeParam || 'Todas'}
              onValueChange={(val) => updateFilter({ classe: val })}
            >
              <SelectTrigger className="w-full lg:w-[230px] h-9 min-h-[38px] text-xs bg-[#F4FAF8] border-emerald-900/15">
                <SelectValue placeholder="Todas as classes" />
              </SelectTrigger>
              <SelectContent className="max-h-64 text-xs">
                <SelectItem value="Todas">Todas as classes ({uniqueClasses.length})</SelectItem>
                {uniqueClasses.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-9 min-h-[38px] px-2.5 shrink-0 font-medium"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 3. LISTAGEM DE RESULTADOS */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-2" />
          <p className="text-xs font-medium">Carregando medicamentos da Help Vida...</p>
        </div>
      ) : filteredMedicamentos.length === 0 ? (
        /* Estado Vazio */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
          <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Nenhum medicamento encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Não encontramos resultados para os termos ou filtros aplicados na padronização.
          </p>
          <Button
            onClick={clearAllFilters}
            variant="outline"
            size="sm"
            className="mt-4 text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            Limpar todos os filtros
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2.5">
            {paginatedMedicamentos.map((med) => {
              const borderAccent =
                med.status === 'Padronizado'
                  ? 'hover:border-emerald-300'
                  : med.status === 'Não Padronizado'
                    ? 'hover:border-amber-300'
                    : 'hover:border-slate-300'

              return (
                <div
                  key={med.id}
                  onClick={() => setSelectedMed(med)}
                  className={cn(
                    'bg-white p-3.5 sm:p-4 rounded-xl border border-emerald-950/10 shadow-xs transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 group',
                    borderAccent,
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 shadow-2xs',
                        getStatusIconColor(med.status),
                      )}
                    >
                      <Pill size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-[#0C4336] group-hover:text-[#0D8272] transition truncate leading-snug">
                        {med.nome}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                        Classe: <span className="text-slate-700 font-semibold">{med.classe}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                    {getStatusBadge(med.status)}
                    <span className="text-xs font-semibold text-[#0D8272] group-hover:translate-x-0.5 transition hidden sm:inline-block">
                      Ver Ficha &rarr;
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Botão Carregar Mais */}
          {canLoadMore && (
            <div className="text-center pt-4">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => prev + 1)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs px-6 font-semibold"
              >
                Carregar mais medicamentos (
                {filteredMedicamentos.length - paginatedMedicamentos.length} restantes)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 4. MODAL DE DETALHE DO MEDICAMENTO */}
      <Dialog open={Boolean(selectedMed)} onOpenChange={(open) => !open && setSelectedMed(null)}>
        <DialogContent className="max-w-lg p-6 rounded-2xl bg-white">
          {selectedMed && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                      Ficha do Medicamento
                    </span>
                    <DialogTitle className="text-lg font-bold text-slate-900 leading-snug pt-1">
                      {selectedMed.nome}
                    </DialogTitle>
                  </div>
                  <div>{getStatusBadge(selectedMed.status)}</div>
                </div>
                <DialogDescription className="text-xs text-slate-500 pt-1">
                  Classe Terapêutica:{' '}
                  <strong className="text-slate-800">{selectedMed.classe}</strong>
                </DialogDescription>
              </DialogHeader>

              {/* Caixa Destacada Conforme o Status */}
              {selectedMed.status === 'Padronizado' && (
                <div className="p-3.5 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/30 text-[#0C4336] text-xs flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#0D8272] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Medicamento Padronizado Help Vida</strong>
                    <span className="text-slate-700">
                      Disponível na rotina de atendimento assistencial e home care da Help Vida.
                    </span>
                  </div>
                </div>
              )}

              {selectedMed.status === 'Não Padronizado' && (
                <div className="p-3.5 rounded-xl bg-[#FEF8EC] border border-[#F5B31C]/40 text-[#92400E] text-xs flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-[#F5B31C] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Medicamento NÃO Padronizado</strong>
                    <span className="text-slate-700">
                      A solicitação médica requer justificativa fundamentada submetida à avaliação
                      da comissão técnica ou responsável técnico.
                    </span>
                  </div>
                </div>
              )}

              {selectedMed.status === 'Inativo' && (
                <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex items-start gap-3">
                  <Archive className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Medicamento Inativo</strong>
                    <span>
                      Este medicamento está inativo no sistema da farmácia Help Vida (Spincare).
                    </span>
                  </div>
                </div>
              )}

              {/* Descrição / Indicação */}
              {selectedMed.descricao && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Descrição clínica / Farmacológica
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-[#F4FAF8] p-3 rounded-xl border border-emerald-950/10">
                    {selectedMed.descricao}
                  </p>
                </div>
              )}

              {/* Observação institucional */}
              {selectedMed.observacao && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                    Observação da Comissão
                  </span>
                  <p className="text-xs text-amber-950 leading-relaxed bg-[#FEF8EC] p-3 rounded-xl border border-[#F5B31C]/30">
                    {selectedMed.observacao}
                  </p>
                </div>
              )}

              {/* Ações de Edição (Apenas Admin) */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditModal(selectedMed)}
                      className="text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 size={13} className="mr-1.5 text-slate-500" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecordToDelete(selectedMed)
                        setDeleteConfirmOpen(true)
                      }}
                      className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                    >
                      <Trash2 size={13} className="mr-1.5 text-rose-500" />
                      Excluir
                    </Button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Dados validados pela comissão técnica
                  </span>
                )}

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedMed(null)}
                  className="w-full sm:w-auto h-10 min-h-[42px] text-xs bg-[#0F5342] hover:bg-[#0C4336] text-white font-semibold rounded-xl"
                >
                  Voltar ao Catálogo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 5. MODAL DE CRIAÇÃO / EDIÇÃO (ADMIN ONLY) */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl bg-white">
          <form onSubmit={handleSaveMedicamento} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                {editingRecord ? 'Editar Medicamento' : 'Novo Medicamento na Padronização'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Preencha as informações conforme os padrões da Comissão de Padronização.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-xs font-semibold text-slate-700">
                Nome completo e apresentação *
              </Label>
              <Input
                id="nome"
                placeholder="Ex: DIPIRONA 500MG/ML FR 10 ML"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                required
                className="h-10 text-xs uppercase"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="classe" className="text-xs font-semibold text-slate-700">
                  Classe Terapêutica *
                </Label>
                <Input
                  id="classe"
                  placeholder="Ex: Antibacteriano"
                  value={formClasse}
                  onChange={(e) => setFormClasse(e.target.value)}
                  required
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-xs font-semibold text-slate-700">
                  Status de Padronização *
                </Label>
                <Select
                  value={formStatus}
                  onValueChange={(val: 'Padronizado' | 'Não Padronizado' | 'Inativo') =>
                    setFormStatus(val)
                  }
                >
                  <SelectTrigger id="status" className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="Padronizado">Padronizado</SelectItem>
                    <SelectItem value="Não Padronizado">Não Padronizado</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao" className="text-xs font-semibold text-slate-700">
                Descrição clínica / Indicação (opcional)
              </Label>
              <Textarea
                id="descricao"
                placeholder="Indicação farmacológica, mecanismos de ação..."
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacao" className="text-xs font-semibold text-slate-700">
                Observação / Diretriz de Justificativa
              </Label>
              <Textarea
                id="observacao"
                placeholder="Observações pertinentes à prescrição ou justificativa..."
                value={formObservacao}
                onChange={(e) => setFormObservacao(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-9 min-h-[38px] font-semibold"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />
              Excluir Medicamento
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Tem certeza de que deseja excluir permanentemente o medicamento{' '}
              <strong className="text-slate-900">{recordToDelete?.nome}</strong> da base de dados
              Help Vida? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={saving}
              onClick={handleDeleteMedicamento}
              className="text-xs"
            >
              {saving ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
