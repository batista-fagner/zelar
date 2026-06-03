import { useState } from 'react'
import { X, Trash2, Calendar, User, Phone, Tag, DollarSign, FileText } from 'lucide-react'
import { createAppointment, updateAppointment, deleteAppointment } from '../services/api'

const SERVICE_OPTIONS = [
  { value: 'avaliacao',       label: 'Avaliação gratuita' },
  { value: 'contratacao',     label: 'Contratação de cuidador' },
  { value: 'matricula_curso', label: 'Matrícula no curso' },
  { value: 'outro',           label: 'Outro' },
]

const STATUS_OPTIONS = [
  { value: 'agendado',       label: 'Agendado' },
  { value: 'confirmado',     label: 'Confirmado' },
  { value: 'realizado',      label: 'Realizado' },
  { value: 'cancelado',      label: 'Cancelado' },
  { value: 'nao_compareceu', label: 'Não compareceu' },
]

function toDateTimeLocal(date) {
  // Date → "YYYY-MM-DDTHH:MM" (em horário local)
  if (!date) return ''
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AppointmentModal({ appointment, defaultDate, onClose, onSaved }) {
  const isEdit = !!appointment

  const [form, setForm] = useState({
    clientName:    appointment?.clientName ?? '',
    clientPhone:   appointment?.clientPhone ?? '',
    service:       appointment?.service ?? 'avaliacao',
    value:         appointment?.value ?? '',
    status:        appointment?.status ?? 'agendado',
    startDateTime: toDateTimeLocal(appointment?.startDateTime ?? defaultDate ?? new Date()),
    notes:         appointment?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.clientName.trim() || !form.startDateTime) return
    setSaving(true)
    try {
      const payload = {
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim() || null,
        service: form.service,
        value: form.value === '' || form.value == null ? null : Number(form.value),
        status: form.status,
        startDateTime: new Date(form.startDateTime).toISOString(),
        notes: form.notes.trim() || null,
      }
      if (isEdit) {
        await updateAppointment(appointment.id, payload)
      } else {
        await createAppointment(payload)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAppointment(appointment.id)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">{isEdit ? 'Editar agendamento' : 'Novo agendamento'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Field icon={<User className="w-3.5 h-3.5" />} label="Nome da cliente">
            <input
              type="text"
              value={form.clientName}
              onChange={e => update('clientName', e.target.value)}
              placeholder="Ex: Maria Silva"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </Field>

          <Field icon={<Phone className="w-3.5 h-3.5" />} label="WhatsApp (opcional)">
            <input
              type="text"
              value={form.clientPhone}
              onChange={e => update('clientPhone', e.target.value)}
              placeholder="71999999999"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </Field>

          <Field icon={<Calendar className="w-3.5 h-3.5" />} label="Data e hora">
            <input
              type="datetime-local"
              value={form.startDateTime}
              onChange={e => update('startDateTime', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field icon={<Tag className="w-3.5 h-3.5" />} label="Serviço">
              <select
                value={form.service}
                onChange={e => update('service', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
              >
                {SERVICE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field icon={<DollarSign className="w-3.5 h-3.5" />} label="Valor (R$)">
              <input
                type="number"
                step="0.01"
                value={form.value}
                onChange={e => update('value', e.target.value)}
                placeholder="1500"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </Field>
          </div>

          <Field icon={<Tag className="w-3.5 h-3.5" />} label="Status">
            <select
              value={form.status}
              onChange={e => update('status', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field icon={<FileText className="w-3.5 h-3.5" />} label="Observações">
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              rows={3}
              placeholder="Ex: cliente preferiu vir no fim da tarde..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-600 font-medium">Confirmar?</span>
                <button onClick={handleDelete} disabled={saving} className="text-red-600 font-semibold hover:underline">Sim</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-500 hover:underline">Não</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-red-600 hover:bg-red-50 px-2 py-1 rounded transition flex items-center gap-1 text-sm"
              >
                <Trash2 className="w-4 h-4" /> Remover
              </button>
            )
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.clientName.trim() || !form.startDateTime}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition"
            >
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Agendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ icon, label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1">
        <span className="text-gray-400">{icon}</span> {label}
      </label>
      {children}
    </div>
  )
}
