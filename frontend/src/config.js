/**
 * ViralDog — Central API & Cloud Client Configuration
 */

// URL padrão do backend (local por padrão ou VPS Oracle Cloud quando configurada)
export const DEFAULT_SERVER_URL = 'http://localhost:8000';
export const LOCAL_SERVER_URL = 'http://localhost:8000';
export const CLOUD_SERVER_URL = DEFAULT_SERVER_URL;

export function getApiBaseUrl() {
  const custom = localStorage.getItem('viraldog_server_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return DEFAULT_SERVER_URL;
}

export function setServerUrl(url) {
  try {
    if (url && url.trim() && url.trim() !== DEFAULT_SERVER_URL) {
      localStorage.setItem('viraldog_server_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('viraldog_server_url');
    }
  } catch (e) {
    console.error('Erro ao salvar URL do servidor:', e);
  }
}

export const API = getApiBaseUrl();
export const API_BASE_URL = API;

// ── Gerenciamento de Autenticação Multi-Tenant ──────────────────────────────

export function getAuthToken() {
  try {
    return localStorage.getItem('viraldog_auth_token') || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem('viraldog_auth_token', token);
    } else {
      localStorage.removeItem('viraldog_auth_token');
    }
  } catch (e) {
    console.error('Erro ao salvar token de autenticação:', e);
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('viraldog_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  try {
    if (user) {
      localStorage.setItem('viraldog_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('viraldog_user');
    }
  } catch (e) {
    console.error('Erro ao salvar dados do usuário:', e);
  }
}

export function getAuthHeaders(customHeaders = {}) {
  const token = getAuthToken();
  const headers = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Wrapper de fetch com injeção automática de URL base e token de autenticação
 */
export async function apiFetch(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  const headers = getAuthHeaders(options.headers || {});
  
  // Não colocar Content-Type json se for FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers
  });
}
