/**
 * Importação e conciliação do relatório oficial "Saldo de Estoque Analítico" (XLSX)
 * do SpinCare: parse em runtime, mapeamento de colunas com preview, gravação em
 * spincare_saldo_estoque (upsert por spincare_id) e conciliação do custo médio
 * contra produtos_spincare — com ação "Aplicar valores do relatório" (admin-only).
 *
 * Sem dados embutidos no código: 100% do parse vem do upload do usuário.
 */
import React, { useState, useRef, useMemo } from 'react'
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Download,
  X,
  ShieldAlert,
  Search,
  ArrowRight,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { parsePlanilhaSaldo, sugerirMapeamento, mapearLinhas } from '@/lib/saldoEstoque'
import type {
  ParsePlanilhaResult,
  CampoAlvo,
  LinhaMapeada,
  ResumoImport,
  Divergencia,
  RelatorioConciliacao,
} from '@/lib/saldoEstoque'
import type { SpincareProdutoRecord } from '@/services/spincare'

interface ProdutoComFonte extends SpincareProdutoRecord {
  fonte_preco?: string
}

const COLECAO_SALDO = 'spincare_saldo_estoque'
const COLECAO_PRODUTOS = 'produtos_spincare'
const COLECAO_AUDIT = 'audit_logs'

const ROTULOS_CAMPO: Record<CampoAlvo, string> = {
  code: 'Código / ID do produto',
  description: 'Descrição do produto',
  saldo: 'Saldo (quantidade)',
  custo_medio: 'Custo médio (R$)',
}

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTimeIso(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface LinhaDivergencia {
  produto: SpincareProdutoRecord
  relatorio: LinhaMapeada
}

export default function ImportarRelatorio() {
  const { isAdmin } = useAuth()
  const inputFileRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parse, setParse] = useState<ParsePlanilhaResult | null>(null)
  const [mapa, setMapa] = useState<Record<CampoAlvo, number | null> | null>(null)

  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resumo, setResumo] = useState<ResumoImport | null>(null)
  const [conciliacao, setConciliacao] = useState<RelatorioConciliacao | null>(null)
  const [linhasDivergentes, setLinhasDivergentes] = useState<LinhaDivergencia[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [confirmarDialog, setConfirmarDialog] = useState(false)
  const [resultDialog, setResultDialog] = useState<null | {
    atualizados: number
    preservados: number
  }>(null)
  const [busca, setBusca] = useState('')

  // ------------------------------------------------------------------
  // Upload + parse
  // ------------------------------------------------------------------
  const handleFile = async (file: File) => {
    setParsing(true)
    setResumo(null)
    setConciliacao(null)
    setLinhasDivergentes([])
    try {
      const parsed = await parsePlanilhaSaldo(file)
      const sugestao = sugerirMapeamento(parsed.colunas)
      setParse(parsed)
      setMapa(sugestao)
      setFileName(file.name)
      toast({
        title: 'Planilha lida com sucesso',
        description: `${parsed.totalLinhas} linha(s) na aba "${parsed.nomeAba}". Confirme o mapeamento das colunas.`,
      })
    } catch (err) {
      console.error('Erro ao ler planilha:', err)
      toast({
        title: 'Erro ao ler planilha',
        description: getErrorMessage(err) || 'Formato de arquivo não reconhecido.',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  // ------------------------------------------------------------------
  // Importação: upsert por spincare_id em spincare_saldo_estoque
  // ------------------------------------------------------------------
  const handleImportar = async () => {
    if (!parse || !mapa) return
    setImportando(true)
    setProgresso(0)
    setResumo(null)
    setConciliacao(null)
    setLinhasDivergentes([])

    const linhas = mapearLinhas(parse, mapa)
    const resumoLocal: ResumoImport = {
      totalLinhas: linhas.length,
      novos: 0,
      atualizados: 0,
      ignorados: 0,
      motivosIgnorados: [],
    }

    try {
      // Índice de registros existentes por spincare_id (upsert em memória).
      const existentes = new Map<number, { id: string; imported_at: string }>()
      try {
        const recs = await pb
          .collection(COLECAO_SALDO)
          .getFullList<{ id: string; spincare_id: number; imported_at: string }>({
            fields: 'id,spincare_id,imported_at',
            requestKey: null,
          })
        for (const r of recs)
          existentes.set(r.spincare_id, { id: r.id, imported_at: r.imported_at })
      } catch {
        // Coleção ainda vazia ou sem permissão — segue como importação inicial.
      }

      const agora = new Date().toISOString()
      const batch: Array<Promise<unknown>> = []
      const BATCH = 20
      for (const linha of linhas) {
        const existente = linha.spincare_id !== null ? existentes.get(linha.spincare_id) : undefined
        if (existente) {
          batch.push(
            pb
              .collection(COLECAO_SALDO)
              .update(existente.id, {
                code: linha.code,
                description: linha.description,
                saldo: linha.saldo ?? 0,
                custo_medio_report: linha.custo_medio_report ?? 0,
                raw_json: linha.raw,
                imported_at: agora,
              })
              .then(() => {
                resumoLocal.atualizados++
              }),
          )
        } else {
          batch.push(
            pb
              .collection(COLECAO_SALDO)
              .create({
                spincare_id: linha.spincare_id ?? 0,
                code: linha.code,
                description: linha.description,
                saldo: linha.saldo ?? 0,
                custo_medio_report: linha.custo_medio_report ?? 0,
                raw_json: linha.raw,
                imported_at: agora,
              })
              .then(() => {
                resumoLocal.novos++
              }),
          )
        }
        if (batch.length >= BATCH) {
          await Promise.allSettled(batch)
          batch.length = 0
        }
        setProgresso(
          Math.round(
            ((resumoLocal.novos + resumoLocal.atualizados + resumoLocal.ignorados) /
              Math.max(linhas.length, 1)) *
              100,
          ),
        )
      }
      if (batch.length) await Promise.allSettled(batch)

      // Conta ignorados: linhas de dados que não puderam ser gravadas (sem id e sem código).
      resumoLocal.ignorados =
        resumoLocal.totalLinhas - (resumoLocal.novos + resumoLocal.atualizados)

      setResumo(resumoLocal)
      toast({
        title: 'Importação concluída',
        description: `${resumoLocal.totalLinhas} linha(s): ${resumoLocal.novos} novo(s), ${resumoLocal.atualizados} atualizado(s), ${resumoLocal.ignorados} ignorado(s).`,
      })

      await conciliar(linhas)
    } catch (err) {
      console.error('Erro na importação:', err)
      toast({
        title: 'Erro na importação',
        description: getErrorMessage(err) || 'Falha ao gravar as linhas do relatório.',
        variant: 'destructive',
      })
    } finally {
      setImportando(false)
      setProgresso(100)
    }
  }

  // ------------------------------------------------------------------
  // Conciliação: relatório × produtos_spincare (por spincare_id)
  // ------------------------------------------------------------------
  const conciliar = async (linhas: LinhaMapeada[]) => {
    try {
      const produtos = await pb
        .collection(COLECAO_PRODUTOS)
        .getFullList<ProdutoComFonte>({ requestKey: null })

      const porId = new Map<number, ProdutoComFonte>()
      const porCode = new Map<string, ProdutoComFonte>()
      for (const p of produtos) {
        if (p.spincare_id != null) porId.set(Number(p.spincare_id), p)
        if (p.code) porCode.set(String(p.code).trim(), p)
      }

      const resultado: RelatorioConciliacao = {
        convergem: 0,
        divergem: 0,
        naoEncontrados: 0,
        semCustoRelatorio: [],
        divergencias: [],
      }
      const divergentes: LinhaDivergencia[] = []

      for (const linha of linhas) {
        const produto =
          (linha.spincare_id !== null ? porId.get(linha.spincare_id) : undefined) ||
          (linha.code ? porCode.get(linha.code) : undefined)
        if (!produto) {
          resultado.naoEncontrados++
          continue
        }
        if (!linha.temCusto) {
          resultado.semCustoRelatorio.push({
            spincare_id: linha.spincare_id ?? 0,
            code: linha.code || produto.code,
            description: linha.description || produto.description,
            custoMedioBase: Number(produto.custo_medio_price || 0),
          })
          continue
        }
        const custoRelatorio = Number(linha.custo_medio_report || 0)
        const custoBase = Number(produto.custo_medio_price || 0)
        const dif = Number((custoRelatorio - custoBase).toFixed(4))
        if (Math.abs(dif) < 0.005) {
          resultado.convergem++
        } else {
          resultado.divergem++
          resultado.divergencias.push({
            spincare_id: linha.spincare_id ?? 0,
            code: produto.code,
            description: produto.description,
            custoMedioRelatorio: custoRelatorio,
            custoMedioBase: custoBase,
            diferenca: dif,
            fontePrecoBase: produto.fonte_preco || '—',
          })
          divergentes.push({ produto, relatorio: linha })
        }
      }

      resultado.divergencias.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
      setConciliacao(resultado)
      setLinhasDivergentes(divergentes)
    } catch (err) {
      console.error('Erro na conciliação:', err)
      toast({
        title: 'Erro na conciliação',
        description: getErrorMessage(err) || 'Falha ao comparar com produtos_spincare.',
        variant: 'destructive',
      })
    }
  }

  // ------------------------------------------------------------------
  // Aplicar valores do relatório (admin-only, com confirmação)
  // ------------------------------------------------------------------
  const handleAplicar = async () => {
    if (!isAdmin || !conciliacao) return
    setConfirmarDialog(false)
    setAplicando(true)
    let atualizados = 0
    let preservados = 0
    try {
      const batch: Array<Promise<unknown>> = []
      for (const { produto, relatorio } of linhasDivergentes) {
        const custoNovo = Number(relatorio.custo_medio_report || 0)
        // Guard anti-zero: NUNCA gravar 0 por cima de valor válido.
        if (!custoNovo || custoNovo <= 0) {
          preservados++
          continue
        }
        batch.push(
          pb
            .collection(COLECAO_PRODUTOS)
            .update(produto.id, {
              custo_medio_price: custoNovo,
              fonte_preco: 'relatorio_spincare',
            })
            .then(() => {
              atualizados++
            }),
        )
        if (batch.length >= 20) {
          await Promise.allSettled(batch)
          batch.length = 0
        }
      }
      if (batch.length) await Promise.allSettled(batch)

      try {
        await pb.collection(COLECAO_AUDIT).create({
          colecao: COLECAO_PRODUTOS,
          registro_id: 'conciliacao_relatorio_saldo',
          acao: 'APLICA_RELATORIO_SALDO',
          usuario: isAdmin ? (pb.authStore.record?.id ?? '') : '',
          usuario_nome: pb.authStore.record?.name || pb.authStore.record?.email || '',
          usuario_email: pb.authStore.record?.email || '',
          usuario_role: pb.authStore.record?.role || 'admin',
          status_anterior: `${linhasDivergentes.length} divergente(s)`,
          status_novo: `${atualizados} atualizado(s)`,
          detalhes:
            `Relatório Saldo Estoque Analítico aplicado. Atualizados: ${atualizados}; ` +
            `preservados (relatório sem custo): ${preservados}.` +
            (fileName ? ` Arquivo: ${fileName}.` : ''),
        })
      } catch (auditErr) {
        console.warn('Falha ao gravar audit_logs (não bloqueia a ação):', auditErr)
      }

      setResultDialog({ atualizados, preservados })
      toast({
        title: 'Valores aplicados',
        description: `${atualizados} produto(s) atualizado(s) com o custo médio do relatório.`,
      })
      // Recarrega conciliação para refletir o novo estado.
      if (parse && mapa) {
        await conciliar(mapearLinhas(parse, mapa))
      }
    } catch (err) {
      console.error('Erro ao aplicar valores:', err)
      toast({
        title: 'Erro ao aplicar',
        description: getErrorMessage(err) || 'Falha ao atualizar produtos_spincare.',
        variant: 'destructive',
      })
    } finally {
      setAplicando(false)
    }
  }

  const divergentesFiltrados = useMemo(() => {
    if (!conciliacao) return []
    const q = busca.trim().toLowerCase()
    if (!q) return conciliacao.divergencias
    return conciliacao.divergencias.filter(
      (d) =>
        d.description.toLowerCase().includes(q) ||
        String(d.code).toLowerCase().includes(q) ||
        String(d.spincare_id).includes(q),
    )
  }, [conciliacao, busca])

  // Bloqueio de acesso para não-admins (padrão Relatório Financeiro / Importar).
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto my-12">
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm text-center p-6 sm:p-8 rounded-2xl">
          <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl font-bold text-amber-950">Acesso Restrito</CardTitle>
          <CardDescription className="text-amber-900/80 mt-2 text-sm leading-relaxed">
            A importação do relatório de Saldo de Estoque do SpinCare é exclusiva para usuários com
            perfil <strong className="text-amber-950">Administrador</strong>.
          </CardDescription>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="text-[#0D8272]" size={24} />
          Importar Relatório de Saldo de Estoque
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Conciliação do relatório oficial "Saldo de Estoque Analítico" do SpinCare com a base de
          produtos da Curva ABC (produtos_spincare).
        </p>
      </div>

      {/* ===================== 1. Upload ===================== */}
      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload size={16} className="text-[#0D8272]" /> 1. Planilha do relatório
          </CardTitle>
          <CardDescription>
            Envie o XLSX exportado do SpinCare ("Saldo de Estoque Analítico"). O parse é feito aqui
            no navegador — nada é enviado para fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => inputFileRef.current?.click()}
              disabled={parsing || importando}
              className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
            >
              <Upload size={16} className="mr-2" />
              {parsing ? 'Lendo planilha…' : 'Selecionar XLSX'}
            </Button>
            {fileName && (
              <Badge
                variant="outline"
                className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-300"
              >
                <FileSpreadsheet size={12} /> {fileName}
                <button
                  aria-label="Remover arquivo"
                  onClick={() => {
                    setFileName('')
                    setParse(null)
                    setMapa(null)
                    setResumo(null)
                    setConciliacao(null)
                  }}
                  className="ml-1 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===================== 2. Mapeamento ===================== */}
      {parse && mapa && (
        <Card className="border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale size={16} className="text-[#0D8272]" /> 2. Mapeamento de colunas
            </CardTitle>
            <CardDescription>
              Confirme qual coluna corresponde a cada campo. Auto-sugerido pelos cabeçalhos —
              editável. Preview das 10 primeiras linhas da aba "{parse.nomeAba}".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(ROTULOS_CAMPO) as CampoAlvo[]).map((campo) => (
                <div key={campo} className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">
                    {ROTULOS_CAMPO[campo]}
                  </Label>
                  <Select
                    value={mapa[campo] !== null ? String(mapa[campo]) : 'none'}
                    onValueChange={(v) =>
                      setMapa((prev) => {
                        if (!prev) return prev
                        return { ...prev, [campo]: v === 'none' ? null : Number(v) }
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar coluna…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhuma —</SelectItem>
                      {parse.colunas.map((c) => (
                        <SelectItem key={c.indice} value={String(c.indice)}>
                          {c.cabecalho}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {parse.colunas.map((c) => (
                      <th
                        key={c.indice}
                        className={`px-2.5 py-2 text-left font-semibold whitespace-nowrap ${
                          Object.values(mapa).includes(c.indice)
                            ? 'text-[#0D8272]'
                            : 'text-slate-500'
                        }`}
                      >
                        {c.cabecalho}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parse.preview.map((linha) => (
                    <tr key={linha.linha} className="border-b border-slate-100 last:border-0">
                      {linha.celulas.map((cel, ci) => (
                        <td
                          key={ci}
                          className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap max-w-[240px] truncate"
                        >
                          {cel || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleImportar}
                disabled={importando || mapa.code === null || mapa.custo_medio === null}
                className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
              >
                <Download size={16} className="mr-2" />
                {importando ? `Importando… ${progresso}%` : 'Confirmar e importar'}
              </Button>
              {importando && (
                <div className="flex-1 min-w-[160px]">
                  <Progress value={progresso} className="h-2" />
                </div>
              )}
              {parse && (
                <span className="text-xs text-slate-500">
                  {parse.totalLinhas} linha(s) de dados detectadas.
                </span>
              )}
            </div>
            {(mapa.code === null || mapa.custo_medio === null) && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle size={13} /> Selecione ao menos as colunas de Código e Custo médio
                para importar.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===================== 3. Resumo do import ===================== */}
      {resumo && (
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-900">
              <CheckCircle2 size={16} /> 3. Resumo da importação
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-xl bg-white border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-slate-800">{resumo.totalLinhas}</p>
              <p className="text-xs text-slate-500">Total de linhas</p>
            </div>
            <div className="rounded-xl bg-white border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-emerald-700">{resumo.novos}</p>
              <p className="text-xs text-slate-500">Novos produtos</p>
            </div>
            <div className="rounded-xl bg-white border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-blue-700">{resumo.atualizados}</p>
              <p className="text-xs text-slate-500">Atualizados</p>
            </div>
            <div className="rounded-xl bg-white border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-amber-700">{resumo.ignorados}</p>
              <p className="text-xs text-slate-500">Ignorados</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================== 4. Conciliação ===================== */}
      {conciliacao && (
        <Card className="border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale size={16} className="text-[#0D8272]" /> 4. Conciliação de custo médio
            </CardTitle>
            <CardDescription>
              Relatório (tela SpinCare) × produtos_spincare, por spincare_id.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                <p className="text-2xl font-bold text-green-700">{conciliacao.convergem}</p>
                <p className="text-xs text-slate-500">Convergem</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-2xl font-bold text-amber-700">{conciliacao.divergem}</p>
                <p className="text-xs text-slate-500">Divergem</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-2xl font-bold text-slate-600">{conciliacao.naoEncontrados}</p>
                <p className="text-xs text-slate-500">Não encontrados na base</p>
              </div>
            </div>

            {/* Sem custo no relatório */}
            {conciliacao.semCustoRelatorio.length > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600" />
                  Relatório sem custo ({conciliacao.semCustoRelatorio.length})
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Produtos com custo médio 0/vazio no relatório — o valor atual da base é preservado
                  (guard anti-zero) e NÃO são atualizados.
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
                  {conciliacao.semCustoRelatorio.slice(0, 100).map((s) => (
                    <div
                      key={s.spincare_id}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1"
                    >
                      <span className="font-mono text-slate-500">{s.spincare_id}</span>
                      <span className="flex-1 text-slate-700 truncate">{s.description}</span>
                      <span className="text-slate-500">
                        base: {formatCurrency(s.custoMedioBase)}
                      </span>
                    </div>
                  ))}
                  {conciliacao.semCustoRelatorio.length > 100 && (
                    <p className="text-slate-400 italic">
                      …e mais {conciliacao.semCustoRelatorio.length - 100} produto(s).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Divergências */}
            {conciliacao.divergem > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">
                    Produtos com divergência ({conciliacao.divergem})
                  </p>
                  <div className="relative w-64">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      placeholder="Buscar produto/código…"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-2.5 py-2 text-left font-semibold text-slate-600">ID</th>
                        <th className="px-2.5 py-2 text-left font-semibold text-slate-600">
                          Produto
                        </th>
                        <th className="px-2.5 py-2 text-right font-semibold text-slate-600">
                          C. Médio relatório
                        </th>
                        <th className="px-2.5 py-2 text-right font-semibold text-slate-600">
                          C. Médio base
                        </th>
                        <th className="px-2.5 py-2 text-right font-semibold text-slate-600">
                          Diferença
                        </th>
                        <th className="px-2.5 py-2 text-left font-semibold text-slate-600">
                          Fonte (base)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {divergentesFiltrados.map((d) => (
                        <tr
                          key={d.spincare_id}
                          className="border-b border-slate-100 hover:bg-amber-50/40"
                        >
                          <td className="px-2.5 py-1.5 font-mono text-slate-500">
                            {d.spincare_id}
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-800 max-w-[280px] truncate">
                            {d.description}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-emerald-700">
                            {formatCurrency(d.custoMedioRelatorio)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-slate-600">
                            {formatCurrency(d.custoMedioBase)}
                          </td>
                          <td
                            className={`px-2.5 py-1.5 text-right font-semibold ${
                              d.diferenca > 0 ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {d.diferenca > 0 ? '+' : ''}
                            {d.diferenca.toFixed(2)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {d.fontePrecoBase}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setConfirmarDialog(true)}
                      disabled={aplicando}
                      className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
                    >
                      <ArrowRight size={16} className="mr-2" />
                      {aplicando
                        ? 'Aplicando…'
                        : `Aplicar valores do relatório (${linhasDivergentes.length})`}
                    </Button>
                    <span className="text-xs text-slate-500">
                      Atualiza produtos_spincare.custo_medio_price com o valor do relatório e grava
                      fonte_preco='relatorio_spincare'.
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Diálogo de confirmação */}
      <Dialog open={confirmarDialog} onOpenChange={setConfirmarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar valores do relatório?</DialogTitle>
            <DialogDescription>
              {linhasDivergentes.length} produto(s) divergente(s) terão o custo médio atualizado com
              o valor do relatório oficial do SpinCare, com fonte_preco='relatorio_spincare'. A ação
              é registrada em audit_logs e pode ser refeita reimportando o relatório.{' '}
              <strong>Última compra</strong> não é alterada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmarDialog(false)}
              disabled={aplicando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAplicar}
              disabled={aplicando}
              className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
            >
              {aplicando ? 'Aplicando…' : 'Confirmar e aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de resultado */}
      <Dialog open={resultDialog !== null} onOpenChange={() => setResultDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-[#0D8272]" size={18} /> Aplicação concluída
            </DialogTitle>
            <DialogDescription>
              {resultDialog?.atualizados} produto(s) atualizado(s) com o custo médio do relatório
              (fonte_preco='relatorio_spincare').
              {resultDialog && resultDialog.preservados > 0 && (
                <>
                  {' '}
                  {resultDialog.preservados} produto(s) com relatório sem custo tiveram o valor
                  anterior preservado (guard anti-zero).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setResultDialog(null)}
              className="bg-[#0D8272] hover:bg-[#0C6B5E] text-white"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {parse?.totalLinhas && (
        <p className="text-xs text-slate-400">
          Última leitura do arquivo: {formatDateTimeIso(new Date().toISOString())} · {fileName}
        </p>
      )}
    </div>
  )
}
