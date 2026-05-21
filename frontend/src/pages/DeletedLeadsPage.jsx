import { useEffect, useState } from 'react'
import { Trash2, Search, User, Phone, Calendar, FileText, X, MessageSquare } from 'lucide-react'
import { getDeletedLeads, getDeletedLead } from '../services/api'

const STAGE_LABELS = {
  novo_lead: 'Novo Lead',
  qualificando: 'Qualificando',
  lead_quente: 'Lead Quente',
  lead_frio: 'Lead Frio',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function DeletedLeadsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getDeletedLeads()
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function openDetail(id) {
    setLoadingDetail(true)
    try {
      const data = await getDeletedLead(id)
      setDetail(data)
    } finally {
      setLoadingDetail(false)
    }
  }

  const filtered = items.filter(it => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (it.name || '').toLowerCase().includes(q) ||
      (it.phone || '').toLowerCase().includes(q) ||
      (it.deletionReason || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Leads Excluídos</h1>
            <p className="text-xs text-gray-500">Histórico de exclusões com motivo</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou motivo..."
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            {items.length === 0 ? 'Nenhum lead foi excluído ainda.' : 'Nenhum resultado para essa busca.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Excluído em</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => (
                <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{it.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{it.phone}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {STAGE_LABELS[it.stage] || it.stage || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={it.deletionReason}>
                    {it.deletionReason}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(it.deletedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(it.id)}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <DetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
      {loadingDetail && !detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <p className="text-white text-sm">Carregando detalhes...</p>
        </div>
      )}
    </div>
  )
}

function DetailModal({ detail, onClose }) {
  const snap = detail.leadSnapshot || {}
  const lead = snap.lead || {}
  const messages = snap.messages || []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-500" />
            <h2 className="font-bold text-gray-800">Lead excluído</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          <Section icon={<User className="w-4 h-4" />} title="Dados do lead">
            <Row label="Nome" value={detail.name || '—'} />
            <Row label="Telefone" value={detail.phone} mono />
            <Row label="Stage" value={STAGE_LABELS[detail.stage] || detail.stage || '—'} />
            {lead.symptoms && <Row label="Sintomas" value={lead.symptoms} />}
            {lead.observations && <Row label="Observações" value={lead.observations} />}
          </Section>

          <Section icon={<FileText className="w-4 h-4" />} title="Motivo da exclusão">
            <p className="text-sm text-gray-700 bg-red-50 border border-red-100 rounded-lg p-3">
              {detail.deletionReason}
            </p>
            <p className="text-xs text-gray-400 mt-2">Excluído em: {formatDate(detail.deletedAt)}</p>
          </Section>

          {messages.length > 0 && (
            <Section icon={<MessageSquare className="w-4 h-4" />} title={`Histórico de mensagens (${messages.length})`}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-xs p-2 rounded-lg ${
                      m.direction === 'inbound'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-blue-50 text-blue-800 ml-8'
                    }`}
                  >
                    <p className="font-semibold mb-0.5 opacity-60 uppercase text-[10px]">
                      {m.direction === 'inbound' ? 'Lead' : (m.sender || 'Sistema')}
                    </p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <span className="text-gray-400">{icon}</span> {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 w-24 shrink-0">{label}:</span>
      <span className={`text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
