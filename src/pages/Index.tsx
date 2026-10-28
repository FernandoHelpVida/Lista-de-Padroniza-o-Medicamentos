import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import {
  Pill,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Search,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  FileCheck2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts'
import { InstallPwaPrompt } from '@/components/InstallPwaPrompt'
import { cn } from '@/lib/utils'

import type { RecordModel } from 'pocketbase'

export interface MedicamentoRecord extends RecordModel {
  nome: string
  classe: string
  classe_detalhada?: string
  status: 'Padronizado' | 'Não Padronizado' | 'Inativo'
  descricao?: string
  observacao?: string
  pdfId?: number
}

const COLORS = [
  '#0F5342', // Verde escuro Help Vida (primária)
  '#0D8272', // Teal Help Vida (secundária)
  '#F5B31C', // Amarelo Asterisco Help Vida (destaque)
  '#1A8F7E', // Teal vibrante
  '#2C6E5C', // Verde médio floresta
  '#E69500', // Âmbar dourado
  '#0C4336', // Verde profundo
  '#3AA99F', // Menta marinho
  '#5FA691', // Salvia hospitalar
  '#D97706', // Âmbar escuro
]

export default function Index() {
  const { user, isMedicoVisitador } = useAuth()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')

  const [medicamentos, setMedicamentos] = useState<MedicamentoRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Carregar dados iniciais e manter sincronizado via useRealtime
  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      try {
        const records = await pb.collection<MedicamentoRecord>('medicamentos').getFullList({
          sort: '-updated',
          filter: isMedicoVisitador ? "status = 'Padronizado'" : undefined,
        })
        if (!cancelled) {
          const filtered = isMedicoVisitador
            ? records.filter((m) => m.status === 'Padronizado')
            : records
          setMedicamentos(filtered)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  useRealtime<MedicamentoRecord>('medicamentos', (event) => {
    if (event.action === 'create') {
      setMedicamentos((prev) => [event.record, ...prev])
    } else if (event.action === 'update') {
      setMedicamentos((prev) =>
        prev.map((item) => (item.id === event.record.id ? event.record : item)),
      )
    } else if (event.action === 'delete') {
      setMedicamentos((prev) => prev.filter((item) => item.id !== event.record.id))
    }
  })

  // Data formatada em português brasileiro
  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  }, [])

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const total = medicamentos.length
    const padronizados = medicamentos.filter((m) => m.status === 'Padronizado').length
    const naoPadronizados = medicamentos.filter((m) => m.status === 'Não Padronizado').length
    const inativos = medicamentos.filter((m) => m.status === 'Inativo').length

    return { total, padronizados, naoPadronizados, inativos }
  }, [medicamentos])

  // Distribuição por classe terapêutica (Top 10 para o gráfico donut)
  const classDistribution = useMemo(() => {
    const map: Record<string, number> = {}
    medicamentos.forEach((m) => {
      const cls = m.classe || 'Outras'
      map[cls] = (map[cls] || 0) + 1
    })

    const sorted = Object.entries(map)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value)

    const top9 = sorted.slice(0, 9)
    const othersCount = sorted.slice(9).reduce((acc, curr) => acc + curr.value, 0)

    if (othersCount > 0) {
      top9.push({ name: 'Demais classes', value: othersCount })
    }

    return {
      top10Chart: top9,
      top5List: sorted.slice(0, 5),
    }
  }, [medicamentos])

  // Medicamentos atualizados recentemente (5 primeiros)
  const recentMedications = useMemo(() => {
    return medicamentos.slice(0, 5)
  }, [medicamentos])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchTerm.trim()) {
      navigate(`/medicamentos?q=${encodeURIComponent(searchTerm.trim())}`)
    }
  }

  const getStatusBadge = (status: MedicamentoRecord['status']) => {
    switch (status) {
      case 'Padronizado':
        return (
          <Badge className="bg-[#E6F5F2] text-[#0C4336] border border-[#0D8272]/20 hover:bg-[#E6F5F2] text-[11px] font-bold">
            Padronizado
          </Badge>
        )
      case 'Não Padronizado':
        return (
          <Badge className="bg-[#FEF8EC] text-[#B45309] border border-[#F5B31C]/30 hover:bg-[#FEF8EC] text-[11px] font-bold">
            Não Padronizado
          </Badge>
        )
      case 'Inativo':
        return (
          <Badge className="bg-[#F1F5F9] text-[#475569] border border-slate-200 hover:bg-[#F1F5F9] text-[11px] font-medium">
            Inativo
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300">
      {/* 1. CABEÇALHO DE BOAS-VINDAS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-emerald-950/10">
        <div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#0C4336]">
            Olá, {user?.name ? user.name.split(' ')[0] : 'Doutor(a)'}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 capitalize mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span>{currentDate}</span>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-[#F5B31C]" />
            <span className="text-[#0D8272] font-semibold text-[11px] sm:text-xs">
              Padronização de Medicamentos
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <Button
            onClick={() => navigate('/assistente')}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial h-9 min-h-[38px] border-[#0D8272]/30 text-[#0C4336] hover:bg-[#E6F5F2] text-xs font-semibold"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
            Dúvidas com Assistente
          </Button>
          <Button
            onClick={() => navigate('/medicamentos')}
            size="sm"
            className="flex-1 sm:flex-initial h-9 min-h-[38px] bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold shadow-xs"
          >
            Ver Catálogo
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* BANNER DISPENSÁVEL DE INSTALAÇÃO DO APP NO CELULAR (PWA) */}
      <InstallPwaPrompt variant="banner" />

      {/* 2. BARRA DE BUSCA CENTRALIZADA GRANDE (MÉDICOS NO CELULAR) */}
      <div className="w-full max-w-3xl mx-auto">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-800/50 group-focus-within:text-[#0D8272] transition-colors" />
          <Input
            type="search"
            placeholder="Buscar por nome ou classe terapêutica…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-12 sm:h-14 pl-11 sm:pl-12 pr-24 sm:pr-28 text-sm sm:text-base bg-white border border-emerald-950/15 rounded-2xl shadow-xs focus-visible:ring-4 focus-visible:ring-[#0D8272]/20 focus-visible:border-[#0D8272] transition-all placeholder:text-slate-400"
          />
          <Button
            type="submit"
            className="absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 h-9 sm:h-10 px-3.5 sm:px-4 bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-semibold rounded-xl transition"
          >
            Buscar
          </Button>
        </form>
      </div>

      {/* 3. CARDS DE ESTATÍSTICA (GRID 2x2 COMPACTO NO MOBILE < 640px) */}
      <div
        className={cn(
          'grid gap-2.5 sm:gap-4',
          isMedicoVisitador ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4',
        )}
      >
        {/* Total Padronizado para Médico Visitador ou Total Geral */}
        <div
          onClick={() => navigate('/medicamentos')}
          className="bg-white p-3.5 sm:p-5 rounded-2xl border border-emerald-950/10 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider uppercase truncate">
              {isMedicoVisitador ? 'Medicamentos Padronizados' : 'Total Avaliado'}
            </span>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[#E6F5F2] text-[#0F5342] flex items-center justify-center group-hover:bg-[#0F5342] group-hover:text-white transition shrink-0">
              <Pill className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#0C4336] font-mono">
              {loading ? '...' : isMedicoVisitador ? stats.padronizados : stats.total}
            </span>
            <span className="text-[11px] sm:text-xs text-[#0D8272] font-medium hidden sm:flex items-center gap-1 group-hover:underline">
              Ver todos <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[10.5px] text-slate-400 mt-1 truncate">
            {isMedicoVisitador ? 'Itens disponíveis para consulta' : 'Itens catalogados'}
          </p>
        </div>

        {/* Padronizados */}
        <div
          onClick={() => navigate('/medicamentos?status=Padronizado')}
          className="bg-white p-3.5 sm:p-5 rounded-2xl border border-emerald-200/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-[#0F5342] tracking-wider uppercase truncate">
              {isMedicoVisitador ? 'Rotina Assistencial' : 'Padronizados'}
            </span>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[#E6F5F2] text-[#0F5342] flex items-center justify-center group-hover:bg-[#0F5342] group-hover:text-white transition shrink-0">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-[#0F5342] font-mono">
              {loading ? '...' : stats.padronizados}
            </span>
            <span className="text-[11px] sm:text-xs text-[#0F5342]/80 font-medium hidden sm:flex items-center gap-1 group-hover:underline">
              Consultar <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[10.5px] text-slate-400 mt-1 truncate">Rotina Help Vida</p>
        </div>

        {!isMedicoVisitador && (
          <>
            {/* Não Padronizados */}
            <div
              onClick={() => navigate('/solicitacoes')}
              className="bg-white p-3.5 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group active:scale-[0.98]"
              title="Ver solicitações de medicamentos não padronizados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-[#B45309] tracking-wider uppercase truncate">
                  Não Padronizados
                </span>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition shrink-0">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
              <div className="mt-2.5 sm:mt-4 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono">
                  {loading ? '...' : stats.naoPadronizados}
                </span>
                <span className="text-[11px] sm:text-xs text-amber-600/80 font-medium hidden sm:flex items-center gap-1 group-hover:underline">
                  Solicitações <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 mt-1 truncate">Aprovação da Farmácia</p>
            </div>

            {/* Inativos */}
            <div
              onClick={() => navigate('/medicamentos?status=Inativo')}
              className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider uppercase truncate">
                  Inativos
                </span>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition shrink-0">
                  <Archive className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
              <div className="mt-2.5 sm:mt-4 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-600 font-mono">
                  {loading ? '...' : stats.inativos}
                </span>
                <span className="text-[11px] sm:text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1 group-hover:underline">
                  Filtrar <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 mt-1 truncate">Descontinuados</p>
            </div>
          </>
        )}
      </div>

      {/* 4. CARD DE DESTAQUE COM OBSERVAÇÃO VERBATIM DO PDF */}
      <Card className="border-amber-200 bg-amber-50/70 shadow-sm overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                  Diretriz Institucional Help Vida
                </span>
                <h3 className="text-base sm:text-lg font-bold text-amber-950 mt-1">
                  Observação: Os medicamentos não padronizados deverão ser solicitados mediante
                  justificativa médica fundamentada.
                </h3>
              </div>

              <div className="space-y-1.5 text-xs text-amber-900/90 leading-relaxed">
                <p className="font-semibold text-amber-950">Exemplos aceitos pela comissão:</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  <li className="flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                    <span>
                      Pacientes com determinação judicial vigente para utilização do medicamento;
                    </span>
                  </li>
                  <li className="flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                    <span>
                      Pacientes pediátricos, quando não houver apresentação ou concentração adequada
                      do medicamento padronizado;
                    </span>
                  </li>
                  <li className="flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                    <span>
                      Falha terapêutica ou resposta insuficiente ao tratamento padronizado;
                    </span>
                  </li>
                  <li className="flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-amber-200/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                    <span>Contraindicação ou intolerância aos medicamentos padronizados;</span>
                  </li>
                  <li className="flex items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-amber-200/50 md:col-span-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                    <span>
                      Situações clínicas excepcionais, devidamente fundamentadas pelo médico
                      assistente e submetidas à avaliação do responsável técnico ou comissão
                      competente.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. SEÇÃO DE ANÁLISE GRÁFICA & RECENTES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Distribuição por Classe (2 Colunas) */}
        <Card className="lg:col-span-2 border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#0D8272]" />
                  Distribuição por Classe Terapêutica
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Concentração das classes farmacológicas no catálogo
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Gráfico Donut Recharts - Otimizado para Mobile */}
              <div className="h-56 sm:h-64 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={classDistribution.top10Chart}
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {classDistribution.top10Chart.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val, name) => [`${val} medicamentos`, name]}
                      contentStyle={{
                        backgroundColor: '#082921',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '12px',
                        border: '1px solid #0F5342',
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[#0C4336] font-mono">
                    {stats.total}
                  </span>
                  <span className="text-[10px] text-emerald-800 uppercase tracking-wider font-bold">
                    Itens
                  </span>
                </div>
              </div>

              {/* Lista dos Top 5 mais representativos */}
              <div className="space-y-2.5 sm:space-y-3">
                <span className="text-xs font-bold text-[#0C4336] block">
                  Top 5 Classes com maior volume:
                </span>
                {classDistribution.top5List.map((item, idx) => {
                  const percent = stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0
                  return (
                    <div
                      key={item.name}
                      onClick={() =>
                        navigate(`/medicamentos?classe=${encodeURIComponent(item.name)}`)
                      }
                      className="group cursor-pointer p-2 rounded-lg hover:bg-[#E6F5F2]/50 transition border border-transparent hover:border-emerald-200"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 truncate max-w-[170px] sm:max-w-[180px] group-hover:text-[#0D8272] transition">
                          {idx + 1}. {item.name}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold">
                          {item.value} ({percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: COLORS[idx % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Medicamentos Recentes (1 Coluna) */}
        <Card className="border-emerald-950/10 bg-white shadow-xs flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-[#0C4336] flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0D8272]" />
                Atualizados Recentemente
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/medicamentos')}
                className="text-xs text-[#0D8272] hover:text-[#0C4336] hover:bg-[#E6F5F2] p-1 h-auto font-semibold"
              >
                Ver todos
              </Button>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Últimos registros revisados
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0 flex-1 flex flex-col justify-between">
            <div className="divide-y divide-slate-100">
              {recentMedications.map((med) => (
                <div
                  key={med.id}
                  onClick={() => navigate(`/medicamentos?q=${encodeURIComponent(med.nome)}`)}
                  className="py-3 group cursor-pointer hover:bg-[#E6F5F2]/50 -mx-3 px-3 rounded-lg transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-[#0F5342] transition">
                        {med.nome}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{med.classe}</p>
                    </div>
                    <div className="shrink-0">{getStatusBadge(med.status)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 mt-2">
              <div className="p-3 bg-[#E6F5F2] rounded-xl border border-[#0D8272]/20 flex items-center gap-2.5">
                <FileCheck2 className="h-4 w-4 text-[#0D8272] shrink-0" />
                <span className="text-[11px] text-[#0C4336] leading-tight font-medium">
                  Lista oficial Spincare – Controle da Farmácia Help Vida.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
