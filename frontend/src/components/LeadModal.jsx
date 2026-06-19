import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { X, Bot, User, Phone, AlertCircle, Calendar, DollarSign, Clock, ChevronRight, Send, ExternalLink, Tag, FileText, Check } from 'lucide-react'
import { getConversation, getHistory, toggleAi, sendManualMessage, removeLabel, updateObservations } from '../services/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const labelColor = {
  inativo:          'bg-red-100 text-red-600 border-red-200',
  desrespeitoso:    'bg-red-100 text-red-600 border-red-200',
  emergencia:       'bg-red-100 text-red-600 border-red-200',
  'fora-de-escopo': 'bg-blue-100 text-blue-600 border-blue-200',
}
const labelIcon = {
  inativo:          '🚫',
  desrespeitoso:    '⛔',
  emergencia:       '🚨',
  'fora-de-escopo': '📵',
}

const urgencyLabel = { alta: '⚠️ Alta', media: '🟡 Média', baixa: '🟢 Baixa' }
const urgencyColor = { alta: 'text-red-600 bg-red-50', media: 'text-yellow-700 bg-yellow-50', baixa: 'text-green-700 bg-green-50' }
const tempLabel    = { quente: '🔥 Quente', morno: '☀️ Morno', frio: '🧊 Frio' }
const tempColor    = { quente: 'text-orange-600 bg-orange-50', morno: 'text-yellow-700 bg-yellow-50', frio: 'text-sky-600 bg-sky-50' }
const byLabel      = { ai: 'IA', operator: 'Operador', system: 'Sistema' }
const stageLabel   = {
  novo_lead:    'Novo Lead',
  qualificando: 'Qualificando',
  lead_quente:  'Lead Quente',
  lead_frio:    'Lead Frio',
  agendado:     'Agendado',
  convertido:   'Convertido',
  perdido:      'Perdido',
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function mapMessages(messages = []) {
  return messages.map(msg => ({
    id: msg.id,
    sender: msg.direction === 'inbound' ? 'lead' : (msg.sender === 'ai' ? 'ai' : 'operator'),
    content: msg.content,
    time: formatTime(msg.createdAt),
  }))
}

function mapHistory(history = []) {
  return history.map(h => ({
    from: h.fromStage ? (stageLabel[h.fromStage] || h.fromStage) : '—',
    to: stageLabel[h.toStage] || h.toStage,
    by: h.changedBy,
    at: formatTime(h.createdAt),
  }))
}

export default function LeadModal({ lead, onClose }) {
  const chatRef = useRef(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState([])
  const [manualText, setManualText] = useState('')
  const [sending, setSending] = useState(false)
  const [labels, setLabels] = useState(lead?.labels ?? [])
  const [observations, setObservations] = useState(lead?.observations ?? '')
  const [obsStatus, setObsStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
  const obsInitialRef = useRef(lead?.observations ?? '')

  useEffect(() => {
    if (!lead) return
    setObservations(lead.observations ?? '')
    obsInitialRef.current = lead.observations ?? ''
    setObsStatus('idle')
    getConversation(lead.id).then(conv => {
      setMessages(mapMessages(conv?.messages))
      setAiEnabled(conv?.aiEnabled ?? true)
    })
    getHistory(lead.id).then(h => setHistory(mapHistory(h)))
  }, [lead])

  // Re-busca mensagens em tempo real quando a IA ou o sistema atualiza o lead
  useEffect(() => {
    if (!lead?.id) return
    const socket = io(API_URL)
    socket.on('lead:updated', (updatedLead) => {
      if (updatedLead.id !== lead.id) return
      getConversation(lead.id).then(conv => {
        setMessages(mapMessages(conv?.messages))
        setAiEnabled(conv?.aiEnabled ?? true)
      })
    })
    return () => socket.disconnect()
  }, [lead?.id])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  async function handleRemoveLabel(label) {
    setLabels(prev => prev.filter(l => l !== label))
    try {
      await removeLabel(lead.id, label)
    } catch {
      setLabels(prev => [...prev, label])
    }
  }

  async function handleToggleAi() {
    const next = !aiEnabled
    setAiEnabled(next)
    await toggleAi(lead.id, next)
  }

  async function handleSaveObservations() {
    if (observations === obsInitialRef.current) return
    setObsStatus('saving')
    try {
      await updateObservations(lead.id, observations)
      obsInitialRef.current = observations
      setObsStatus('saved')
      setTimeout(() => setObsStatus('idle'), 2000)
    } catch {
      setObsStatus('idle')
    }
  }

  async function handleSend() {
    if (!manualText.trim() || sending) return
    const text = manualText.trim()
    const tempId = Date.now()
    // Optimistic update — aparece imediatamente
    setMessages(prev => [...prev, {
      id: tempId,
      sender: 'operator',
      content: text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      pending: true,
    }])
    setManualText('')
    setSending(true)
    try {
      await sendManualMessage(lead.phone, text)
      // Remove o flag pending após confirmação
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m))
    } catch {
      // Rollback: remove a mensagem se der erro
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setManualText(text)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!lead) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
              {(lead.name || lead.phone).charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-gray-800">{lead.name || 'Sem nome'}</h2>
              <p className="text-xs text-gray-400">{lead.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* LEFT — Qualification data */}
          <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* Score */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-orange-500 transition-all"
                      style={{ width: `${lead.qualificationScore ?? 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700">{lead.qualificationScore ?? 0} pts</span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {lead.temperature && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tempColor[lead.temperature]}`}>
                    {tempLabel[lead.temperature]}
                  </span>
                )}
                {lead.urgency && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${urgencyColor[lead.urgency]}`}>
                    {urgencyLabel[lead.urgency]}
                  </span>
                )}
              </div>

              {/* Info rows */}
              <div className="space-y-3">
                {lead.symptoms && (
                  <InfoRow icon={<AlertCircle className="w-3.5 h-3.5" />} label="Sintomas" value={lead.symptoms} />
                )}
                {lead.availability && (
                  <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Disponibilidade" value={lead.availability} />
                )}
                {lead.budget && (
                  <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Orçamento" value={lead.budget} />
                )}
                {lead.appointmentAt && (
                  <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label="Consulta agendada" value={new Date(lead.appointmentAt).toLocaleString('pt-BR')} highlight />
                )}
                {lead.calendarEventLink && (
                  <a
                    href={lead.calendarEventLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 rounded-lg text-sm font-medium transition"
                  >
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span className="flex-1">Ver no Google Calendar</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  </a>
                )}
              </div>

              {/* Etiquetas */}
              {labels.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Etiquetas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map(label => (
                      <span
                        key={label}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${labelColor[label] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}
                      >
                        {labelIcon[label] ?? '🏷️'} {label}
                        <button
                          onClick={() => handleRemoveLabel(label)}
                          className="ml-0.5 hover:opacity-70 transition-opacity"
                          title="Remover etiqueta"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">IA ativa</span>
                </div>
                <button
                  onClick={handleToggleAi}
                  className={`w-11 h-6 rounded-full transition-colors relative ${aiEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Observações */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Observações
                  </p>
                  {obsStatus === 'saving' && (
                    <span className="text-[10px] text-gray-400">salvando...</span>
                  )}
                  {obsStatus === 'saved' && (
                    <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> salvo
                    </span>
                  )}
                </div>
                <textarea
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  onBlur={handleSaveObservations}
                  placeholder="Anotações da vendedora (ex: aguardando liberação do cartão, retornar segunda...)"
                  rows={4}
                  className="w-full text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder:text-amber-400/70 text-gray-700"
                />
              </div>

              {/* Stage history */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Histórico de Stages</p>
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400">Sem histórico</p>
                ) : (
                  <div className="space-y-1.5">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="text-gray-400 font-mono">{h.at}</span>
                        <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                        <span>{h.from}</span>
                        <span className="text-gray-300">→</span>
                        <span className="font-medium text-gray-700">{h.to}</span>
                        <span className="text-gray-300 text-[10px]">({byLabel[h.by] || h.by})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — Conversation */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-xs text-gray-500 font-medium">WhatsApp — conversa ao vivo</span>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f0f2f5]">
              {messages.length === 0 && (
                <p className="text-xs text-gray-400 text-center mt-4">Nenhuma mensagem ainda</p>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender === 'lead' ? 'justify-start' : 'justify-end'} ${msg.pending ? 'opacity-60' : ''}`}>
                  {msg.sender === 'lead' && (
                    <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-xs font-bold mr-2 mt-1 shrink-0">
                      <User className="w-3 h-3" />
                    </div>
                  )}
                  <div className="max-w-[75%]">
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm shadow-sm ${
                      msg.sender === 'lead'
                        ? 'bg-white text-gray-800 rounded-tl-sm'
                        : msg.sender === 'operator'
                          ? 'bg-teal-600 text-white rounded-tr-sm'
                          : 'bg-blue-600 text-white rounded-tr-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <div className={`flex items-center gap-1 mt-0.5 ${msg.sender === 'lead' ? 'justify-start' : 'justify-end'}`}>
                      {msg.sender === 'ai' && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Bot className="w-2.5 h-2.5" /> IA
                        </span>
                      )}
                      {msg.sender === 'operator' && (
                        <span className="text-[10px] text-gray-400">Operador</span>
                      )}
                      <span className="text-[10px] text-gray-400">{msg.time}</span>
                    </div>
                  </div>
                  {(msg.sender === 'ai' || msg.sender === 'operator') && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ml-2 mt-1 shrink-0 ${msg.sender === 'operator' ? 'bg-teal-600' : 'bg-blue-600'}`}>
                      {msg.sender === 'operator'
                        ? <Phone className="w-3 h-3 text-white" />
                        : <Bot className="w-3 h-3 text-white" />
                      }
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={aiEnabled ? 'IA está respondendo automaticamente...' : 'Digite uma mensagem manual...'}
                  disabled={aiEnabled}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:text-gray-400 disabled:cursor-not-allowed transition"
                />
                <button
                  onClick={handleSend}
                  disabled={aiEnabled || !manualText.trim() || sending}
                  className="bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </button>
              </div>
              {aiEnabled && (
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Desative a IA para enviar mensagens manualmente
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, highlight }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 flex items-center gap-1 mb-0.5">
        <span className="text-gray-300">{icon}</span> {label}
      </p>
      <p className={`text-sm ${highlight ? 'font-semibold text-teal-600' : 'text-gray-700'}`}>{value}</p>
    </div>
  )
}
