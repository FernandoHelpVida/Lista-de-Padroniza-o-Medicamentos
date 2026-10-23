import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShieldCheck, FileText, CheckCircle2 } from 'lucide-react'

interface PoliticaPrivacidadeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PoliticaPrivacidadeModal({ open, onOpenChange }: PoliticaPrivacidadeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 rounded-2xl bg-white">
        <DialogHeader className="pb-3 border-b border-emerald-950/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#E6F5F2] text-[#0D8272]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-[#0C4336]">
                Aviso de Privacidade & Tratamento de Dados (LGPD)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018) — Help Vida
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 text-xs text-slate-700 space-y-4 py-3 leading-relaxed">
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#E6F5F2] border border-[#0D8272]/30 text-[#0C4336]">
              <p className="font-semibold text-xs">
                Compromisso Help Vida com a Segurança dos Dados dos Profissionais e Pacientes
              </p>
              <p className="text-[11px] mt-1 text-[#0C4336]/90">
                A Help Vida (Atenção Domiciliar & Cuidados Especiais, Cuiabá/MT) zela pelo sigilo,
                segurança e estrito cumprimento da LGPD no uso do Catálogo e Padronização de
                Medicamentos.
              </p>
            </div>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                1. Quais dados pessoais são coletados?
              </h4>
              <p>
                • <strong>Dados Cadastrais do Profissional:</strong> Nome completo, e-mail
                institucional, perfil de acesso (administrador ou corpo clínico) e registros de data
                de acesso/criação.
              </p>
              <p>
                •{' '}
                <strong>Dados Clínicos e de Saúde (Dados Sensíveis - Art. 5º, II da LGPD):</strong>{' '}
                Quando um médico solicita medicamento não padronizado, é coletada a justificativa
                clínica, que pode conter informações sobre quadro patológico, dosagens ou histórico
                terapêutico necessário para a avaliação da Comissão de Farmácia e Terapêutica da
                Help Vida.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                2. Finalidade do Tratamento
              </h4>
              <p>Os dados são tratados exclusivamente para viabilizar:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>Gestão e governança da padronização de medicamentos institucionais;</li>
                <li>
                  Avaliação clínica fundamentada de solicitações de medicamentos não padronizados
                  pela Comissão Técnica;
                </li>
                <li>
                  Auditoria assistencial, rastreabilidade técnica e comunicação entre farmácia e
                  corpo clínico;
                </li>
                <li>Segurança e autenticação de profissionais autorizados no sistema Help Vida;</li>
                <li>
                  <strong>Consulta ao vivo via Middleware SpinCare:</strong> visualização em tempo
                  real de cadastros e orçamentos aprovados pelo corpo clínico e administradores para
                  a tutela da saúde em atenção domiciliar, sem persistência ou replicação de dados
                  no banco local, com registro auditável de cada consulta realizada (perfil Médico
                  Visitador não tem acesso a dados de pacientes).
                </li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                3. Base Legal (LGPD)
              </h4>
              <p>O tratamento de dados pessoais comuns e sensíveis apoia-se no:</p>
              <p>
                • <strong>Art. 7º, I e Art. 11, I da LGPD:</strong> Consentimento do titular
                manifestado no cadastro institucional;
              </p>
              <p>
                • <strong>Art. 11, II, "f" da LGPD:</strong> Tutela da saúde, exclusivamente, em
                procedimento realizado por profissionais de saúde, serviços de saúde ou autoridade
                sanitária;
              </p>
              <p>
                • <strong>Art. 7º, II e Art. 11, II, "a":</strong> Cumprimento de obrigação legal ou
                regulatória pelos serviços de farmácia hospitalar e home care.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                4. Princípio da Minimização e Sigilo
              </h4>
              <p>A Help Vida limita o acesso a cada dado estritamente a quem necessita dele:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>
                  A lista de usuários da equipe só é visível para administradores da comissão;
                </li>
                <li>
                  As justificativas clínicas são acessíveis exclusivamente ao profissional
                  solicitante e à Comissão Técnica avaliadora;
                </li>
                <li>
                  Não há compartilhamento com terceiros nem uso para fins comerciais ou
                  publicitários.
                </li>
              </ul>
            </section>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                5. Retenção e Descarte
              </h4>
              <p>
                Os dados são armazenados pelo período necessário para atender às diretrizes
                sanitárias (Resoluções CFM e CFF para guarda de prontuários e registros de farmácia
                clínica). Ao término do ciclo ou após solicitação do titular, os dados pessoais que
                não demandem guarda legal são eliminados com segurança.
              </p>
            </section>

            <section className="space-y-1.5">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0D8272]" />
                6. Direitos do Titular (Art. 18 da LGPD)
              </h4>
              <p>O profissional cadastrado possui a qualquer momento os direitos de:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                <li>Confirmação da existência de tratamento e acesso aos dados;</li>
                <li>Correção de dados incompletos ou inexatos diretamente em seu Perfil;</li>
                <li>
                  Exportação e portabilidade de suas solicitações e registros em formato aberto;
                </li>
                <li>
                  Eliminação e revogação do consentimento, mediante o botão de exclusão de conta em
                  Configurações ou contato com o Encarregado de Dados.
                </li>
              </ul>
            </section>

            <section className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 space-y-1">
              <p className="font-bold text-slate-800 text-[11px]">
                Encarregado pelo Tratamento de Dados Pessoais (DPO Help Vida):
              </p>
              <p className="text-[11px]">
                Encarregado de dados (DPO): <strong>Senhor Fernando Fernandes</strong>
              </p>
              <p className="text-[11px]">
                E-mail de contato:{' '}
                <a
                  href="mailto:dpo@helpvida.com.br"
                  className="font-semibold text-[#0D8272] underline hover:text-[#0C4336]"
                >
                  dpo@helpvida.com.br
                </a>
              </p>
              <p className="text-[11px]">
                Endereço: Rua das Camélias, 381 – Jardim Cuiabá, Cuiabá/MT | Telefone: (65)
                3611-1300
              </p>
            </section>
          </div>
        </ScrollArea>

        <div className="pt-3 border-t border-emerald-950/10 flex justify-end shrink-0">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-[#0F5342] hover:bg-[#0C4336] text-white text-xs font-bold rounded-xl h-9 px-4"
          >
            Entendido e Ciente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
