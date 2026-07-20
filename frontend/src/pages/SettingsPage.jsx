import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, Loader2, Smartphone, RotateCcw, AlertCircle, X, RefreshCw, Trash2, Radio, Plus, Users, UserPlus } from 'lucide-react'
import { getCaregivers, createCaregiver, updateCaregiver, deleteCaregiver } from '../services/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Abas de prompt (multiagente). field = nome do campo na API PATCH /instance/config
const PROMPT_TABS = [
  { key: 'roteador', label: 'Roteador (LIA)', field: 'promptRoteador' },
  { key: 'fluxo_1', label: 'Fluxo 1 — Cuidador', field: 'promptFluxo1' },
  { key: 'fluxo_2', label: 'Fluxo 2 — Trabalhar', field: 'promptFluxo2' },
  { key: 'fluxo_3', label: 'Fluxo 3 — Curso', field: 'promptFluxo3' },
  { key: 'fluxo_4', label: 'Fluxo 4 — Jurídico', field: 'promptFluxo4' },
]

const EMPTY_PROMPTS = { roteador: '', fluxo_1: '', fluxo_2: '', fluxo_3: '', fluxo_4: '' }

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
  const [prompts, setPrompts] = useState(EMPTY_PROMPTS)
  const [defaultPrompts, setDefaultPrompts] = useState(EMPTY_PROMPTS)
  const [activePromptTab, setActivePromptTab] = useState('roteador')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [followupDelay, setFollowupDelay] = useState(60)
  const [followupMessage, setFollowupMessage] = useState('Olá! Já conseguiu preencher o formulário de matrícula? 😊')
  const [savingFollowup, setSavingFollowup] = useState(false)
  const [inactivityMinutes, setInactivityMinutes] = useState(60)
  const [inactivityMessage, setInactivityMessage] = useState('Olá! Ainda está por aí? Fico à disposição pra continuar te ajudando 😊')
  const [savingInactivity, setSavingInactivity] = useState(false)
  // Fluxo 1 — cuidadores e valores dos planos
  const [caregivers, setCaregivers] = useState([])
  const [newCaregiverName, setNewCaregiverName] = useState('')
  const [newCaregiverPhone, setNewCaregiverPhone] = useState('')
  const [savingCaregiver, setSavingCaregiver] = useState(false)
  const [caregiverError, setCaregiverError] = useState(null)
  const [planValues, setPlanValues] = useState({
    simplesDiurno: '', simplesNoturno: '',
    medioDiurno: '', medioNoturno: '', medio24h: '',
    complexoDiurno: '', complexoNoturno: '', complexo24h: '',
    hospitalarDiurno: '', hospitalarNoturno: '',
    percent: 55,
  })
  const [savingPlans, setSavingPlans] = useState(false)
  const [careDuties, setCareDuties] = useState({ simples: '', medio: '', complexo: '', hospitalar: '' })
  const [savingDuties, setSavingDuties] = useState(false)
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
      // Carrega prompts salvos; fluxo_3 cai para o prompt legado se ainda não tiver promptFluxo3
      setPrompts(prev => ({
        roteador: data?.promptRoteador ?? prev.roteador,
        fluxo_1: data?.promptFluxo1 ?? prev.fluxo_1,
        fluxo_2: data?.promptFluxo2 ?? prev.fluxo_2,
        fluxo_3: data?.promptFluxo3 ?? data?.customPromptLia ?? prev.fluxo_3,
        fluxo_4: data?.promptFluxo4 ?? prev.fluxo_4,
      }))
      // Valores dos planos (Fluxo 1) — armazenados em centavos, exibidos em reais
      const centsToReais = (c) => (c > 0 ? (c / 100).toString() : '')
      setPlanValues({
        simplesDiurno: centsToReais(data?.planSimplesDiurnoValue ?? 0),
        simplesNoturno: centsToReais(data?.planSimplesNoturnoValue ?? 0),
        medioDiurno: centsToReais(data?.planMedioDiurnoValue ?? 0),
        medioNoturno: centsToReais(data?.planMedioNoturnoValue ?? 0),
        medio24h: centsToReais(data?.planMedio24hValue ?? 0),
        complexoDiurno: centsToReais(data?.planComplexoDiurnoValue ?? 0),
        complexoNoturno: centsToReais(data?.planComplexoNoturnoValue ?? 0),
        complexo24h: centsToReais(data?.planComplexo24hValue ?? 0),
        hospitalarDiurno: centsToReais(data?.planHospitalarDiurnoValue ?? 0),
        hospitalarNoturno: centsToReais(data?.planHospitalarNoturnoValue ?? 0),
        percent: data?.caregiverPercent ?? 55,
      })
      setCareDuties({
        simples: data?.careDutiesSimples ?? '',
        medio: data?.careDutiesMedio ?? '',
        complexo: data?.careDutiesComplexo ?? '',
        hospitalar: data?.careDutiesHospitalar ?? '',
      })
      return data
    } catch {
      setInstanceConfig(null)
      return null
    }
  }

  const fetchFollowupConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/leads/followup/config`)
      const data = await res.json()
      setFollowupDelay(data.delayMinutes ?? 60)
      setFollowupMessage(data.message ?? '')
    } catch { /* silencioso */ }
  }

  const fetchInactivityFollowupConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/leads/inactivity-followup/config`)
      const data = await res.json()
      setInactivityMinutes(data.minutes ?? 60)
      setInactivityMessage(data.message ?? '')
    } catch { /* silencioso */ }
  }

  const fetchCaregivers = async () => {
    try {
      const data = await getCaregivers()
      setCaregivers(Array.isArray(data) ? data : [])
    } catch { /* silencioso */ }
  }

  const handleAddCaregiver = async () => {
    setCaregiverError(null)
    setSavingCaregiver(true)
    try {
      await createCaregiver({ name: newCaregiverName.trim(), phone: newCaregiverPhone.replace(/\D/g, '') })
      setNewCaregiverName('')
      setNewCaregiverPhone('')
      await fetchCaregivers()
    } catch (err) {
      setCaregiverError(err?.message || 'Não foi possível adicionar o cuidador.')
    } finally {
      setSavingCaregiver(false)
    }
  }

  const handleToggleCaregiver = async (c) => {
    try {
      await updateCaregiver(c.id, { active: !c.active })
      await fetchCaregivers()
    } catch { /* silencioso */ }
  }

  const handleRemoveCaregiver = async (id) => {
    try {
      await deleteCaregiver(id)
      await fetchCaregivers()
    } catch { /* silencioso */ }
  }

  const handleSavePlans = async () => {
    setSavingPlans(true)
    try {
      const reaisToCents = (v) => Math.max(0, Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0)
      await fetch(`${API_URL}/instance/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSimplesDiurnoValue: reaisToCents(planValues.simplesDiurno),
          planSimplesNoturnoValue: reaisToCents(planValues.simplesNoturno),
          planMedioDiurnoValue: reaisToCents(planValues.medioDiurno),
          planMedioNoturnoValue: reaisToCents(planValues.medioNoturno),
          planMedio24hValue: reaisToCents(planValues.medio24h),
          planComplexoDiurnoValue: reaisToCents(planValues.complexoDiurno),
          planComplexoNoturnoValue: reaisToCents(planValues.complexoNoturno),
          planComplexo24hValue: reaisToCents(planValues.complexo24h),
          planHospitalarDiurnoValue: reaisToCents(planValues.hospitalarDiurno),
          planHospitalarNoturnoValue: reaisToCents(planValues.hospitalarNoturno),
          caregiverPercent: Math.max(0, Math.min(100, parseInt(planValues.percent, 10) || 55)),
        }),
      })
    } finally {
      setSavingPlans(false)
    }
  }

  const handleSaveDuties = async () => {
    setSavingDuties(true)
    try {
      await fetch(`${API_URL}/instance/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          careDutiesSimples: careDuties.simples,
          careDutiesMedio: careDuties.medio,
          careDutiesComplexo: careDuties.complexo,
          careDutiesHospitalar: careDuties.hospitalar,
        }),
      })
    } finally {
      setSavingDuties(false)
    }
  }

  const fetchDefaultPrompts = async () => {
    try {
      const res = await fetch(`${API_URL}/instance/default-prompts`)
      const data = await res.json() // { roteador, fluxo_1, fluxo_2, fluxo_3, fluxo_4 }
      setDefaultPrompts(data)
      // Preenche os campos ainda vazios com o default do código
      setPrompts(prev => ({
        roteador: prev.roteador || data.roteador || '',
        fluxo_1: prev.fluxo_1 || data.fluxo_1 || '',
        fluxo_2: prev.fluxo_2 || data.fluxo_2 || '',
        fluxo_3: prev.fluxo_3 || data.fluxo_3 || '',
        fluxo_4: prev.fluxo_4 || data.fluxo_4 || '',
      }))
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
    fetchFollowupConfig()
    fetchInactivityFollowupConfig()
    fetchCaregivers()
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

      {/* Card de prompt customizado */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Prompt da IA</h2>
          <p className="text-xs text-gray-500 mb-4">Personalize o comportamento de cada agente (personalidade, fluxo, regras). Datas, mídias disponíveis e formato técnico de resposta são adicionados automaticamente pelo sistema.</p>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
            {PROMPT_TABS.map(tab => (
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
            value={prompts[activePromptTab] ?? ''}
            onChange={e => setPrompts(prev => ({ ...prev, [activePromptTab]: e.target.value }))}
            className="w-full h-80 text-xs font-mono border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700 leading-relaxed"
            placeholder="Digite o prompt do agente aqui..."
            spellCheck={false}
          />

          {/* Botões */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={async () => {
                setSavingPrompt(true)
                try {
                  const tab = PROMPT_TABS.find(t => t.key === activePromptTab)
                  await fetch(`${API_URL}/instance/config`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [tab.field]: prompts[activePromptTab] || null }),
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
              onClick={() => setPrompts(prev => ({ ...prev, [activePromptTab]: defaultPrompts[activePromptTab] || '' }))}
              disabled={savingPrompt}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      )}

      {/* Card de follow-up automático */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Follow-up automático</h2>
          <p className="text-xs text-gray-500 mb-4">Após o pagamento confirmado, a LIA envia uma mensagem automática ao cliente perguntando se já preencheu o formulário.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Tempo de espera</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '30 min', value: 30 },
                  { label: '1 hora', value: 60 },
                  { label: '2 horas', value: 120 },
                  { label: '3 horas', value: 180 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFollowupDelay(opt.value)}
                    className={`px-4 py-2 text-xs font-medium rounded-lg border transition ${
                      followupDelay === opt.value
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensagem do follow-up</label>
              <textarea
                value={followupMessage}
                onChange={e => setFollowupMessage(e.target.value)}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700"
                placeholder="Ex: Olá! Já conseguiu preencher o formulário de matrícula? 😊"
              />
            </div>

            <button
              onClick={async () => {
                setSavingFollowup(true)
                try {
                  await fetch(`${API_URL}/leads/followup/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ delayMinutes: followupDelay, message: followupMessage }),
                  })
                } finally {
                  setSavingFollowup(false)
                }
              }}
              disabled={savingFollowup || !followupMessage.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              {savingFollowup ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingFollowup ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Card de follow-up de inatividade (Fluxo 1, 2 e 3) */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Follow-up de inatividade</h2>
          <p className="text-xs text-gray-500 mb-4">Se o lead ficar sem responder durante o atendimento (Fluxo 1, 2 ou 3), a LIA envia essa mensagem fixa pra retomar o contato.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Tempo de espera (minutos)</label>
              <input
                type="number"
                min={1}
                value={inactivityMinutes}
                onChange={e => setInactivityMinutes(Number(e.target.value))}
                className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensagem do follow-up</label>
              <textarea
                value={inactivityMessage}
                onChange={e => setInactivityMessage(e.target.value)}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700"
                placeholder="Ex: Olá! Ainda está por aí? Fico à disposição pra continuar te ajudando 😊"
              />
            </div>

            <button
              onClick={async () => {
                setSavingInactivity(true)
                try {
                  await fetch(`${API_URL}/leads/inactivity-followup/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ minutes: inactivityMinutes, message: inactivityMessage }),
                  })
                } finally {
                  setSavingInactivity(false)
                }
              }}
              disabled={savingInactivity || !inactivityMessage.trim() || !inactivityMinutes}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              {savingInactivity ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingInactivity ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Card de cuidadores (Fluxo 1) */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-semibold text-gray-800">Cuidadores</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">Cuidadores ativos recebem no WhatsApp as solicitações de atendimento (Fluxo 1). O primeiro que responder <span className="font-medium">ACEITO</span> fica com o atendimento.</p>

          {/* Lista */}
          <div className="space-y-2 mb-4">
            {caregivers.length === 0 && (
              <p className="text-xs text-gray-400 py-2">Nenhum cuidador cadastrado ainda.</p>
            )}
            {caregivers.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 border border-gray-100 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                </div>
                <button
                  onClick={() => handleToggleCaregiver(c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    c.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={c.active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}
                >
                  {c.active ? 'Ativo' : 'Inativo'}
                </button>
                <button
                  onClick={() => handleRemoveCaregiver(c.id)}
                  className="text-gray-300 hover:text-red-500 transition"
                  title="Remover cuidador"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Formulário de adição */}
          <div className="flex gap-2 flex-wrap items-start">
            <input
              type="text"
              placeholder="Nome do cuidador"
              value={newCaregiverName}
              onChange={e => setNewCaregiverName(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="text"
              placeholder="Telefone (ex: 27999999999)"
              value={newCaregiverPhone}
              onChange={e => setNewCaregiverPhone(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={handleAddCaregiver}
              disabled={savingCaregiver || !newCaregiverName.trim() || newCaregiverPhone.replace(/\D/g, '').length < 10}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              {savingCaregiver ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>
          {caregiverError && (
            <p className="text-xs text-red-600 mt-2">{caregiverError}</p>
          )}
        </div>
      )}

      {/* Card de valores dos planos (Fluxo 1) */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Valores dos planos (Fluxo 1)</h2>
          <p className="text-xs text-gray-500 mb-4">Valor cobrado por atendimento conforme a complexidade. O cuidador recebe o percentual definido abaixo — enviado automaticamente na solicitação.</p>

          {[
            { label: 'Simples', keys: [['simplesDiurno', 'Diurno'], ['simplesNoturno', 'Noturno']] },
            { label: 'Médio', keys: [['medioDiurno', 'Diurno'], ['medioNoturno', 'Noturno'], ['medio24h', '24h']] },
            { label: 'Complexo', keys: [['complexoDiurno', 'Diurno'], ['complexoNoturno', 'Noturno'], ['complexo24h', '24h']] },
            { label: 'Hospitalar', keys: [['hospitalarDiurno', 'Diurno'], ['hospitalarNoturno', 'Noturno']] },
          ].map(group => (
            <div key={group.label} className="mb-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">{group.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {group.keys.map(([key, turnoLabel]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{turnoLabel} (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={planValues[key]}
                      onChange={e => setPlanValues(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mb-4 max-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">% repassado ao cuidador</label>
            <input
              type="number"
              min="0"
              max="100"
              value={planValues.percent}
              onChange={e => setPlanValues(prev => ({ ...prev, percent: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            onClick={handleSavePlans}
            disabled={savingPlans}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
          >
            {savingPlans ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {savingPlans ? 'Salvando...' : 'Salvar valores'}
          </button>
        </div>
      )}

      {/* Card de atribuições do cuidador por plano (Fluxo 1) */}
      {!bootstrapping && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">O que o cuidador vai fazer (Fluxo 1)</h2>
          <p className="text-xs text-gray-500 mb-4">Um item por linha — cada linha vira um tópico na mensagem enviada ao cuidador junto com o resumo do atendimento.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'simples', label: 'Simples' },
              { key: 'medio', label: 'Médio' },
              { key: 'complexo', label: 'Complexo' },
              { key: 'hospitalar', label: 'Hospitalar' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                <textarea
                  rows={5}
                  placeholder={'Ex:\nAuxiliar na higiene pessoal\nAdministrar medicação nos horários\nAcompanhar refeições'}
                  value={careDuties[key]}
                  onChange={e => setCareDuties(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveDuties}
            disabled={savingDuties}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition disabled:opacity-50 mt-4"
          >
            {savingDuties ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {savingDuties ? 'Salvando...' : 'Salvar atribuições'}
          </button>
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
