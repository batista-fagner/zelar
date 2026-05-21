const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const json = async (r) => {
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`)
  return data
}

export const getLeads = () =>
  fetch(`${BASE}/leads`).then(json)

export const getConversation = (id) =>
  fetch(`${BASE}/leads/${id}/conversation`).then(json)

export const getHistory = (id) =>
  fetch(`${BASE}/leads/${id}/history`).then(json)

export const updateStage = (id, stage) =>
  fetch(`${BASE}/leads/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  }).then(json)

export const updateName = (id, name) =>
  fetch(`${BASE}/leads/${id}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(json)

export const toggleAi = (id, enabled) =>
  fetch(`${BASE}/leads/${id}/ai`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(json)

export const updateObservations = (id, observations) =>
  fetch(`${BASE}/leads/${id}/observations`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observations }),
  }).then(json)

export const sendManualMessage = (phone, text) =>
  fetch(`${BASE}/webhooks/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, text }),
  }).then(json)

export const deleteLead = (id, reason) =>
  fetch(`${BASE}/leads/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).then(json)

export const getDeletedLeads = () =>
  fetch(`${BASE}/leads/deleted`).then(json)

export const getDeletedLead = (id) =>
  fetch(`${BASE}/leads/deleted/${id}`).then(json)

export const getDashboard = (period = 'all') =>
  fetch(`${BASE}/leads/dashboard?period=${period}`).then(json)

export const removeLabel = (id, label) =>
  fetch(`${BASE}/leads/${id}/labels/${encodeURIComponent(label)}`, { method: 'DELETE' }).then(json)

export const sendBulkMessage = (payload) =>
  fetch(`${BASE}/bulk-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(json)

export const getCampaigns = () =>
  fetch(`${BASE}/bulk-message/campaigns`).then(json)

export const getCampaignMessages = (id) =>
  fetch(`${BASE}/bulk-message/campaigns/${id}/messages`).then(json)

export const controlCampaign = (id, action) =>
  fetch(`${BASE}/bulk-message/campaigns/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }).then(json)

export const getAppointmentsByMonth = (year, month) =>
  fetch(`${BASE}/appointments?year=${year}&month=${month}`).then(json)

export const createAppointment = (data) =>
  fetch(`${BASE}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(json)

export const updateAppointment = (id, data) =>
  fetch(`${BASE}/appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(json)

export const deleteAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}`, { method: 'DELETE' }).then(json)
