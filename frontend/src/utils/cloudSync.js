/**
 * Cloud Sync Utility — Handles Central Cloud 24/7 Publishing, Account Syncing, and Video Uploads.
 */
import { getAuthToken, CLOUD_SERVER_URL } from '../config';

const STORAGE_KEY = 'viraldog_cloud_config';

export function getCloudConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { enabled: true, vpsUrl: CLOUD_SERVER_URL, apiKey: '' };
    }
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      vpsUrl: parsed.vpsUrl || CLOUD_SERVER_URL,
      apiKey: parsed.apiKey || ''
    };
  } catch {
    return { enabled: true, vpsUrl: CLOUD_SERVER_URL, apiKey: '' };
  }
}

export function saveCloudConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving cloud config to localStorage:', e);
  }

  // Persistir no banco de dados SQLite do backend se local ativo
  try {
    fetch('http://localhost:8000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          cloud_enabled: String(Boolean(config?.enabled)),
          cloud_vps_url: String(config?.vpsUrl || CLOUD_SERVER_URL),
          cloud_api_key: String(config?.apiKey || ''),
        }
      })
    }).catch(err => console.warn('Could not persist cloud config to backend:', err));
  } catch (e) {
    console.warn('Could not post cloud config to backend:', e);
  }
}

function buildCloudHeaders(apiKey = '', custom = {}) {
  const headers = { ...custom };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (apiKey) {
    headers['X-ViralDog-Key'] = apiKey.trim();
  }
  return headers;
}

export async function testCloudConnection(vpsUrl, apiKey) {
  const targetUrl = vpsUrl || CLOUD_SERVER_URL;
  const cleanUrl = targetUrl.replace(/\/+$/, '');
  const headers = buildCloudHeaders(apiKey);

  const res = await fetch(`${cleanUrl}/api/cloud/health`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro na resposta do servidor (${res.status})`);
  }

  return await res.json();
}

export async function syncAccountToCloud(vpsUrl, apiKey, accountData) {
  const targetUrl = vpsUrl || CLOUD_SERVER_URL;
  const cleanUrl = targetUrl.replace(/\/+$/, '');
  const headers = buildCloudHeaders(apiKey, { 'Content-Type': 'application/json' });

  const res = await fetch(`${cleanUrl}/api/cloud/sync-account`, {
    method: 'POST',
    headers,
    body: JSON.stringify(accountData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao sincronizar conta com a Nuvem (${res.status})`);
  }

  return await res.json();
}

/**
 * Uploads a video file from local path or blob to the Cloud Server with progress tracking.
 */
export function uploadVideoToCloud(vpsUrl, apiKey, videoPathOrBlob, filename, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const targetUrl = vpsUrl || CLOUD_SERVER_URL;
      const cleanUrl = targetUrl.replace(/\/+$/, '');
      const uploadEndpoint = `${cleanUrl}/api/cloud/upload-video`;

      let fileBlob = videoPathOrBlob;

      // If it's a file path string (Electron), read it via fetch or electron file protocol
      if (typeof videoPathOrBlob === 'string') {
        const localUrl = `http://localhost:8000/api/videos/file?path=${encodeURIComponent(videoPathOrBlob)}`;
        const fileRes = await fetch(localUrl);
        if (!fileRes.ok) {
          throw new Error(`Não foi possível carregar o arquivo local para envio à Nuvem (${fileRes.status})`);
        }
        fileBlob = await fileRes.blob();
      }

      const formData = new FormData();
      const safeFilename = filename || (typeof videoPathOrBlob === 'string' ? videoPathOrBlob.split(/[\\/]/).pop() : 'video.mp4');
      formData.append('file', fileBlob, safeFilename);
      formData.append('custom_name', safeFilename);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadEndpoint);
      xhr.timeout = 300000; // 5 minutos de timeout para vídeos maiores

      const headers = buildCloudHeaders(apiKey);
      Object.keys(headers).forEach(k => {
        if (k.toLowerCase() !== 'content-type') {
          xhr.setRequestHeader(k, headers[k]);
        }
      });

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            resolve({ success: true });
          }
        } else {
          let errDetail = `Erro HTTP ${xhr.status}`;
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.detail) errDetail = data.detail;
          } catch {}
          reject(new Error(errDetail));
        }
      };

      xhr.onerror = () => reject(new Error('Erro de conexão durante o upload para a Nuvem.'));
      xhr.ontimeout = () => reject(new Error('Tempo esgotado no upload para a Nuvem.'));

      xhr.send(formData);
    } catch (err) {
      reject(err);
    }
  });
}

export async function submitCloudBulkSchedule(vpsUrl, apiKey, payload) {
  const targetUrl = vpsUrl || CLOUD_SERVER_URL;
  const cleanUrl = targetUrl.replace(/\/+$/, '');
  const headers = buildCloudHeaders(apiKey, { 'Content-Type': 'application/json' });

  const res = await fetch(`${cleanUrl}/api/posts/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao registrar agendamentos na Nuvem (${res.status})`);
  }

  return await res.json();
}

export async function submitCloudPost(vpsUrl, apiKey, payload) {
  const targetUrl = vpsUrl || CLOUD_SERVER_URL;
  const cleanUrl = targetUrl.replace(/\/+$/, '');
  const headers = buildCloudHeaders(apiKey, { 'Content-Type': 'application/json' });

  const res = await fetch(`${cleanUrl}/api/posts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao registrar agendamento na Nuvem (${res.status})`);
  }

  return await res.json();
}
