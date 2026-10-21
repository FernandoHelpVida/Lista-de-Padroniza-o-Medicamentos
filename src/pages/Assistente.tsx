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
    <div className="flex flex-col h-[calc(100vh-8.5rem)] max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 1. HEADER DO CHAT */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Assistente da Farmácia
              </h2>
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-100/70 px-2 py-0.2 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Agente Nativo Help Vida
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Política de Padronização ANEXO I & Justificativas Médicas
            </p>
          </div>
        </div>

        <Button
          onClick={handleClearChat}
          variant="ghost"
          size="sm"
          className="text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 h-8 px-2.5"
          title="Limpar histórico da conversa"
        >
          <Trash2 size={14} className="mr-1.5" />
          Limpar Conversa
        </Button>
      </div>

      {/* 2. LISTA DE MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F8FAFC]/50">
        {/* Aviso de escopo seguro */}
        <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-teal-900 text-xs flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
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
                'flex gap-3 max-w-[85%] sm:max-w-[78%]',
                isUser ? 'ml-auto flex-row-reverse' : 'mr-auto',
              )}
            >
              {/* Avatar */}
              <Avatar
                className={cn(
                  'h-8 w-8 rounded-xl shrink-0 text-xs font-bold shadow-xs',
                  isUser ? 'bg-slate-800 text-white' : 'bg-teal-600 text-white',
                )}
              >
                <AvatarFallback>{isUser ? userInitials : <Bot size={16} />}</AvatarFallback>
              </Avatar>

              {/* Balão da Mensagem */}
              <div className="space-y-1.5">
                <div
                  className={cn(
                    'p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-xs',
                    isUser
                      ? 'bg-teal-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none',
                  )}
                >
                  {msg.content ? (
                    msg.content
                  ) : (
                    <span className="flex items-center gap-2 text-slate-400 italic">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                      Assistente digitando...
                    </span>
                  )}
                </div>

                {/* Citações / Fontes (se houver) */}
                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div className="pl-1 pt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-semibold text-teal-700">
                      <BookOpen size={11} /> Fonte institucional:
                    </span>
                    {msg.citations.map((cite, i) => (
                      <span
                        key={i}
                        className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] border border-slate-200"
                        title={cite.excerpt}
                      >
                        ANEXO I Padronização [{cite.n || i + 1}]
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

      {/* 3. CHIPS DE SUGESTÃO */}
      <div className="px-4 py-2 border-t border-slate-100 bg-white shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Sparkles size={11} className="text-teal-600" /> Sugestões:
          </span>
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 transition border border-slate-200/70"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* 4. INPUT DE MENSAGEM */}
      <div className="p-3 sm:p-4 border-t border-slate-200 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center gap-2"
        >
          <Input
            type="text"
            placeholder="Pergunte sobre padronização, medicamentos ou justificativas..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="h-11 text-xs sm:text-sm bg-slate-50 border-slate-200 rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          <Button
            type="submit"
            disabled={loading || !inputMessage.trim()}
            className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  )
}
