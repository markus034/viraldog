/**
 * Cloud Sync Utility — Handles VPS 24/7 Publishing, Account Syncing, and Video Uploads.
 */

const STORAGE_KEY = 'viraldog_cloud_config';

export function getCloudConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, vpsUrl: '', apiKey: '' };
    return JSON.parse(raw);
  } catch {
    return { enabled: false, vpsUrl: '', apiKey: '' };
  }
}

export function saveCloudConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving cloud config to localStorage:', e);
  }

  // Persistir no banco de dados SQLite do backend
  try {
    fetch('http://localhost:8000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          cloud_enabled: String(Boolean(config?.enabled)),
          cloud_vps_url: String(config?.vpsUrl || ''),
          cloud_api_key: String(config?.apiKey || ''),
        }
      })
    }).catch(err => console.warn('Could not persist cloud config to backend:', err));
  } catch (e) {
    console.warn('Could not post cloud config to backend:', e);
  }
}

export async function testCloudConnection(vpsUrl, apiKey) {
  if (!vpsUrl) throw new Error('URL da VPS não informada.');
  
  const cleanUrl = vpsUrl.replace(/\/+$/, '');
  const headers = {};
  if (apiKey) {
    headers['X-ViralDog-Key'] = apiKey.trim();
  }

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
  const cleanUrl = vpsUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-ViralDog-Key'] = apiKey.trim();
  }

  const res = await fetch(`${cleanUrl}/api/cloud/sync-account`, {
    method: 'POST',
    headers,
    body: JSON.stringify(accountData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao sincronizar conta com a VPS (${res.status})`);
  }

  return await res.json();
}

/**
 * Uploads a video file from local path or blob to the VPS with progress tracking.
 */
export function uploadVideoToCloud(vpsUrl, apiKey, videoPathOrBlob, filename, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const cleanUrl = vpsUrl.replace(/\/+$/, '');
      const uploadEndpoint = `${cleanUrl}/api/cloud/upload-video`;

      let fileBlob = videoPathOrBlob;

      // If it's a file path string (Electron), read it via fetch or electron file protocol
      if (typeof videoPathOrBlob === 'string') {
        const localUrl = `http://localhost:8000/api/videos/file?path=${encodeURIComponent(videoPathOrBlob)}`;
        const fileRes = await fetch(localUrl);
        if (!fileRes.ok) {
          throw new Error(`Não foi possível ler o arquivo local: ${videoPathOrBlob}`);
        }
        fileBlob = await fileRes.blob();
      }

      const formData = new FormData();
      formData.append('file', fileBlob, filename || 'video.mp4');
      if (filename) {
        formData.append('custom_name', filename);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadEndpoint);

      if (apiKey) {
        xhr.setRequestHeader('X-ViralDog-Key', apiKey.trim());
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent, e.loaded, e.total);
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

      xhr.onerror = () => reject(new Error('Erro de conexão durante o upload para a VPS.'));
      xhr.ontimeout = () => reject(new Error('Tempo esgotado no upload para a VPS.'));

      xhr.send(formData);
    } catch (err) {
      reject(err);
    }
  });
}

export async function submitCloudBulkSchedule(vpsUrl, apiKey, payload) {
  const cleanUrl = vpsUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-ViralDog-Key'] = apiKey.trim();
  }

  const res = await fetch(`${cleanUrl}/api/posts/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao registrar agendamentos na VPS (${res.status})`);
  }

  return await res.json();
}

export async function submitCloudPost(vpsUrl, apiKey, payload) {
  const cleanUrl = vpsUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-ViralDog-Key'] = apiKey.trim();
  }

  const res = await fetch(`${cleanUrl}/api/posts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Erro ao registrar agendamento na VPS (${res.status})`);
  }

  return await res.json();
}
