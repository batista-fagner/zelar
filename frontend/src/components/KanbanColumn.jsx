import { useDroppable } from '@dnd-kit/core'
import LeadCard from './LeadCard'

export default function KanbanColumn({ column, leads, onCardClick, onCardDelete, onLeadUpdate }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex flex-col w-60 shrink-0">
      {/* Column header */}
      <div className={`${column.bg} rounded-t-xl px-3 py-2.5 flex items-center justify-between`}>
        <span className="text-white text-sm font-semibold">
          {column.emoji} {column.label}
        </span>
        <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[520px] p-2 rounded-b-xl transition-colors duration-150 ${
          isOver
            ? `${column.light} border-2 border-dashed ${column.border}`
            : 'bg-gray-100/80'
        }`}
      >
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onClick={() => onCardClick(lead)}
            onDelete={onCardDelete}
            onLeadUpdate={onLeadUpdate}
          />
        ))}

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-24 text-gray-300 text-xs">
            Arraste um lead aqui
          </div>
        )}
      </div>
    </div>
  )
}
