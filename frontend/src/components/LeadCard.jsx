import { useState, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Edit2, Calendar, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { updateName } from '../services/api'

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
}

const labelIcon = {
  inativo:         '🚫',
  desrespeitoso:   '⛔',
  emergencia:      '🚨',
  'fora-de-escopo': '📵',
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

export default function LeadCard({ lead, onClick, onDelete, onLeadUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(lead.name || '')
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

      {/* Link pro calendário quando agendado */}
      {lead.stage === 'agendado' && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          <Link
            to="/calendar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-pink-600 hover:text-pink-700 font-semibold hover:underline"
          >
            <Calendar className="w-3 h-3" /> Ver no calendário
          </Link>
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
