import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { Wifi, Users, Flame, CalendarCheck } from 'lucide-react'

import { COLUMNS } from '../data/mockData'
import { useLeads } from '../hooks/useLeads'
import { updateStage, deleteLead } from '../services/api'
import KanbanColumn from '../components/KanbanColumn'
import LeadCard from '../components/LeadCard'
import LeadModal from '../components/LeadModal'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'

export default function KanbanPage() {
  const { leads, setLeads, loading } = useLeads()
  const [activeId, setActiveId] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [leadToDelete, setLeadToDelete] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeLead = leads.find(l => l.id === activeId)

  function handleDragStart({ active }) {
    setActiveId(active.id)
  }

  async function handleDeleteConfirmed(reason) {
    if (!leadToDelete) return
    const id = leadToDelete.id
    setLeads(prev => prev.filter(l => l.id !== id))
    setLeadToDelete(null)
    await deleteLead(id, reason)
  }

  function handleLeadUpdate(updatedLead) {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l))
    if (selectedLead?.id === updatedLead.id) {
      setSelectedLead(updatedLead)
    }
  }

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const columnIds = COLUMNS.map(c => c.id)
    if (!columnIds.includes(over.id)) return
    const lead = leads.find(l => l.id === active.id)
    if (!lead || lead.stage === over.id) return

    // Otimista: atualiza localmente antes da resposta
    setLeads(prev => prev.map(l => l.id === active.id ? { ...l, stage: over.id } : l))
    await updateStage(active.id, over.id)
  }

  const total   = leads.length
  const quentes = leads.filter(l => l.temperature === 'quente').length
  const agend   = leads.filter(l => l.stage === 'agendado').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Carregando leads...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Stats Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="px-6 py-3">
          <div className="flex items-center gap-6">
            <Stat icon={<Wifi className="w-3.5 h-3.5 text-green-500" />} label="WhatsApp" value="Conectado" valueClass="text-green-600" />
            <Stat icon={<Users className="w-3.5 h-3.5 text-blue-500" />} label="Total de leads" value={total} />
            <Stat icon={<Flame className="w-3.5 h-3.5 text-orange-500" />} label="Quentes" value={quentes} valueClass="text-orange-600" />
            <Stat icon={<CalendarCheck className="w-3.5 h-3.5 text-teal-500" />} label="Agendados" value={agend} valueClass="text-teal-600" />
          </div>
        </div>
      </header>

      {/* Kanban area */}
      <main className="flex-1 overflow-x-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 min-w-max pb-4">
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.id}
                column={col}
                leads={leads.filter(l => l.stage === col.id)}
                onCardClick={setSelectedLead}
                onCardDelete={setLeadToDelete}
                onLeadUpdate={handleLeadUpdate}
              />
            ))}
          </div>

          {/* Drag overlay — card ghost while dragging */}
          <DragOverlay dropAnimation={null}>
            {activeLead ? (
              <div className="rotate-2 opacity-90 w-60">
                <LeadCard lead={activeLead} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {leadToDelete && (
        <ConfirmDeleteModal
          lead={leadToDelete}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setLeadToDelete(null)}
        />
      )}
    </div>
  )
}

function Stat({ icon, label, value, valueClass = 'text-gray-800' }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-gray-400">{label}:</span>
      <span className={`text-xs font-bold ${valueClass}`}>{value}</span>
    </div>
  )
}
