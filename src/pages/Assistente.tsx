import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { streamAgentChat, type AgentCitation } from '@/lib/skipAi'
import pb from '@/lib/pocketbase/client'
import {
  Send,
  Trash2,
  Bot,
  User,
  Sparkles,
  ExternalLink,
  Loader2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Search,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AgentCitation[]
  created: string
}

export default function Assistente() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Olá! Sou o Assistente da Farmácia Help Vida. Posso tirar suas dúvidas sobre medicamentos padronizados, classes terapêuticas, status no catálogo e as regras para solicitação de não padronizados. Como posso te ajudar hoje?',
      created: new Date().toISOString(),
    },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const suggestedPrompts = [
    'Quais medicamentos são padronizados para dor?',
    'O que precisa para solicitar um medicamento não padronizado?',
    'Liste os anti-hipertensivos padronizados',
    'A morfina está padronizada na Help Vida?',
  ]

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim()
    if (!text || loading) return

    const userMsgId = `user-${Date.now()}`
    const assistantMsgId = `assistant-${Date.now()}`

    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: text,
        created: new Date().toISOString(),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        created: new Date().toISOString(),
      },
    ]

    setMessages(newMessages)
    setInputMessage('')
    setLoading(true)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/agent-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
        }),
        signal: abortController.signal,
      })

      let accumulated = ''
      let returnedCitations: AgentCitation[] | undefined

      const result = await streamAgentChat(res, {
        signal: abortController.signal,
        onChunk: (_delta, full) => {
          accumulated = full
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: full } : m)),
          )
        },
        onCitations: (cites) => {
          returnedCitations = cites
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, citations: cites } : m)),
          )
        },
      })

      const finalConvId = res.headers.get('X-Conversation-Id') || result.conversation_id
      if (finalConvId) {
        setConversationId(finalConvId)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: result.content || accumulated,
                citations: result.citations || returnedCitations,
              }
            : m,
        ),
      )
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      const errText = err instanceof Error ? err.message : 'Falha na resposta do assistente.'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Desculpe, ocorreu uma instabilidade momentânea na conexão: ${errText}. Por favor, tente novamente.`,
              }
            : m,
        ),
      )
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleClearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content:
          'Histórico reiniciado. Como posso te auxiliar com a padronização de medicamentos Help Vida?',
        created: new Date().toISOString(),
      },
    ])
    setConversationId(null)
    setLoading(false)
  }

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'EU'

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] sm:h-[calc(100vh-9rem)] max-w-4xl mx-auto bg-white rounded-2xl border border-emerald-950/10 shadow-xs overflow-hidden">
      {/* 1. HEADER DO CHAT */}
      <div className="px-3.5 sm:px-5 py-3 border-b border-emerald-950/10 bg-[#F4FAF8] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-[#0F5342] flex items-center justify-center text-white shadow-xs shrink-0">
            <Bot size={20} className="text-[#F5B31C]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs sm:text-sm font-bold text-[#0C4336] leading-tight truncate">
                Assistente Help Vida
              </h2>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#0C4336] bg-[#E6F5F2] px-2 py-0.2 rounded-full border border-[#0D8272]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F5B31C] animate-pulse" />
                Agente Nativo
              </span>
            </div>
            <p className="text-[10.5px] sm:text-[11px] text-slate-500 truncate">
              Política de Padronização & Justificativas Médicas
            </p>
          </div>
        </div>

        <Button
          onClick={handleClearChat}
          variant="ghost"
          size="sm"
          className="text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 h-8 min-h-[32px] px-2 sm:px-2.5 shrink-0"
          title="Limpar histórico da conversa"
        >
          <Trash2 size={13} className="mr-1" />
          <span className="hidden sm:inline">Limpar Conversa</span>
        </Button>
      </div>

      {/* 2. LISTA DE MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 bg-[#F4FAF8]/40">
        {/* Aviso de escopo seguro */}
        <div className="p-3 bg-[#E6F5F2] border border-[#0D8272]/20 rounded-xl text-[#0C4336] text-xs flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-[#0D8272] shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11.5px] sm:text-xs">
            <strong>Orientações de Segurança:</strong> O assistente esclarece o catálogo de
            medicamentos e a política institucional. Ele{' '}
            <strong>não prescreve dosagens clínicas</strong> — para posologia individualizada,
            consulte o farmacêutico clínico ou o médico assistente.
          </p>
        </div>

        {messages.map((msg) => {
          const isUser = msg.role === 'user'

          return (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2.5 max-w-[90%] sm:max-w-[80%]',
                isUser ? 'ml-auto flex-row-reverse' : 'mr-auto',
              )}
            >
              {/* Avatar */}
              <Avatar
                className={cn(
                  'h-7 w-7 sm:h-8 sm:w-8 rounded-xl shrink-0 text-xs font-bold shadow-xs',
                  isUser ? 'bg-[#082921] text-white' : 'bg-[#0F5342] text-white',
                )}
              >
                <AvatarFallback>
                  {isUser ? userInitials : <Bot size={15} className="text-[#F5B31C]" />}
                </AvatarFallback>
              </Avatar>

              {/* Balão da Mensagem */}
              <div className="space-y-1.5 min-w-0">
                <div
                  className={cn(
                    'p-3 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-xs',
                    isUser
                      ? 'bg-[#0F5342] text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-emerald-950/10 rounded-tl-none',
                  )}
                >
                  {msg.content ? (
                    msg.content
                  ) : (
                    <span className="flex items-center gap-2 text-slate-400 italic text-xs">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0D8272]" />
                      Assistente digitando...
                    </span>
                  )}
                </div>

                {/* Citações / Fontes (se houver) */}
                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div className="pl-1 pt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] sm:text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-bold text-[#0D8272]">
                      <BookOpen size={11} /> Fonte institucional:
                    </span>
                    {msg.citations.map((cite, i) => (
                      <span
                        key={i}
                        className="bg-[#E6F5F2] text-[#0C4336] px-2 py-0.5 rounded text-[10px] border border-[#0D8272]/20 font-medium"
                        title={cite.excerpt}
                      >
                        Catálogo Padronizado [{cite.n || i + 1}]
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. CHIPS DE SUGESTÃO (Scroll suave no celular dos médicos) */}
      <div className="px-3 sm:px-4 py-2 border-t border-emerald-950/10 bg-white shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-[10px] sm:text-[11px] font-bold text-[#0C4336] uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
            <Sparkles size={11} className="text-[#F5B31C]" /> Sugestões:
          </span>
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-[#F4FAF8] hover:bg-[#E6F5F2] hover:text-[#0C4336] text-slate-600 transition border border-emerald-950/10 active:scale-95 shrink-0 min-h-[30px]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* 4. INPUT DE MENSAGEM (Otimizado para toque e teclado virtual no mobile) */}
      <div className="p-2.5 sm:p-4 border-t border-emerald-950/10 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            placeholder="Pergunte sobre medicamentos ou justificativas..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="h-11 min-h-[44px] text-xs sm:text-sm bg-[#F4FAF8] border-emerald-900/15 rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0D8272]"
          />
          <Button
            type="submit"
            disabled={loading || !inputMessage.trim()}
            className="h-11 w-11 min-w-[44px] p-0 bg-[#0F5342] hover:bg-[#0C4336] text-white rounded-xl shadow-xs shrink-0 flex items-center justify-center"
            aria-label="Enviar mensagem"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-[#F5B31C]" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
