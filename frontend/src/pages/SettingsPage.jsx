import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, Loader2, Smartphone, RotateCcw, AlertCircle, X, RefreshCw, Trash2, Radio, Plus } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function StatusBadge({ status }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Conectado
      </span>
    )
  }
  if (status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        Conectando...
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Desconectado
    </span>
  )
}

export default function SettingsPage() {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [agentType, setAgentType] = useState('fisio')
  const [savingAgent, setSavingAgent] = useState(false)
  const [instanceConfig, setInstanceConfig] = useState(null) // null = não tem; objeto = tem
  const [instanceStatus, setInstanceStatus] = useState(null)
  const [connectMode, setConnectMode] = useState('qrcode')
  const [phoneInput, setPhoneInput] = useState('')
  const [qrCode, setQrCode] = useState(null)
  const [pairCode, setPairCode] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settingUpWebhook, setSettingUpWebhook] = useState(false)
  const [webhookConfigured, setWebhookConfigured] = useState(false)
  const [error, setError] = useState(null)
  const [instanceName, setInstanceName] = useState('')
  const [creatingInstance, setCreatingInstance] = useState(false)
  const [customPromptSofia, setCustomPromptSofia] = useState('')
  const [customPromptMegaHair, setCustomPromptMegaHair] = useState('')
  const [defaultPrompts, setDefaultPrompts] = useState({ sofia: '', megahair: '' })
  const [activePromptTab, setActivePromptTab] = useState('sofia')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const pollingRef = useRef(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/instance/status`)
      const data = await res.json()
      const status = data?.instance?.status ?? 'disconnected'
      setInstanceStatus(data)
      return { status, data }
    } catch {
      setInstanceStatus(null)
      return { status: 'disconnected', data: null }
    }
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/instance/config`)
      const data = await res.json()
      setInstanceConfig(data)
      setWebhookConfigured(data?.webhookConfigured ?? false)
      if (data?.agentType) setAgentType(data.agentType)
      if (data?.customPromptSofia != null) setCustomPromptSofia(data.customPromptSofia)
      if (data?.customPromptMegaHair != null) setCustomPromptMegaHair(data.customPromptMegaHair)
      return data
    } catch {
      setInstanceConfig(null)
      return null
    }
  }

  const fetchDefaultPrompts = async () => {
    try {
      const res = await fetch(`${API_URL}/instance/default-prompts`)
      const data = await res.json()
      setDefaultPrompts(data)
      // Só preenche com padrão se ainda não tem customizado
      setCustomPromptSofia(prev => prev || data.sofia)
      setCustomPromptMegaHair(prev => prev || data.megahair)
    } catch { /* silencioso */ }
  }

  const startPolling = () => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      const { status, data } = await fetchStatus()
      if (status === 'connected') {
        stopPolling()
        setConnecting(false)
        setQrCode(null)
        setPairCode(null)
        await setupWebhook()
      } else if (status === 'disconnected') {
        stopPolling()
        setConnecting(false)
        setQrCode(null)
        setPairCode(null)
      } else if (status === 'connecting') {
        if (data?.instance?.qrcode) setQrCode(data.instance.qrcode)
      }
    }, 3000)
  }

  const stopPolling = () => {
    clearInterval(pollingRef.current)
    pollingRef.current = null
  }

  const setupWebhook = async () => {
    setSettingUpWebhook(true)
    try {
      const res = await fetch(`${API_URL}/instance/setup-webhook`, { method: 'POST' })
      const data = await res.json()
      setWebhookConfigured(data?.webhookConfigured ?? false)
      setInstanceConfig(data)
    } catch {
      setWebhookConfigured(false)
    } finally {
      setSettingUpWebhook(false)
    }
  }

  useEffect(() => {
    fetchDefaultPrompts()
  }, [])

  useEffect(() => {
    const init = async () => {
      const config = await fetchConfig()
      if (!config) {
        setBootstrapping(false)
        return
      }
      const { status, data } = await fetchStatus()
      if (status === 'connecting') {
        setConnecting(true)
        if (data?.instance?.qrcode) setQrCode(data.instance.qrcode)
        if (data?.instance?.paircode) setPairCode(data.instance.paircode)
        startPolling()
      } else {
        setConnecting(false)
      }
      setBootstrapping(false)
    }
    init()
    return () => stopPolling()
  }, [])

  const handleCreateInstance = async () => {
    setError(null)
    setCreatingInstance(true)
    try {
      const res = await fetch(`${API_URL}/admin/instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: instanceName.trim() }),
      })
      const data = await res.json()
      if (data?.error) {
        setError(data.error)
        return
      }
      setInstanceConfig(data)
      setWebhookConfigured(data?.webhookConfigured ?? false)
      setInstanceName('')
      await fetchStatus()
    } catch {
      setError('Não foi possível criar a conexão. Verifique sua internet e tente novamente.')
    } finally {
      setCreatingInstance(false)
    }
  }

  const handleConnect = async () => {
    setError(null)
    setConnecting(true)
    setQrCode(null)
    setPairCode(null)

    try {
      const body = connectMode === 'paircode' ? { phone: phoneInput.replace(/\D/g, '') } : {}
      const res = await fetch(`${API_URL}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data?.instance?.qrcode) setQrCode(data.instance.qrcode)
      if (data?.instance?.paircode) setPairCode(data.instance.paircode)

      await fetchStatus()
      startPolling()
    } catch {
      setError('Não foi possível iniciar a conexão. Verifique sua internet e tente novamente.')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setShowConfirmDisconnect(false)
    setDisconnecting(true)
    setError(null)
    stopPolling()
    setConnecting(false)
    setQrCode(null)
    setPairCode(null)
    setWebhookConfigured(false)
    try {
      await fetch(`${API_URL}/instance/disconnect`, { method: 'POST' })
      await fetchStatus()
    } catch {
      setError('Não foi possível desconectar. Verifique sua internet e tente novamente.')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setError(null)
    try {
      await fetch(`${API_URL}/instance/reset`, { method: 'POST' })
      const { status, data } = await fetchStatus()
      if (status === 'connecting') {
        if (data?.instance?.qrcode) setQrCode(data.instance.qrcode)
        startPolling()
      }
    } catch {
      setError('Não foi possível reiniciar. Verifique sua internet e tente novamente.')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    setShowConfirmDelete(false)
    setDeleting(true)
    setError(null)
    stopPolling()
    try {
      await fetch(`${API_URL}/instance`, { method: 'DELETE' })
      setInstanceStatus(null)
      setInstanceConfig(null)
      setQrCode(null)
      setPairCode(null)
      setConnecting(false)
      setWebhookConfigured(false)
    } catch {
      setError('Não foi possível remover a conexão. Verifique sua internet e tente novamente.')
    } finally {
      setDeleting(false)
    }
  }

  const currentStatus = instanceStatus?.instance?.status ?? 'disconnected'
  const profileName = instanceStatus?.instance?.profileName ?? instanceConfig?.profileName
  const profilePicUrl = instanceStatus?.instance?.profilePicUrl ?? instanceConfig?.profilePicUrl
  const phone = instanceStatus?.status?.jid?.replace('@s.whatsapp.net', '').replace(/:\d+$/, '') ?? instanceConfig?.phone

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Configurações</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">WhatsApp</h2>
              <p className="text-xs text-gray-500">
                {instanceConfig?.profileName ? `Conexão: ${instanceConfig.profileName}` : 'Conexão via uazapi'}
              </p>
            </div>
          </div>
          {instanceConfig && <StatusBadge status={currentStatus} />}
        </div>

        {/* Carregando estado inicial */}
        {bootstrapping && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
            <span className="text-sm text-gray-500">Carregando...</span>
          </div>
        )}

        {/* Sem instância criada — formulário de criação */}
        {!bootstrapping && !instanceConfig && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium mb-1">Nenhuma conexão configurada</p>
              <p className="text-xs text-blue-600">Crie uma nova conexão WhatsApp para começar. Você poderá conectar seu número logo em seguida.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nome da conexão</label>
              <input
                type="text"
                placeholder="Ex: Clínica Dr. Silva"
                value={instanceName}
                onChange={e => setInstanceName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-400 mt-1">Apenas para identificação interna.</p>
            </div>

            <button
              onClick={handleCreateInstance}
              disabled={creatingInstance || !instanceName.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              {creatingInstance ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar conexão
            </button>
          </div>
        )}

        {/* Tem instância e está conectado */}
        {!bootstrapping && instanceConfig && currentStatus === 'connected' && (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 flex items-center gap-4">
              {profilePicUrl ? (
                <img
                  src={profilePicUrl}
                  alt="Foto de perfil"
                  className="w-12 h-12 rounded-full object-cover border-2 border-green-200 flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0">
                  <Wifi className="w-5 h-5 text-green-600" />
                </div>
              )}
              <div>
                {profileName && <p className="text-sm font-medium text-gray-800">{profileName}</p>}
                {phone && <p className="text-xs text-gray-500">{phone}</p>}
                <div className="flex items-center gap-1.5 mt-1">
                  {settingUpWebhook ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                      <span className="text-xs text-yellow-600">Configurando...</span>
                    </>
                  ) : webhookConfigured ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-xs text-green-600">Conectado e configurado</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span className="text-xs text-yellow-600">Conectado — webhook pendente</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                title="Reinicia a conexão sem perder a sessão"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Reiniciar
              </button>
              <button
                onClick={setupWebhook}
                disabled={settingUpWebhook}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                title="Reconfigura o webhook na uazapi com a URL atual do servidor"
              >
                {settingUpWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                Reconfigurar Webhook
              </button>
              <button
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={disconnecting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4" />}
                Desconectar
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Zona de perigo</p>
              <button
                onClick={() => setShowConfirmDelete(true)}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remover conexão
              </button>
              <p className="text-xs text-gray-400 mt-2">Remove permanentemente esta conexão. Será necessário criar uma nova do zero.</p>
            </div>
          </div>
        )}

        {/* Tem instância mas está desconectado — formulário para conectar */}
        {!bootstrapping && instanceConfig && currentStatus === 'disconnected' && !connecting && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-600">Conexão <span className="font-medium">{instanceConfig.profileName}</span> pronta. Escolha como quer conectar:</p>
            </div>

            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setConnectMode('qrcode')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                  connectMode === 'qrcode'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                QR Code
              </button>
              <button
                onClick={() => setConnectMode('paircode')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
                  connectMode === 'paircode'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Código de Pareamento
              </button>
            </div>

            {connectMode === 'paircode' && (
              <input
                type="text"
                placeholder="Número (ex: 5571999999999)"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}

            <button
              onClick={handleConnect}
              disabled={connectMode === 'paircode' && !phoneInput.trim()}
              className="w-full py-2.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              Conectar WhatsApp
            </button>

            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Remover esta conexão
              </button>
            </div>
          </div>
        )}

        {/* Conectando — exibe QR ou paircode */}
        {!bootstrapping && instanceConfig && (connecting || currentStatus === 'connecting') && (
          <div className="space-y-4">
            {qrCode && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-gray-600">Escaneie o QR code com seu WhatsApp</p>
                <img src={qrCode} alt="QR Code" className="w-56 h-56 rounded-lg border border-gray-200" />
                <p className="text-xs text-gray-400">Expira em 2 minutos</p>
              </div>
            )}

            {pairCode && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-gray-600">Digite este código no seu WhatsApp</p>
                <div className="px-8 py-4 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-3xl font-mono font-bold tracking-widest text-gray-800">
                    {pairCode}
                  </span>
                </div>
                <p className="text-xs text-gray-400">WhatsApp → Aparelhos Conectados → Conectar com número de telefone</p>
                <p className="text-xs text-gray-400">Expira em 5 minutos</p>
              </div>
            )}

            {!qrCode && !pairCode && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                <span className="text-sm text-gray-500">Iniciando conexão...</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando confirmação...
            </div>

            <button
              onClick={async () => {
                stopPolling()
                setConnecting(false)
                setQrCode(null)
                setPairCode(null)
                try {
                  await fetch(`${API_URL}/instance/disconnect`, { method: 'POST' })
                  await fetchStatus()
                } catch { /* ignora erro silencioso ao cancelar */ }
              }}
              className="flex items-center gap-2 mx-auto text-xs text-gray-400 hover:text-gray-600 transition"
            >
              <RotateCcw className="w-3 h-3" />
              Cancelar
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Card de seleção do agente */}
      {!bootstrapping && instanceConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Agente de IA</h2>
          <p className="text-xs text-gray-500 mb-4">Escolha o agente que vai responder as mensagens nesta conexão.</p>
          <div className="flex gap-3">
            {[
              { value: 'fisio', label: 'Fisioterapia', desc: 'Qualificação + agendamento de consulta' },
              { value: 'megahair', label: 'Mega Hair', desc: 'Qualificação + envio de vídeo + venda' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setAgentType(opt.value)}
                className={`flex-1 text-left p-4 rounded-xl border-2 transition ${
                  agentType === opt.value
                    ? 'border-teal-600 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${agentType === opt.value ? 'text-teal-700' : 'text-gray-700'}`}>{opt.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              setSavingAgent(true)
              try {
                await fetch(`${API_URL}/instance/config`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ agentType }),
                })
              } finally {
                setSavingAgent(false)
              }
            }}
            disabled={savingAgent || agentType === instanceConfig?.agentType}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
          >
            {savingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {savingAgent ? 'Salvando...' : 'Salvar agente'}
          </button>
        </div>
      )}

      {/* Card de prompt customizado */}
      {!bootstrapping && instanceConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Prompt da IA</h2>
          <p className="text-xs text-gray-500 mb-4">Personalize o comportamento de cada agente (personalidade, fluxo, regras). Datas, mídias disponíveis e formato técnico de resposta são adicionados automaticamente pelo sistema.</p>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: 'sofia', label: 'Sofia (Fisioterapia)' },
              { key: 'megahair', label: 'Lindona (Mega Hair)' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActivePromptTab(tab.key)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${
                  activePromptTab === tab.key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={activePromptTab === 'sofia' ? customPromptSofia : customPromptMegaHair}
            onChange={e => activePromptTab === 'sofia'
              ? setCustomPromptSofia(e.target.value)
              : setCustomPromptMegaHair(e.target.value)
            }
            className="w-full h-80 text-xs font-mono border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700 leading-relaxed"
            placeholder="Digite o prompt da IA aqui..."
            spellCheck={false}
          />

          {/* Botões */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={async () => {
                setSavingPrompt(true)
                try {
                  await fetch(`${API_URL}/instance/config`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      customPromptSofia: customPromptSofia || null,
                      customPromptMegaHair: customPromptMegaHair || null,
                    }),
                  })
                } finally {
                  setSavingPrompt(false)
                }
              }}
              disabled={savingPrompt}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              {savingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingPrompt ? 'Salvando...' : 'Salvar prompt'}
            </button>
            <button
              onClick={() => {
                if (activePromptTab === 'sofia') setCustomPromptSofia(defaultPrompts.sofia)
                else setCustomPromptMegaHair(defaultPrompts.megahair)
              }}
              className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      )}

      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Remover conexão?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Esta ação não pode ser desfeita. Você precisará criar uma nova conexão do zero.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmDisconnect && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <WifiOff className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Desconectar WhatsApp?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Será necessário escanear o QR code novamente para reconectar.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirmDisconnect(false)}
                className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
