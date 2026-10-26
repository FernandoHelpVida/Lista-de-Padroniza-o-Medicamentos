import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { FileQuestion, Pill, Send, Loader2, ShieldCheck, AlertTriangle, Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import type { MedicamentoRecord } from '@/pages/Index'

interface NovaSolicitacaoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  /**
   * Se informado, é uma solicitação para um medicamento JÁ catalogado como Não Padronizado.
   * Se nulo/indefinido, é um medicamento NOVO cadastrado livremente pelo médico.
   */
  medicamentoExistente?: MedicamentoRecord | null
  nomePreenchido?: string
}

export function NovaSolicitacaoModal({
  open,
  onOpenChange,
  onSuccess,
  medicamentoExistente,
  nomePreenchido = '',
}: NovaSolicitacaoModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [nomeMedicamento, setNomeMedicamento] = useState(nomePreenchido)
  const [classeTerapeutica, setClasseTerapeutica] = useState('')
  const [apresentacao, setApresentacao] = useState('')
  const [dadosPaciente, setDadosPaciente] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Atualizar quando o modal abrir com nome sugerido
  React.useEffect(() => {
    if (open) {
      if (medicamentoExistente) {
        setNomeMedicamento(medicamentoExistente.nome)
        setClasseTerapeutica(medicamentoExistente.classe || '')
      } else if (nomePreenchido) {
        setNomeMedicamento(nomePreenchido)
      } else {
        setNomeMedicamento('')
      }
      setApresentacao('')
      setDadosPaciente('')
      setJustificativa('')
    }
  }, [open, medicamentoExistente, nomePreenchido])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast({
        title: 'Sessão expirada',
        description: 'Faça login novamente para registrar a solicitação.',
        variant: 'destructive',
      })
      return
    }

    const nomeFinal = (medicamentoExistente ? medicamentoExistente.nome : nomeMedicamento).trim()
    const justFinal = justificativa.trim()

    if (!nomeFinal) {
      toast({
        title: 'Nome do medicamento obrigatório',
        description: 'Informe a grafia exata do medicamento solicitado.',
        variant: 'destructive',
      })
      return
    }

    if (!justFinal) {
      toast({
        title: 'Justificativa clínica obrigatória',
        description:
          'A comissão técnica da Help Vida exige justificativa clínica fundamentada para análise de medicamentos não padronizados.',
        variant: 'destructive',
      })
      return
    }

    setEnviando(true)
    try {
      const payload: Record<string, unknown> = {
        solicitante: user.id,
        justificativa: justFinal,
        status: 'Pendente',
      }

      if (medicamentoExistente) {
        payload.medicamento = medicamentoExistente.id
      } else {
        payload.nome_medicamento_novo = nomeFinal
        payload.classe_terapeutica = classeTerapeutica.trim()
        payload.apresentacao = apresentacao.trim()
      }

      if (dadosPaciente.trim()) {
        payload.dados_paciente = dadosPaciente.trim()
      }

      await pb.collection('solicitacoes').create(payload)

      toast({
        title: 'Solicitação cadastrada com sucesso!',
        description: `O medicamento "${nomeFinal}" foi submetido para aprovação da farmacêutica clínica.`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      console.error('Erro ao submeter solicitação:', err)
      toast({
        title: 'Erro ao cadastrar solicitação',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-5 sm:p-6 rounded-2xl bg-white max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336] flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-[#0D8272]" />
              {medicamentoExistente
                ? 'Solicitar Medicamento Não Padronizado'
                : 'Cadastrar Solicitação de Medicamento Não Padronizado'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              {medicamentoExistente
                ? 'Este item já consta no catálogo como não padronizado e passará para avaliação técnica.'
                : 'Quando o medicamento não existir no catálogo, informe os dados abaixo para aprovação pela Farmácia Clínica.'}
            </DialogDescription>
          </DialogHeader>

          {/* Banner informativo de fluxo institucional */}
          <div className="p-3 rounded-xl bg-[#FEF8EC] border border-[#F5B31C]/40 text-xs text-[#92400E] flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-[#F5B31C] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="block font-bold">Fluxo da Farmácia Clínica Help Vida</strong>
              <span>
                A solicitação entrará com status <strong>Pendente de aprovação</strong> e será
                avaliada pela farmacêutica clínica antes da dispensação.
              </span>
            </div>
          </div>

          {/* Nome do Medicamento */}
          <div className="space-y-1.5">
            <Label htmlFor="nomeMed" className="text-xs font-bold text-slate-700">
              Nome do Medicamento (Grafia exata) *
            </Label>
            {medicamentoExistente ? (
              <div className="p-3 bg-[#F4FAF8] border border-emerald-950/15 rounded-xl text-xs font-bold text-[#0C4336] flex items-center gap-2">
                <Pill size={15} className="text-[#0D8272]" />
                <span>{medicamentoExistente.nome}</span>
              </div>
            ) : (
              <Input
                id="nomeMed"
                placeholder="Ex: TIXAGEVIMABE + CILGAVIMABE 150MG"
                value={nomeMedicamento}
                onChange={(e) => setNomeMedicamento(e.target.value)}
                required
                className="h-10 text-xs sm:text-sm font-medium focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
              />
            )}
          </div>

          {/* Se for novo, exibir Classe e Apresentação */}
          {!medicamentoExistente && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="classeMed" className="text-xs font-bold text-slate-700">
                  Classe Terapêutica (se souber)
                </Label>
                <Input
                  id="classeMed"
                  placeholder="Ex: Antiviral / Anticorpo Monoclonal"
                  value={classeTerapeutica}
                  onChange={(e) => setClasseTerapeutica(e.target.value)}
                  className="h-10 text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apresentacaoMed" className="text-xs font-bold text-slate-700">
                  Apresentação / Concentração
                </Label>
                <Input
                  id="apresentacaoMed"
                  placeholder="Ex: Frasco-ampola 150mg/1,5ml"
                  value={apresentacao}
                  onChange={(e) => setApresentacao(e.target.value)}
                  className="h-10 text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Dados do Paciente (LGPD Minimização) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="dadosPaciente" className="text-xs font-bold text-slate-700">
                Identificação Mínima do Paciente
              </Label>
              <span className="text-[10px] text-emerald-800 font-semibold flex items-center gap-1">
                <ShieldCheck size={11} className="text-[#0D8272]" />
                LGPD: Apenas dados mínimos
              </span>
            </div>
            <Input
              id="dadosPaciente"
              placeholder="Ex: M.S.O., 67 anos (apenas iniciais/idade, nunca CPF ou prontuário)"
              value={dadosPaciente}
              onChange={(e) => setDadosPaciente(e.target.value)}
              className="h-10 text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl"
            />
            <p className="text-[10.5px] text-slate-500 leading-tight">
              Para conformidade com a LGPD, nunca registre nome completo, CPF ou dados bancários do
              paciente.
            </p>
          </div>

          {/* Justificativa Clínica Obrigatória */}
          <div className="space-y-1.5">
            <Label htmlFor="justificativaClinica" className="text-xs font-bold text-slate-700">
              Justificativa Clínica Fundamentada *
            </Label>
            <Textarea
              id="justificativaClinica"
              placeholder="Descreva a indicação clínica do paciente, falha ou inadequação de opções já padronizadas pela Help Vida, via de administração, posologia proposta e tempo estimado de uso..."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              required
              rows={4}
              className="text-xs focus-visible:ring-[#0D8272] bg-[#F4FAF8] border-emerald-950/15 rounded-xl leading-relaxed"
            />
            <div className="p-2.5 rounded-lg bg-[#E6F5F2] border border-[#0D8272]/20 text-[11px] text-[#0C4336] flex items-center gap-2">
              <Info size={14} className="text-[#0D8272] shrink-0" />
              <span>
                A justificativa será lida pela Farmacêutica Clínica e pela Comissão Técnica para
                parecer e aprovação.
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 min-h-[40px]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={enviando || !justificativa.trim()}
              className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs h-10 min-h-[40px] font-bold rounded-xl shadow-xs"
            >
              {enviando ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Registrando Solicitação...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-3.5 w-3.5 text-[#F5B31C]" />
                  Enviar para Aprovação
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
