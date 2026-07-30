const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const TOKEN_KEY = 'zelar_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

// Intercepta todo fetch para a API: anexa o Bearer token e desloga automaticamente
// em qualquer 401 (token ausente/expirado), sem precisar tocar em cada chamada existente.
const originalFetch = window.fetch.bind(window)

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? ''
  const isApiCall = url.startsWith(API_BASE)
  const isLoginCall = url.startsWith(`${API_BASE}/auth/login`)

  let finalInit = init
  if (isApiCall && !isLoginCall) {
    const token = getToken()
    if (token) {
      finalInit = {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      }
    }
  }

  const response = await originalFetch(input, finalInit)

  if (isApiCall && !isLoginCall && response.status === 401) {
    clearToken()
    onUnauthorized()
  }

  return response
}
