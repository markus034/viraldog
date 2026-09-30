import React, { useState, useEffect } from 'react';

const API = 'http://localhost:8000';

export default function Settings({ triggerToast }) {
  const isElectron = !!(window.electronAPI);

  // App Configs
  const [configs, setConfigs] = useState({
    download_directory: '',
    edited_directory: '',
    cloud_worker_url: '',
    cloud_worker_secret: '',
    s3_endpoint_url: '',
    s3_bucket_name: '',
    s3_access_key: '',
    s3_secret_key: '',
    s3_public_base_url: '',
  });
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [testingWorker, setTestingWorker] = useState(false);
  const [workerStatus, setWorkerStatus] = useState(null); // { status: 'success' | 'error', message: '' }
  const [showDeployHelp, setShowDeployHelp] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${API}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => ({
          ...prev,
          ...data,
        }));
        if (isElectron && window.electronAPI.setDownloadFolder && data.download_directory) {
          window.electronAPI.setDownloadFolder(data.download_directory);
        }
        if (data.cloud_worker_url) {
          checkWorkerStatus(data.cloud_worker_url, data.cloud_worker_secret);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
    }
  };

  const checkWorkerStatus = async (url, secret) => {
    if (!url) return;
    try {
      const res = await fetch(`${API}/api/cloud/test-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_url: url, worker_secret: secret || '' })
      });
      const data = await res.json();
      setWorkerStatus(data);
    } catch (err) {
      setWorkerStatus({ status: 'error', message: 'Falha ao conectar com o Worker.' });
    }
  };

  const handleConfigChange = (key, value) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const handleTestWorker = async () => {
    if (!configs.cloud_worker_url) {
      triggerToast('Informe a URL do Cloud Worker antes de testar.', 'warning');
      return;
    }
    setTestingWorker(true);
    try {
      const res = await fetch(`${API}/api/cloud/test-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_url: configs.cloud_worker_url,
          worker_secret: configs.cloud_worker_secret || ''
        })
      });
      const data = await res.json();
      setWorkerStatus(data);
      if (data.status === 'success') {
        triggerToast('✅ Conexão com o Cloud Worker estabelecida com sucesso!', 'success');
      } else {
        triggerToast(`❌ ${data.message || 'Falha na conexão com o Cloud Worker.'}`, 'error');
      }
    } catch (err) {
      triggerToast('Erro de rede ao conectar com o Cloud Worker.', 'error');
      setWorkerStatus({ status: 'error', message: 'Servidor inacessível.' });
    } finally {
      setTestingWorker(false);
    }
  };

  const handleSaveConfigs = async (e) => {
    if (e) e.preventDefault();
    setSavingConfigs(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: configs })
      });
      if (res.ok) {
        triggerToast('Definições salvas com sucesso! ✅', 'success');
        fetchConfigs();
        if (isElectron && window.electronAPI.setDownloadFolder && configs.download_directory) {
          window.electronAPI.setDownloadFolder(configs.download_directory);
        }
      } else {
        triggerToast('Erro ao salvar definições.', 'error');
      }
    } catch (err) {
      triggerToast('Erro de rede ao salvar definições.', 'error');
    } finally {
      setSavingConfigs(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/15 pb-4">
        <div>
          <h1 className="text-headline-lg font-bold text-text-primary tracking-tight" style={{ fontSize: '30px' }}>
            Definições do Sistema
          </h1>
          <p className="text-body-sm text-text-secondary mt-1">
            Configure o agendamento em nuvem 24/7, armazenamento Cloudflare R2/S3 e diretórios de mídia.
          </p>
        </div>
        <button
          onClick={handleSaveConfigs}
          disabled={savingConfigs}
          className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#0071E3] hover:bg-[#005cbb] text-white disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer shrink-0 self-start sm:self-auto"
        >
          {savingConfigs ? (
            <div className="spinner !border-white/20 !border-t-white" />
          ) : (
            <span className="material-symbols-outlined text-[18px]">save</span>
          )}
          <span>Salvar Alterações</span>
        </button>
      </div>

      <form onSubmit={handleSaveConfigs} className="flex flex-col gap-6">
        {/* ── CARD 1: Agendador em Nuvem 24/7 (PC Desligado) ── */}
        <div className="bg-white border border-[#0071E3]/25 rounded-2xl p-6 shadow-xs flex flex-col gap-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#0071E3]/5 rounded-bl-full pointer-events-none" />
          
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3.5">
            <div className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-[#0071E3]">cloud_sync</span>
              <span>Agendamento em Nuvem 24/7 (Publicar com PC Desligado)</span>
            </div>
            {workerStatus && (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                workerStatus.status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${workerStatus.status === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {workerStatus.status === 'success' ? 'Worker Nuvem Conectado 🟢' : 'Desconectado 🔴'}
              </span>
            )}
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            Com o <strong>Cloud Worker</strong> ativado, seus vídeos agendados são enviados para a nuvem e a publicação no Instagram é acionada no horário exato pela <strong>Meta Graph API</strong>, mesmo que seu computador esteja <strong>desligado ou sem internet</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary flex items-center gap-1">
                <span>URL do Cloud Worker</span>
                <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text" 
                value={configs.cloud_worker_url || ''} 
                onChange={e => handleConfigChange('cloud_worker_url', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="https://seu-worker.up.railway.app"
              />
              <span className="text-[10px] text-text-tertiary">URL gerada no Railway, Render ou VPS.</span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary flex items-center gap-1">
                <span>Chave de Segurança (Secret Key)</span>
                <span className="text-rose-500">*</span>
              </label>
              <input 
                type="password" 
                value={configs.cloud_worker_secret || ''} 
                onChange={e => handleConfigChange('cloud_worker_secret', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="Chave secreta configurada no worker"
              />
              <span className="text-[10px] text-text-tertiary">A mesma chave configurada na variável WORKER_SECRET_KEY.</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={() => setShowDeployHelp(!showDeployHelp)}
              className="text-xs text-[#0071E3] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">help</span>
              {showDeployHelp ? 'Ocultar instruções de deploy' : 'Como criar seu Cloud Worker grátis (Railway / Render)?'}
            </button>

            <button
              type="button"
              onClick={handleTestWorker}
              disabled={testingWorker}
              className="px-4 py-2 bg-[#F5F5F7] hover:bg-[#E8E8ED] border border-[#D2D2D7] rounded-xl text-xs font-bold text-text-primary flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {testingWorker ? (
                <div className="spinner !w-3 !h-3" />
              ) : (
                <span className="material-symbols-outlined text-[16px] text-[#0071E3]">network_ping</span>
              )}
              <span>Testar Conexão com Nuvem</span>
            </button>
          </div>

          {showDeployHelp && (
            <div className="bg-[#F5F5F7] border border-outline-variant/20 rounded-xl p-4 text-xs text-text-secondary flex flex-col gap-2.5 animate-fadeIn">
              <span className="font-bold text-text-primary text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-[#0071E3]">rocket_launch</span>
                Deploy em 2 minutos no Railway ou Render:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                <li>Acesse <strong>railway.app</strong> ou <strong>render.com</strong> e crie uma conta gratuita.</li>
                <li>Faça o deploy apontando para a pasta <code>cloud_worker/</code> do projeto ViralDog.</li>
                <li>Configure a variável de ambiente <code>WORKER_SECRET_KEY</code> com uma senha segura.</li>
                <li>Copie a URL pública gerada (ex: <code>https://viraldog-cloud.up.railway.app</code>) e cole no campo acima.</li>
                <li>Clique em <strong>Testar Conexão</strong> e depois em <strong>Salvar Alterações</strong>.</li>
              </ol>
            </div>
          )}
        </div>

        {/* ── CARD 2: Armazenamento Cloudflare R2 / AWS S3 ── */}
        <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3.5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#0071E3]">cloud</span>
            <span>Armazenamento em Nuvem (Cloudflare R2 / AWS S3)</span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            A API Oficial da Meta exige que os vídeos e imagens estejam hospedados em um link público seguro no momento da publicação.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary">Endpoint S3 / R2</label>
              <input 
                type="text" 
                value={configs.s3_endpoint_url || ''} 
                onChange={e => handleConfigChange('s3_endpoint_url', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="https://<account_id>.r2.cloudflarestorage.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary">Nome do Bucket</label>
              <input 
                type="text" 
                value={configs.s3_bucket_name || ''} 
                onChange={e => handleConfigChange('s3_bucket_name', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="viraldog-media"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary">Access Key ID</label>
              <input 
                type="text" 
                value={configs.s3_access_key || ''} 
                onChange={e => handleConfigChange('s3_access_key', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="Access Key ID"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-primary">Secret Access Key</label>
              <input 
                type="password" 
                value={configs.s3_secret_key || ''} 
                onChange={e => handleConfigChange('s3_secret_key', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="Secret Access Key"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="text-xs font-semibold text-text-primary">URL Base Pública (R2 Public Dev Domain / CDN)</label>
              <input 
                type="text" 
                value={configs.s3_public_base_url || ''} 
                onChange={e => handleConfigChange('s3_public_base_url', e.target.value)} 
                className="p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono"
                placeholder="https://pub-xxxx.r2.dev"
              />
            </div>
          </div>
        </div>

        {/* ── CARD 3: Diretórios Locais de Mídia ── */}
        <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs flex flex-col gap-5">
          <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3.5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#0071E3]">folder</span>
            <span>Diretórios Locais de Mídia</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-primary">Diretório de Vídeos Baixados</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={configs.download_directory || ''} 
                onChange={e => handleConfigChange('download_directory', e.target.value)} 
                className="flex-1 p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs font-mono"
                placeholder="C:\Users\...\Videos\baixados"
              />
              {isElectron && (
                <button
                  type="button"
                  onClick={async () => {
                    const path = await window.electronAPI.selectDirectory();
                    if (path) {
                      handleConfigChange('download_directory', path);
                      if (isElectron && window.electronAPI.setDownloadFolder) {
                        window.electronAPI.setDownloadFolder(path);
                      }
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center gap-1.5 shrink-0 transition-all shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">folder_open</span>
                  Escolher
                </button>
              )}
            </div>
            <p className="text-[11px] text-text-secondary">Pasta onde os vídeos baixados pelo Downloader serão armazenados.</p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <label className="text-xs font-semibold text-text-primary">Diretório de Vídeos Editados</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={configs.edited_directory || ''} 
                onChange={e => handleConfigChange('edited_directory', e.target.value)} 
                className="flex-1 p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs font-mono"
                placeholder="C:\Users\...\Videos\editados"
              />
              {isElectron && (
                <button
                  type="button"
                  onClick={async () => {
                    const path = await window.electronAPI.selectDirectory();
                    if (path) {
                      handleConfigChange('edited_directory', path);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center gap-1.5 shrink-0 transition-all shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">folder_open</span>
                  Escolher
                </button>
              )}
            </div>
            <p className="text-[11px] text-text-secondary">Pasta de saída para vídeos processados e renderizados pelo Editor.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
