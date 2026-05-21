import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, CheckCircle, AlertCircle, Loader2, History, StopCircle, PlayCircle, Trash2, RefreshCw, X, Eye } from 'lucide-react'
import { getLeads, sendBulkMessage, getCampaigns, getCampaignMessages, controlCampaign } from '../services/api'

const STAGES = ['novo_lead', 'qualificando', 'lead_quente', 'lead_frio', 'agendado', 'convertido', 'perdido']
const TEMPERATURES = ['quente', 'morno', 'frio']

// Variáveis disponíveis por modo
const VARIABLES_SYSTEM = [
  { tag: '{nome}', label: 'Nome do lead', example: 'João Silva' },
  { tag: '{telefone}', label: 'Telefone', example: '5571992867765' },
]
const VARIABLES_MANUAL = [
  { tag: '{telefone}', label: 'Telefone', example: '5571992867765' },
]

function interpolatePreview(template, vars) {
  return template
    .replace(/\{nome\}/gi, vars.nome)
    .replace(/\{telefone\}/gi, vars.telefone)
}

const STATUS_CONFIG = {
  scheduled: { label: 'Agendada',  color: 'bg-blue-100 text-blue-700' },
  sending:   { label: 'Enviando',  color: 'bg-yellow-100 text-yellow-700' },
  paused:    { label: 'Pausada',   color: 'bg-gray-100 text-gray-600' },
  done:      { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  deleting:  { label: 'Deletando', color: 'bg-red-100 text-red-600' },
}

export default function BulkMessagePage() {
  const [activeTab, setActiveTab] = useState('manual')
  const [manualNumbers, setManualNumbers] = useState('')
  const [message, setMessage] = useState('')
  const [leads, setLeads] = useState([])
  const [selectedLeads, setSelectedLeads] = useState(new Set())
  const [stageFilter, setStageFilter] = useState(new Set())
  const [tempFilter, setTempFilter] = useState(new Set())
  const [labelFilter, setLabelFilter] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [campaignMessages, setCampaignMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const textareaRef = useRef(null)
  const pollRef = useRef(null)

  const loadCampaigns = useCallback(async (silent = false) => {
    if (!silent) setCampaignsLoading(true)
    try {
      const data = await getCampaigns()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch {
      setCampaigns([])
    } finally {
      if (!silent) setCampaignsLoading(false)
    }
  }, [])

  // Polling: recarrega campanhas a cada 5s se houver alguma "sending"
  useEffect(() => {
    if (activeTab !== 'history') {
      clearInterval(pollRef.current)
      return
    }
    loadCampaigns()
    pollRef.current = setInterval(() => {
      loadCampaigns(true)
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [activeTab, loadCampaigns])

  useEffect(() => {
    if (activeTab === 'system') loadLeads()
  }, [activeTab])

  // Limpa resultado ao editar mensagem
  useEffect(() => {
    setResult(null)
  }, [message, manualNumbers, selectedLeads])

  async function loadLeads() {
    setLoading(true)
    try {
      const data = await getLeads()
      setLeads(data || [])
    } catch {
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  // Insere variável na posição do cursor
  function insertVariable(tag) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const newText = message.slice(0, start) + tag + message.slice(end)
    setMessage(newText)
    // Reposiciona cursor após a tag
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    }, 0)
  }

  // Parser de números manual
  function parseNumbers(text) {
    return text
      .split('\n')
      .map(l => l.trim().replace(/\D/g, ''))
      .filter(n => n.length >= 10 && n.length <= 13)
  }

  const validNumbers = parseNumbers(manualNumbers)

  // Etiquetas únicas presentes nos leads
  const allLabels = [...new Set(leads.flatMap(l => l.labels ?? []))].sort()

  // Filtro de leads — etiqueta tem prioridade: se o lead tem a etiqueta selecionada, sempre aparece
  const filteredLeads = leads.filter(lead => {
    const hasSelectedLabel = labelFilter.size > 0 && (lead.labels ?? []).some(l => labelFilter.has(l))
    if (hasSelectedLabel) return true

    if (stageFilter.size > 0 && !stageFilter.has(lead.stage)) return false
    if (tempFilter.size > 0 && !tempFilter.has(lead.temperature)) return false
    if (labelFilter.size > 0) return false // tem filtro de label mas não bate
    return true
  })

  function toggleFilter(set, setFn, value) {
    const next = new Set(set)
    next.has(value) ? next.delete(value) : next.add(value)
    setFn(next)
  }

  function toggleLead(id) {
    const next = new Set(selectedLeads)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedLeads(next)
  }

  // Exemplo de preview: usa primeiro lead/número como exemplo
  const previewVars = activeTab === 'system'
    ? (() => {
        const firstSelected = leads.find(l => selectedLeads.has(l.id)) || filteredLeads[0]
        return {
          nome: firstSelected?.name || firstSelected?.phone || 'João Silva',
          telefone: firstSelected?.phone ? `55${firstSelected.phone}` : '5571999887766',
        }
      })()
    : {
        nome: validNumbers[0] ? `55${validNumbers[0]}` : '5571999887766',
        telefone: validNumbers[0] ? `55${validNumbers[0]}` : '5571999887766',
      }

  const previewText = message ? interpolatePreview(message, previewVars) : ''

  const canSendManual = validNumbers.length > 0 && message.trim().length > 0 && !sending
  const canSendSystem = selectedLeads.size > 0 && message.trim().length > 0 && !sending

  async function handleSend() {
    setSending(true)
    setResult(null)
    try {
      let res
      if (activeTab === 'manual') {
        res = await sendBulkMessage({
          mode: 'manual',
          numbers: validNumbers,
          message: message.trim(),
        })
      } else {
        res = await sendBulkMessage({
          mode: 'system',
          leadIds: Array.from(selectedLeads),
          message: message.trim(),
        })
      }
      setResult({ success: true, message: `✅ ${res.queued} mensagem(s) enfileirada(s)! Acompanhe em Histórico.` })
    } catch (err) {
      setResult({ success: false, message: `❌ Erro ao enviar: ${err.message}` })
    } finally {
      setSending(false)
    }
  }

  async function handleCampaignAction(folderId, action) {
    setActionLoading(folderId)
    try {
      await controlCampaign(folderId, action)
      await loadCampaigns(true)
    } catch (err) {
      console.error(`Erro ao executar ação ${action}:`, err)
    } finally {
      setActionLoading(null)
    }
  }

  async function openCampaignDetails(campaign) {
    setSelectedCampaign(campaign)
    setCampaignMessages([])
    setMessagesLoading(true)
    try {
      const data = await getCampaignMessages(campaign.id)
      setCampaignMessages(Array.isArray(data) ? data : (data?.messages ?? []))
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err)
      setCampaignMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }

  const variables = activeTab === 'system' ? VARIABLES_SYSTEM : VARIABLES_MANUAL

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="px-6 py-4 flex items-center gap-3">
          <Send className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-gray-800">Envio em Massa</h1>
        </div>
      </header>

      <main className="flex-1 p-6">
        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-6">
          {[['manual', 'Lista Manual'], ['system', 'Leads do Sistema'], ['history', 'Histórico']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 font-medium text-sm transition border-b-2 ${
                activeTab === id
                  ? 'text-teal-600 border-teal-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          {/* Coluna esquerda — inputs */}
          <div className="space-y-5">

            {activeTab === 'manual' ? (
              /* Lista de números */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Números de WhatsApp <span className="text-gray-400 font-normal">(um por linha)</span>
                </label>
                <textarea
                  value={manualNumbers}
                  onChange={e => setManualNumbers(e.target.value)}
                  placeholder={'71999887766\n71998776655\n85987654321'}
                  className="w-full h-36 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono resize-none"
                />
                <p className="text-xs mt-1.5">
                  <span className={`font-medium ${validNumbers.length > 0 ? 'text-teal-600' : 'text-gray-400'}`}>
                    {validNumbers.length} número(s) válido(s)
                  </span>
                </p>
              </div>
            ) : (
              /* Leads do sistema */
              <div className="space-y-4">
                {/* Filtros */}
                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">STAGE</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.map(stage => (
                        <button
                          key={stage}
                          onClick={() => toggleFilter(stageFilter, setStageFilter, stage)}
                          className={`px-2.5 py-1 text-xs rounded-full transition ${
                            stageFilter.has(stage)
                              ? 'bg-teal-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">TEMPERATURA</p>
                    <div className="flex gap-1.5">
                      {TEMPERATURES.map(temp => (
                        <button
                          key={temp}
                          onClick={() => toggleFilter(tempFilter, setTempFilter, temp)}
                          className={`px-2.5 py-1 text-xs rounded-full transition ${
                            tempFilter.has(temp)
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {temp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {allLabels.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">ETIQUETAS</p>
                      <div className="flex flex-wrap gap-1.5">
                        {allLabels.map(label => (
                          <button
                            key={label}
                            onClick={() => toggleFilter(labelFilter, setLabelFilter, label)}
                            className={`px-2.5 py-1 text-xs rounded-full transition ${
                              labelFilter.has(label)
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            🏷 {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de leads */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">
                      {filteredLeads.length} lead(s)
                      {selectedLeads.size > 0 && (
                        <span className="text-teal-600 ml-2">· {selectedLeads.size} selecionado(s)</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedLeads(new Set(filteredLeads.map(l => l.id)))}
                        className="text-xs text-teal-600 hover:underline">Todos</button>
                      <button onClick={() => setSelectedLeads(new Set())}
                        className="text-xs text-gray-500 hover:underline">Limpar</button>
                    </div>
                  </div>

                  {loading ? (
                    <p className="text-sm text-gray-400">Carregando...</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-50">
                      {filteredLeads.length === 0 ? (
                        <p className="text-sm text-gray-400 p-3">Nenhum lead encontrado</p>
                      ) : filteredLeads.map(lead => (
                        <label key={lead.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedLeads.has(lead.id)}
                            onChange={() => toggleLead(lead.id)}
                            className="w-4 h-4 rounded border-gray-300 text-teal-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{lead.name || lead.phone}</p>
                            {lead.name && <p className="text-xs text-gray-400">{lead.phone}</p>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {lead.temperature && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                lead.temperature === 'quente' ? 'bg-orange-100 text-orange-700' :
                                lead.temperature === 'morno' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>{lead.temperature}</span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mensagem com variáveis */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Mensagem</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Variáveis:</span>
                  {variables.map(v => (
                    <button
                      key={v.tag}
                      onClick={() => insertVariable(v.tag)}
                      title={`${v.label} — ex: ${v.example}`}
                      className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 transition font-mono"
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Olá, {nome}! Temos uma novidade para você na clínica..."
                className="w-full h-28 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{message.length} caractere(s)</p>
            </div>

            {/* Botão de envio */}
            <button
              onClick={handleSend}
              disabled={activeTab === 'manual' ? !canSendManual : !canSendSystem}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white font-medium py-2.5 rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar para {activeTab === 'manual' ? validNumbers.length : selectedLeads.size} contato(s)
                </>
              )}
            </button>

            {/* Resultado */}
            {result && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {result.success
                  ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                }
                {result.message}
              </div>
            )}
          </div>

          {/* Coluna direita — preview */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Preview da mensagem</p>
            <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-40">
              {previewText ? (
                <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 max-w-[85%] shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{previewText}</p>
                  <p className="text-[10px] text-gray-400 mt-1 text-right">agora</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center mt-8">Digite a mensagem para ver o preview</p>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Exemplo com: <span className="font-mono text-gray-600">{previewVars.nome}</span>
            </p>

            {/* Info sobre delays */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">Sobre o envio</p>
              <p>• Delay entre mensagens: 5 a 15 segundos</p>
              <p>• Envio iniciado em até 1 minuto</p>
              <p>• Processo gerenciado pela uazapi</p>
            </div>
          </div>
        </div>

        {/* Aba Histórico */}
        {activeTab === 'history' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                Atualiza automaticamente a cada 5s enquanto há campanhas em andamento
              </p>
              <button
                onClick={() => loadCampaigns()}
                className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 transition"
              >
                <RefreshCw className={`w-4 h-4 ${campaignsLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {campaignsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando campanhas...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma campanha encontrada</p>
                <p className="text-gray-400 text-sm mt-1">Campanhas enviadas aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(campaign => {
                  const statusCfg = STATUS_CONFIG[campaign.status] || { label: campaign.status, color: 'bg-gray-100 text-gray-600' }
                  const isActing = actionLoading === campaign.id
                  const isSending = campaign.status === 'sending'
                  const isDone = campaign.status === 'done'

                  return (
                    <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-800 truncate">
                              {campaign.campaignName || campaign.id}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>
                              {isSending && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1 animate-pulse" />}
                              {statusCfg.label}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {campaign.mode === 'manual' ? 'Manual' : 'Leads'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>{campaign.totalRecipients} destinatário(s)</span>
                            <span>{new Date(campaign.createdAt).toLocaleString('pt-BR')}</span>
                          </div>
                          {/* Prévia da mensagem */}
                          <p className="text-xs text-gray-500 mt-1.5 truncate italic">
                            "{campaign.message}"
                          </p>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openCampaignDetails(campaign)}
                            title="Ver detalhes"
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!isDone && (
                            <>
                              {isActing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                              ) : (
                                <>
                                  {campaign.status === 'sending' || campaign.status === 'scheduled' ? (
                                    <button
                                      onClick={() => handleCampaignAction(campaign.id, 'stop')}
                                      title="Pausar campanha"
                                      className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition"
                                    >
                                      <StopCircle className="w-4 h-4" />
                                    </button>
                                  ) : campaign.status === 'paused' ? (
                                    <button
                                      onClick={() => handleCampaignAction(campaign.id, 'continue')}
                                      title="Continuar campanha"
                                      className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition"
                                    >
                                      <PlayCircle className="w-4 h-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={() => handleCampaignAction(campaign.id, 'delete')}
                                    title="Deletar campanha"
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Detalhes */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Detalhes da Campanha</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedCampaign.campaignName || selectedCampaign.id}</p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-1 hover:bg-gray-100 rounded transition text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem enviada */}
            {selectedCampaign?.message && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-1">MENSAGEM ENVIADA</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">"{selectedCampaign.message}"</p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando mensagens...
                  </div>
                </div>
              ) : campaignMessages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Nenhuma mensagem encontrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600 mb-3">
                    {campaignMessages.length} mensagem(s) — Status detalhado
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Número</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Data/Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignMessages.map((msg, idx) => {
                          const status = msg.status || msg.messageStatus || 'Agendada'
                          const statusColor =
                            status === 'Sent' ? 'text-green-600' :
                            status === 'Delivered' ? 'text-blue-600' :
                            status === 'Failed' ? 'text-red-600' :
                            'text-gray-500'

                          return (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-800">
                                <p className="font-medium">{msg.leadName || msg.chatid?.replace('@s.whatsapp.net', '') || 'N/A'}</p>
                                {msg.leadName && <p className="text-xs text-gray-400 font-mono">{msg.chatid?.replace('@s.whatsapp.net', '')}</p>}
                              </td>
                              <td className={`px-4 py-3 font-medium ${statusColor}`}>
                                {status}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {msg.messageTimestamp ? new Date(msg.messageTimestamp).toLocaleString('pt-BR') : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 p-6 flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
