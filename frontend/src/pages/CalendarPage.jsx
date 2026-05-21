import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, RefreshCw } from 'lucide-react'
import { getAppointmentsByMonth } from '../services/api'
import AppointmentModal from '../components/AppointmentModal'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const statusColor = {
  agendado:       'bg-blue-100 text-blue-700 border-blue-200',
  confirmado:     'bg-green-100 text-green-700 border-green-200',
  realizado:      'bg-gray-100 text-gray-600 border-gray-200',
  cancelado:      'bg-red-50 text-red-600 border-red-100 line-through',
  nao_compareceu: 'bg-orange-50 text-orange-600 border-orange-100',
}

const serviceLabel = {
  mega_hair:  'Mega Hair',
  manutencao: 'Manutenção',
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalState, setModalState] = useState({ open: false, appointment: null, defaultDate: null })

  async function refresh() {
    setLoading(true)
    try {
      const data = await getAppointmentsByMonth(cursor.year, cursor.month)
      setAppointments(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [cursor.year, cursor.month])

  function prevMonth() {
    setCursor(c => c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 })
  }
  function nextMonth() {
    setCursor(c => c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 })
  }

  // Monta o grid do mês
  const firstOfMonth = new Date(cursor.year, cursor.month - 1, 1)
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate()
  const startWeekday = firstOfMonth.getDay() // 0=dom

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null) // espaços vazios antes do dia 1
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Agrupa appointments por dia
  const apptByDay = {}
  for (const a of appointments) {
    const day = new Date(a.startDateTime).getDate()
    if (!apptByDay[day]) apptByDay[day] = []
    apptByDay[day].push(a)
  }

  const today = new Date()
  const isToday = (day) =>
    day === today.getDate() && cursor.month === today.getMonth() + 1 && cursor.year === today.getFullYear()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <CalIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Calendário — Mega Hair</h1>
            <p className="text-xs text-gray-500">Agendamentos de aplicação e manutenção</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-500 disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setModalState({ open: true, appointment: null, defaultDate: new Date() })}
            className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Novo agendamento
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Navegação do mês */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <h2 className="text-lg font-bold text-gray-800">
            {MONTHS[cursor.month - 1]} <span className="font-normal text-gray-400">{cursor.year}</span>
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {w}
            </div>
          ))}
        </div>

        {/* Grid de dias */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={`min-h-[110px] border-r border-b border-gray-100 p-1.5 ${
                !day ? 'bg-gray-50/50' : 'hover:bg-pink-50/30 cursor-pointer transition'
              }`}
              onClick={() => {
                if (!day) return
                const date = new Date(cursor.year, cursor.month - 1, day, 14, 0, 0)
                setModalState({ open: true, appointment: null, defaultDate: date })
              }}
            >
              {day && (
                <>
                  <div className={`text-xs font-semibold mb-1 ${
                    isToday(day) ? 'bg-pink-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-600'
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-1">
                    {(apptByDay[day] || []).slice(0, 3).map(a => {
                      const dt = new Date(a.startDateTime)
                      const hour = dt.getHours()
                      const period = hour < 12 ? 'manhã' : 'tarde'
                      const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      return (
                        <button
                          key={a.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setModalState({ open: true, appointment: a, defaultDate: null })
                          }}
                          className={`block w-full text-left text-[10px] px-1.5 py-1 rounded border ${statusColor[a.status] ?? statusColor.agendado}`}
                          title={`${a.clientName} — ${serviceLabel[a.service] ?? a.service}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-semibold">{timeStr}</span>
                            <span className="text-[8px] uppercase opacity-70">{period}</span>
                          </div>
                          <div className="truncate font-medium">{a.clientName}</div>
                          <div className="truncate text-[9px] opacity-75">
                            {serviceLabel[a.service] ?? a.service}
                            {a.clientPhone && <> · {a.clientPhone}</>}
                          </div>
                        </button>
                      )
                    })}
                    {(apptByDay[day]?.length ?? 0) > 3 && (
                      <p className="text-[9px] text-gray-400 pl-1">+{apptByDay[day].length - 3} mais</p>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-xs text-gray-400 mt-3 text-center">Carregando...</p>
      )}

      {modalState.open && (
        <AppointmentModal
          appointment={modalState.appointment}
          defaultDate={modalState.defaultDate}
          onClose={() => setModalState({ open: false, appointment: null, defaultDate: null })}
          onSaved={() => {
            setModalState({ open: false, appointment: null, defaultDate: null })
            refresh()
          }}
        />
      )}
    </div>
  )
}
