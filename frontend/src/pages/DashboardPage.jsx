import { useEffect, useState } from 'react'
import { BarChart2, Users, Target, TrendingDown, CheckCircle2, Clock, RefreshCw, Flame, MessageCircle, X, Calendar, MessageSquareWarning } from 'lucide-react'
import { getDashboard } from '../services/api'

const STAGE_CONFIG = [
  { id: 'novo_lead',    label: 'Novo Lead',    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'qualificando', label: 'Qualificando', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'lead_quente',  label: 'Lead Quente',  color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'lead_frio',    label: 'Lead Frio',    color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'agendado',     label: 'Agendado',     color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'perdido',      label: 'Perdido',      color: 'bg-red-50 text-red-700 border-red-200' },
]

const PERIODS = [
  { id: '7',   label: '7 dias' },
  { id: '30',  label: '30 dias' },
  { id: '90',  label: '90 dias' },
  { id: 'all', label: 'Total' },
]

const STAGE_LABEL = {
  qualificando: 'Qualificando',
  lead_quente: 'Lead Quente',
  lead_frio: 'Lead Frio',
}

const STAGE_COLOR = {
  qualificando: 'bg-purple-50 text-purple-700 border-purple-200',
  lead_quente: 'bg-orange-50 text-orange-700 border-orange-200',
  lead_frio: 'bg-cyan-50 text-cyan-700 border-cyan-200',
}

export default function DashboardPage() {
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coolingOpen, setCoolingOpen] = useState(false)
  const [appointmentsOpen, setAppointmentsOpen] = useState(false)
  const [noReplyOpen, setNoReplyOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await getDashboard(period)
      setData(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [period])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-xs text-gray-500">Visão geral do funil de vendas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  period === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-500 disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-400 text-center py-16">Carregando...</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 text-center py-16">Erro ao carregar dados.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Conteúdo principal */}
          <div className="space-y-6">
            {/* Métricas principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard
                icon={<Users className="w-5 h-5 text-blue-500" />}
                label="Total de Leads"
                value={data.total}
                hint={period === 'all' ? 'todos' : `últimos ${period}d`}
              />
              <MetricCard
                icon={<Target className="w-5 h-5 text-green-500" />}
                label="Conversão"
                value={`${data.conversionRate}%`}
                hint="chegaram a agendado"
                valueClass="text-green-600"
              />
              <MetricCard
                icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                label="Taxa de Perda"
                value={`${data.lossRate}%`}
                hint="marcados como perdido"
                valueClass="text-red-600"
              />
              <MetricCard
                icon={<CheckCircle2 className="w-5 h-5 text-purple-500" />}
                label="Qualificados"
                value={data.qualifiedCount}
                hint={`${data.qualifiedRate}% do total`}
                valueClass="text-purple-600"
              />
            </div>

            {/* Funil */}
            <Section title="Funil — Leads por Stage">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {STAGE_CONFIG.map(s => (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-4 ${s.color}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                      {s.label}
                    </p>
                    <p className="text-3xl font-bold mt-1">{data.byStage[s.id] ?? 0}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Tempo médio por raia */}
            <Section title="Tempo médio por raia" icon={<Clock className="w-4 h-4" />}>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tempo médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGE_CONFIG.map(s => (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-md ${s.color}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {data.avgTimePerStage[s.id] ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Tempo calculado a partir do histórico de transições dos leads do período.
              </p>
            </Section>
          </div>

          {/* Drawer lateral */}
          <aside className="space-y-4">
            <CoolingLeadsCard
              leads={data.coolingLeads ?? []}
              onOpen={() => setCoolingOpen(true)}
            />
            <TodayAppointmentsCard
              appointments={data.todayAppointments ?? []}
              onOpen={() => setAppointmentsOpen(true)}
            />
            <NoReplyCard
              leads={data.noReplyLeads ?? []}
              onOpen={() => setNoReplyOpen(true)}
            />
          </aside>
        </div>
      )}

      <CoolingLeadsDrawer
        open={coolingOpen}
        onClose={() => setCoolingOpen(false)}
        leads={data?.coolingLeads ?? []}
      />

      <TodayAppointmentsDrawer
        open={appointmentsOpen}
        onClose={() => setAppointmentsOpen(false)}
        appointments={data?.todayAppointments ?? []}
      />

      <NoReplyDrawer
        open={noReplyOpen}
        onClose={() => setNoReplyOpen(false)}
        leads={data?.noReplyLeads ?? []}
      />
    </div>
  )
}

function MetricCard({ icon, label, value, hint, valueClass = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
        {icon} {title}
      </h2>
      {children}
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-pink-500', 'bg-purple-500', 'bg-green-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500',
]

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function colorFromName(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

function Avatar({ name, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div className={`${sizeClass} ${colorFromName(name)} rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white`}>
      {getInitials(name)}
    </div>
  )
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SERVICE_LABEL = {
  mega_hair: 'Mega Hair',
  manutencao: 'Manutenção',
}

function CoolingLeadsCard({ leads, onOpen }) {
  const count = leads.length
  const empty = count === 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Leads Esfriando</p>
        </div>
      </div>

      {empty ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Nenhum lead esfriando agora 🎉
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-3xl font-bold text-orange-600">{count}</span>
            <span className="text-xs text-gray-500">
              {count === 1 ? 'lead' : 'leads'}
            </span>
          </div>
          <button
            onClick={onOpen}
            className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium text-left"
          >
            Ver todos os leads →
          </button>
        </>
      )}
    </div>
  )
}

function CoolingLeadsDrawer({ open, onClose, leads }) {
  if (!open) return null

  const urgencyStyle = (days) => {
    if (days >= 3) return 'border-red-300 bg-red-50'
    if (days >= 2) return 'border-amber-300 bg-amber-50'
    return 'border-yellow-200 bg-yellow-50'
  }

  const urgencyBadge = (days) => {
    if (days >= 3) return 'text-red-600 font-semibold'
    if (days >= 2) return 'text-amber-600 font-semibold'
    return 'text-yellow-700 font-medium'
  }

  const whatsappLink = (phone) => {
    const digits = phone.replace(/\D/g, '')
    const number = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${number}`
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/30"
        onClick={onClose}
      />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-base font-bold text-gray-800">
              Leads Esfriando
            </h2>
            <span className="inline-flex items-center justify-center px-2 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-bold">
              {leads.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {leads.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum lead esfriando.
            </p>
          ) : (
            leads.map((lead) => (
              <div
                key={lead.id}
                className={`rounded-xl border p-4 ${urgencyStyle(lead.daysSince)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight truncate">
                      {lead.name || lead.phone}
                    </p>
                    {lead.name && (
                      <p className="text-xs text-gray-500 mt-0.5">{lead.phone}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-md border whitespace-nowrap ${STAGE_COLOR[lead.stage] ?? ''}`}>
                    {STAGE_LABEL[lead.stage] ?? lead.stage}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className={`text-xs ${urgencyBadge(lead.daysSince)}`}>
                    {lead.daysSince === 0
                      ? 'Menos de 1 dia sem contato'
                      : `${lead.daysSince} ${lead.daysSince === 1 ? 'dia' : 'dias'} sem contato`}
                  </p>
                  <a
                    href={whatsappLink(lead.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Contatar
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function TodayAppointmentsCard({ appointments, onOpen }) {
  const count = appointments.length
  const preview = appointments.slice(0, 4)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Agendamentos hoje</p>
        </div>
      </div>

      {count === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Nenhum agendamento para hoje
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-3xl font-bold text-green-600">{count}</span>
            <span className="text-xs text-gray-500">
              {count === 1 ? 'consulta' : 'consultas'}
            </span>
          </div>

          <div className="flex -space-x-2 mb-3">
            {preview.map((a) => (
              <div key={a.id} title={a.clientName}>
                <Avatar name={a.clientName} />
              </div>
            ))}
            {count > 4 && (
              <div className="w-9 h-9 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-xs font-semibold text-gray-600">
                +{count - 4}
              </div>
            )}
          </div>

          <button
            onClick={onOpen}
            className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium text-left"
          >
            Ver todos →
          </button>
        </>
      )}
    </div>
  )
}

const APPT_STATUS_LABEL = {
  agendado: { label: 'Agendado', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmado: { label: 'Confirmado', color: 'bg-green-50 text-green-700 border-green-200' },
  realizado: { label: 'Realizado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelado: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200' },
  nao_compareceu: { label: 'Não compareceu', color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

function TodayAppointmentsDrawer({ open, onClose, appointments }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-bold text-gray-800">Agendamentos hoje</h2>
            <span className="inline-flex items-center justify-center px-2 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
              {appointments.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {appointments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum agendamento para hoje.
            </p>
          ) : (
            appointments.map((a) => {
              const statusInfo = APPT_STATUS_LABEL[a.status] ?? APPT_STATUS_LABEL.agendado
              return (
                <div key={a.id} className="rounded-xl border border-gray-100 bg-white p-4 flex items-center gap-3">
                  <Avatar name={a.clientName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{a.clientName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatTime(a.startDateTime)} · {SERVICE_LABEL[a.service] ?? a.service}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-md border whitespace-nowrap ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function NoReplyCard({ leads, onOpen }) {
  const count = leads.length
  const preview = leads.slice(0, 4)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <MessageSquareWarning className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Sem resposta</p>
        </div>
      </div>

      {count === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Todas as mensagens foram respondidas 👍
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-3xl font-bold text-amber-600">{count}</span>
            <span className="text-xs text-gray-500">
              {count === 1 ? 'lead' : 'leads'}
            </span>
          </div>

          <div className="flex -space-x-2 mb-3">
            {preview.map((l) => (
              <div key={l.id} title={l.name || l.phone}>
                <Avatar name={l.name || l.phone} />
              </div>
            ))}
            {count > 4 && (
              <div className="w-9 h-9 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-xs font-semibold text-gray-600">
                +{count - 4}
              </div>
            )}
          </div>

          <button
            onClick={onOpen}
            className="w-full text-xs text-indigo-600 hover:text-indigo-700 font-medium text-left"
          >
            Ver todos os leads sem resposta →
          </button>
        </>
      )}
    </div>
  )
}

function NoReplyDrawer({ open, onClose, leads }) {
  if (!open) return null

  const whatsappLink = (phone) => {
    const digits = phone.replace(/\D/g, '')
    const number = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${number}`
  }

  const formatHours = (h) => {
    if (h < 24) return `${h}h sem resposta`
    const days = Math.floor(h / 24)
    return `${days} ${days === 1 ? 'dia' : 'dias'} sem resposta`
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-gray-800">Sem resposta</h2>
            <span className="inline-flex items-center justify-center px-2 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              {leads.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {leads.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum lead sem resposta.
            </p>
          ) : (
            leads.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
                <Avatar name={lead.name || lead.phone} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {lead.name || lead.phone}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${STAGE_COLOR[lead.stage] ?? ''}`}>
                      {STAGE_LABEL[lead.stage] ?? lead.stage}
                    </span>
                    <span className="text-xs text-amber-700 font-medium">
                      {formatHours(lead.hoursSince)}
                    </span>
                  </div>
                </div>
                <a
                  href={whatsappLink(lead.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
