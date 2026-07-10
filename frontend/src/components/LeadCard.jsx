import { useState, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Edit2, Calendar, Clock, CheckCircle, XCircle, Send, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { updateName } from '../services/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const NO_REPLY_ACTIVE_STAGES = ['novo_lead', 'qualificando', 'lead_quente', 'lead_frio']

function getNoReplyLevel(lead) {
  if (!NO_REPLY_ACTIVE_STAGES.includes(lead.stage)) return null
  if (lead.lastMessageDirection !== 'outbound') return null
  if (!lead.lastMessageAt) return null
  const hours = (Date.now() - new Date(lead.lastMessageAt).getTime()) / (1000 * 60 * 60)
  if (hours >= 3) return 'critical'
  if (hours >= 1) return 'warning'
  return null
}

const urgencyColor = {
  alta:  'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baixa: 'bg-gray-100 text-gray-500',
}

const labelColor = {
  inativo:         'bg-red-100 text-red-600',
  desrespeitoso:   'bg-red-100 text-red-600',
  emergencia:      'bg-red-100 text-red-600',
  'fora-de-escopo': 'bg-blue-100 text-blue-600',
  boleto:          'bg-purple-100 text-purple-700',
}

const labelIcon = {
  inativo:         '🚫',
  desrespeitoso:   '⛔',
  emergencia:      '🚨',
  'fora-de-escopo': '📵',
  boleto:          '🧾',
}

const tempBadge = {
  quente: '🔥',
  morno:  '☀️',
  frio:   '🧊',
}

const scoreColor = (score) => {
  if (score >= 70) return 'text-orange-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-slate-400'
}

const broadcastStatusBadge = {
  enviado:  { label: 'Enviado',  className: 'bg-gray-100 text-gray-600' },
  entregue: { label: 'Entregue', className: 'bg-emerald-100 text-emerald-700' },
  falhou:   { label: 'Falhou',   className: 'bg-red-100 text-red-600' },
}

export default function LeadCard({ lead, onClick, onDelete, onLeadUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(lead.name || '')
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false)
  const [cancelingCare, setCancelingCare] = useState(false)
  const [showCancelCareModal, setShowCancelCareModal] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [loadingBroadcast, setLoadingBroadcast] = useState(false)
  const [broadcastData, setBroadcastData] = useState(null)

  const hasCaregiverAssigned = (lead.labels ?? []).includes('cuidador_designado')

  async function handleOpenBroadcast() {
    setShowBroadcastModal(true)
    setLoadingBroadcast(true)
    try {
      const res = await fetch(`${API_URL}/leads/${lead.id}/care-broadcast`)
      const data = await res.json()
      setBroadcastData(data)
    } catch (err) {
      console.error('Erro ao buscar log de notificações:', err)
      setBroadcastData(null)
    } finally {
      setLoadingBroadcast(false)
    }
  }

  async function handleCancelCare() {
    setCancelingCare(true)
    setShowCancelCareModal(false)
    try {
      const res = await fetch(`${API_URL}/leads/${lead.id}/cancel-care`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) onLeadUpdate?.({ ...lead, labels: (lead.labels ?? []).filter((l) => l !== 'cuidador_designado') })
    } catch (err) {
      console.error('Erro ao cancelar atendimento:', err)
    } finally {
      setCancelingCare(false)
    }
  }

  async function handleConfirmPayment() {
    setConfirmingPayment(true)
    setShowConfirmPaymentModal(false)
    try {
      const res = await fetch(`${API_URL}/leads/${lead.id}/confirm-payment`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) onLeadUpdate?.({ ...lead, stage: 'pagamento_confirmado' })
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err)
    } finally {
      setConfirmingPayment(false)
    }
  }
  const inputRef = useRef(null)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const noReplyLevel = getNoReplyLevel(lead)

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  const cardBg = noReplyLevel === 'critical'
    ? 'bg-red-50 border-red-300 hover:border-red-400'
    : noReplyLevel === 'warning'
    ? 'bg-yellow-50 border-yellow-300 hover:border-yellow-400'
    : 'bg-white border-gray-100 hover:border-blue-200'

  async function handleSaveName() {
    if (!editName.trim()) {
      setEditName(lead.name || '')
      setIsEditing(false)
      return
    }
    try {
      const updated = await updateName(lead.id, editName.trim())
      onLeadUpdate?.(updated)
      setIsEditing(false)
    } catch (err) {
      console.error('Erro ao atualizar nome:', err)
      setEditName(lead.name || '')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSaveName()
    if (e.key === 'Escape') {
      setEditName(lead.name || '')
      setIsEditing(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-xl p-3 mb-2 shadow-sm border hover:shadow-md transition-all select-none ${cardBg}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {(lead.name || lead.phone).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full text-sm font-semibold bg-blue-50 border border-blue-300 text-gray-800 rounded px-1 py-0.5"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{lead.name || 'Sem nome'}</p>
            )}
            <p className="text-xs text-gray-400 truncate">{lead.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {lead.stage !== 'novo_lead' && (
            <span className="text-base leading-none">{tempBadge[lead.temperature]}</span>
          )}
          {!isEditing && !lead.name && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }}
              className="p-1 rounded hover:bg-blue-50 text-gray-300 hover:text-blue-400 transition-colors"
              title="Editar nome"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(lead) }}
            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
            title="Excluir lead"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Symptoms */}
      {lead.symptoms && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed">
          {lead.symptoms}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        {lead.urgency ? (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${urgencyColor[lead.urgency]}`}>
            {lead.urgency.toUpperCase()}
          </span>
        ) : <span />}

        {lead.stage === 'novo_lead' ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-400">
            Novo
          </span>
        ) : (
          <span className={`text-xs font-bold ${scoreColor(lead.qualificationScore ?? 0)}`}>
            {lead.qualificationScore ?? 0} pts
          </span>
        )}
      </div>

      {/* Etiquetas de segurança */}
      {lead.labels && lead.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {lead.labels.map((label) => (
            <span
              key={label}
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${labelColor[label] ?? 'bg-gray-100 text-gray-500'}`}
            >
              {labelIcon[label] ?? '🏷️'} {label}
            </span>
          ))}
        </div>
      )}

      {/* Botão confirmar pagamento */}
      {lead.stage === 'aguardando_pagamento' && (
        <div className="mt-2 pt-2 border-t border-amber-100">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowConfirmPaymentModal(true) }}
            disabled={confirmingPayment}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {confirmingPayment ? 'Confirmando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      )}

      {/* Botão ver notificações enviadas aos cuidadores */}
      {lead.activeFlow === 'fluxo_1' && (
        <div className="mt-2 pt-2 border-t border-blue-100">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleOpenBroadcast() }}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Ver notificações aos cuidadores
          </button>
        </div>
      )}

      {/* Botão cancelar atendimento (cuidador já designado) */}
      {hasCaregiverAssigned && (
        <div className="mt-2 pt-2 border-t border-rose-100">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowCancelCareModal(true) }}
            disabled={cancelingCare}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {cancelingCare ? 'Cancelando...' : 'Cancelar atendimento'}
          </button>
        </div>
      )}

      {/* Modal de cancelamento de atendimento */}
      {showCancelCareModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-72 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Cancelar atendimento?</h3>
                <p className="text-xs text-gray-500 mt-0.5">O cuidador de <span className="font-medium">{lead.name || lead.phone}</span> será liberado e voltará a ficar disponível na agenda para essa data.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelCareModal(false)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelCare}
                className="flex-1 py-2 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de pagamento */}
      {showConfirmPaymentModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-72 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Confirmar pagamento?</h3>
                <p className="text-xs text-gray-500 mt-0.5">A IA será reativada e enviará o formulário de matrícula para <span className="font-medium">{lead.name || lead.phone}</span>.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmPaymentModal(false)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPayment}
                className="flex-1 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do log de notificações aos cuidadores */}
      {showBroadcastModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setShowBroadcastModal(false) }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-5 w-80 max-h-[80vh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Notificações aos cuidadores</h3>
            </div>

            {loadingBroadcast ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : !broadcastData ? (
              <p className="text-xs text-gray-500">Nenhuma solicitação foi enviada aos cuidadores ainda.</p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500">
                  {broadcastData.status === 'aceito' && broadcastData.assignedCaregiverName
                    ? <>✅ Aceito por <span className="font-semibold text-gray-700">{broadcastData.assignedCaregiverName}</span></>
                    : broadcastData.status === 'expirado' ? '⚠️ Ninguém aceitou (expirado)'
                    : broadcastData.status === 'cancelado' ? '🚫 Atendimento cancelado'
                    : '⏳ Aguardando aceite'}
                </p>
                <div className="space-y-1.5">
                  {(broadcastData.broadcastLog ?? []).map((entry) => {
                    const isAssigned = broadcastData.status === 'aceito' && entry.name === broadcastData.assignedCaregiverName
                    return (
                      <div key={entry.phone} className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 ${isAssigned ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-700 truncate">
                            {isAssigned ? '✅ ' : ''}{entry.name}
                          </p>
                          <p className="text-[10px] text-gray-400">{entry.phone}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${broadcastStatusBadge[entry.status]?.className ?? 'bg-gray-100 text-gray-500'}`}>
                          {broadcastStatusBadge[entry.status]?.label ?? entry.status}
                        </span>
                      </div>
                    )
                  })}
                  {(broadcastData.broadcastLog ?? []).length === 0 && (
                    <p className="text-xs text-gray-400">Sem cuidadores notificados.</p>
                  )}
                </div>
              </>
            )}

            <button
              onClick={() => setShowBroadcastModal(false)}
              className="w-full py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Alerta sem resposta */}
      {noReplyLevel && (
        <div className={`mt-2 pt-2 border-t ${noReplyLevel === 'critical' ? 'border-red-200' : 'border-yellow-200'}`}>
          <p className={`text-[10px] font-semibold flex items-center gap-1 ${noReplyLevel === 'critical' ? 'text-red-600' : 'text-yellow-700'}`}>
            <Clock className="w-3 h-3" />
            {noReplyLevel === 'critical' ? 'Sem resposta há 3h+' : 'Sem resposta há 1h+'}
          </p>
        </div>
      )}

      {/* Last message timestamp */}
      {lead.lastMessageAt && !noReplyLevel && (
        <div className={`${lead.stage === 'agendado' ? '' : 'mt-2 pt-2 border-t border-gray-50'}`}>
          <p className="text-[10px] text-gray-300 mt-1">
            🕐 {new Date(lead.lastMessageAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
