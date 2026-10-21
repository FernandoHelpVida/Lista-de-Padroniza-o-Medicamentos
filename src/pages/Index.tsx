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

import type { RecordModel } from 'pocketbase'

export interface MedicamentoRecord extends RecordModel {
  nome: string
  classe: string
  status: 'Padronizado' | 'Não Padronizado' | 'Inativo'
  descricao?: string
  observacao?: string
}

const COLORS = [
  '#0D9488', // teal-600
  '#0284C7', // sky-600
  '#6366F1', // indigo-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#14B8A6', // teal-500
  '#3B82F6', // blue-500
  '#64748B', // slate-500
]

export default function Index() {
  const { user } = useAuth()
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
        })
        if (!cancelled) {
          setMedicamentos(records)
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
          <Badge className="bg-[#DCFCE7] text-[#15803D] hover:bg-[#DCFCE7] border-0 text-[11px] font-semibold">
            Padronizado
          </Badge>
        )
      case 'Não Padronizado':
        return (
          <Badge className="bg-[#FEF3C7] text-[#B45309] hover:bg-[#FEF3C7] border-0 text-[11px] font-semibold">
            Não Padronizado
          </Badge>
        )
      case 'Inativo':
        return (
          <Badge className="bg-[#E2E8F0] text-[#475569] hover:bg-[#E2E8F0] border-0 text-[11px] font-semibold">
            Inativo
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* 1. CABEÇALHO DE BOAS-VINDAS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Olá, {user?.name ? user.name.split(' ')[0] : 'Profissional'}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 capitalize mt-1 flex items-center gap-2">
            <span>{currentDate}</span>
            <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-teal-700 font-medium">Comissão de Padronização Help Vida</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/assistente')}
            variant="outline"
            size="sm"
            className="border-teal-200 text-teal-700 hover:bg-teal-50 text-xs font-semibold"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-teal-600" />
            Dúvidas com Assistente
          </Button>
          <Button
            onClick={() => navigate('/medicamentos')}
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm"
          >
            Ver Catálogo Completo
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. BARRA DE BUSCA CENTRALIZADA GRANDE */}
      <div className="w-full max-w-3xl mx-auto">
        <form onSubmit={handleSearchSubmit} className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-teal-600 transition-colors" />
          <Input
            type="search"
            placeholder="Buscar medicamento por nome ou classe terapêutica…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-14 pl-12 pr-28 text-base bg-white border border-slate-200 rounded-2xl shadow-sm focus-visible:ring-4 focus-visible:ring-teal-500/20 focus-visible:border-teal-500 transition-all placeholder:text-slate-400"
          />
          <Button
            type="submit"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Buscar
          </Button>
        </form>
      </div>

      {/* 3. CARDS DE ESTATÍSTICA (CLICÁVEIS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div
          onClick={() => navigate('/medicamentos')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Total Avaliado
            </span>
            <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition">
              <Pill className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 font-mono">
              {loading ? '...' : stats.total}
            </span>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 group-hover:text-teal-600 transition">
              Ver todos <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Todos os itens catalogados</p>
        </div>

        {/* Padronizados */}
        <div
          onClick={() => navigate('/medicamentos?status=Padronizado')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">
              Padronizados
            </span>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-600 font-mono">
              {loading ? '...' : stats.padronizados}
            </span>
            <span className="text-xs text-emerald-600/80 font-medium flex items-center gap-1 group-hover:text-emerald-700 transition">
              Filtrar <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Disponíveis na rotina da Help Vida</p>
        </div>

        {/* Não Padronizados */}
        <div
          onClick={() => navigate('/medicamentos?status=Não+Padronizado')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 tracking-wider uppercase">
              Não Padronizados
            </span>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-amber-600 font-mono">
              {loading ? '...' : stats.naoPadronizados}
            </span>
            <span className="text-xs text-amber-600/80 font-medium flex items-center gap-1 group-hover:text-amber-700 transition">
              Filtrar <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Exigem justificativa médica fundamentada
          </p>
        </div>

        {/* Inativos */}
        <div
          onClick={() => navigate('/medicamentos?status=Inativo')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
              Inativos
            </span>
            <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition">
              <Archive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-600 font-mono">
              {loading ? '...' : stats.inativos}
            </span>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 group-hover:text-slate-600 transition">
              Filtrar <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Descontinuados no sistema Spincare</p>
        </div>
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
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                  Distribuição por Classe Terapêutica
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Concentração das classes farmacológicas avaliadas pela Comissão
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Gráfico Donut Recharts */}
              <div className="h-64 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={classDistribution.top10Chart}
                      innerRadius={65}
                      outerRadius={95}
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
                        backgroundColor: '#0F172A',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                        border: 'none',
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-800 font-mono">
                    {stats.total}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Itens
                  </span>
                </div>
              </div>

              {/* Lista dos Top 5 mais representativos */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-700 block">
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
                      className="group cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 truncate max-w-[180px] group-hover:text-teal-600 transition">
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
        <Card className="border-slate-200 bg-white shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-600" />
                Atualizados Recentemente
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/medicamentos')}
                className="text-xs text-teal-700 hover:text-teal-800 p-0 h-auto font-medium"
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
                  className="py-3 group cursor-pointer hover:bg-slate-50/80 -mx-3 px-3 rounded-lg transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-teal-600 transition">
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
              <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100 flex items-center gap-2.5">
                <FileCheck2 className="h-4 w-4 text-teal-600 shrink-0" />
                <span className="text-[11px] text-teal-900 leading-tight">
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
