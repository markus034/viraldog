import React, { useState, useEffect } from 'react';
import CustomSelect from './CustomSelect';
import ConfirmModal from './ConfirmModal';
import { getCloudConfig, saveCloudConfig, testCloudConnection, syncAccountToCloud } from '../utils/cloudSync';

const API = 'http://localhost:8000';

// Parser inteligente de proxy
function parseProxyInput(raw) {
  if (!raw) return '';
  let s = raw.trim();
  const curlMatch = s.match(/--proxy\s+["']?([^"'\s]+)["']?/);
  if (curlMatch) s = curlMatch[1];
  s = s.replace(/\/$/, '');
  const withScheme = s.match(/^(https?|socks[45]?):(\/\/)?(.+)/);
  if (withScheme) {
    const proto = withScheme[1] === 'https' ? 'http' : withScheme[1];
    return `${proto}://${withScheme[3]}`;
  }
  const fourParts = s.match(/^([^:@]+):(\d+):([^:@]+):(.+)$/);
  if (fourParts) {
    const [, host, port, user, pass] = fourParts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  if (s.includes('@')) return `http://${s}`;
  if (/^[^:]+:\d+$/.test(s)) return `http://${s}`;
  return s;
}

export default function Settings({ triggerToast, onOpenGlobalBrowser }) {
  const [accounts, setAccounts] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newCookies, setNewCookies] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  // Confirm Modal States
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOutIg, setLoggingOutIg] = useState(false);

  // Cloud 24/7 VPS State
  const [cloudConfig, setCloudConfig] = useState(() => getCloudConfig());
  const [testingCloud, setTestingCloud] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(null);

  // Instagram Session State
  const [igLoggedIn, setIgLoggedIn] = useState(false);
  const [igLoggingIn, setIgLoggingIn] = useState(false);
  const isElectron = !!(window.electronAPI);

  // Account Profile Editing
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileData, setProfileData] = useState({
    proxy_url: '',
    caption_style: '',
    posting_schedule: '[]',
    timezone: 'America/Sao_Paulo',
    auto_repost_enabled: false,
    auto_repost_days: 30,
    min_engagement_for_repost: 5.0,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);

  // App Configs
  const [configs, setConfigs] = useState({
    openai_api_key: '',
    gemini_api_key: '',
    anthropic_api_key: '',
    active_ai_provider: 'openai',
    caption_prompt_template: '',
    output_directory: '',
    download_directory: '',
    edited_directory: '',
    whisper_mode: 'api',
    whisper_model_size: 'base',
    auto_repost_global: 'false',
    analytics_collect_interval_hours: '6',
    meta_app_id: '',
    meta_app_secret: '',
    public_media_base_url: '',
  });
  const [savingConfigs, setSavingConfigs] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchConfigs();

    const handleSync = () => fetchAccounts();
    window.addEventListener('viraldog:accounts-updated', handleSync);
    window.addEventListener('focus', handleSync);

    // Verificar sessão do Instagram ao montar
    if (isElectron && window.electronAPI.checkInstagramSession) {
      window.electronAPI.checkInstagramSession().then((res) => {
        setIgLoggedIn(res.loggedIn);
      });
      // Escutar notificação de login concluído
      window.electronAPI.onLoginComplete((data) => {
        if (data.success) {
          setIgLoggedIn(true);
          setIgLoggingIn(false);
          triggerToast('✅ Login no Instagram realizado com sucesso!', 'success');
        }
      });
    }
    return () => {
      window.removeEventListener('viraldog:accounts-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      if (isElectron && window.electronAPI.removeLoginComplete) {
        window.electronAPI.removeLoginComplete();
      }
    };
  }, []);


  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${API}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => ({ ...prev, ...data }));
        if (isElectron && window.electronAPI.setDownloadFolder && data.download_directory) {
          window.electronAPI.setDownloadFolder(data.download_directory);
        }

        // Sincronizar estado da Nuvem 24/7 com o backend
        if (data.cloud_enabled !== undefined || data.cloud_vps_url !== undefined) {
          const loadedCloud = {
            enabled: data.cloud_enabled === 'true',
            vpsUrl: data.cloud_vps_url || '',
            apiKey: data.cloud_api_key || '',
          };
          setCloudConfig(loadedCloud);
          saveCloudConfig(loadedCloud);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };


  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newUsername || !newCookies) return;

    try {
      JSON.parse(newCookies);
    } catch (err) {
      triggerToast("O Cookie de Sessão deve ser um formato JSON válido.", "error");
      return;
    }

    setSavingAccount(true);
    try {
      const res = await fetch(`${API}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.replace('@', '').trim(),
          cookies_json: newCookies.trim()
        })
      });
      if (res.ok) {
        triggerToast(`Conta @${newUsername} adicionada com sucesso.`, "success");
        setNewUsername('');
        setNewCookies('');
        fetchAccounts();
      } else {
        triggerToast("Falha ao salvar conta.", "error");
      }
    } catch (err) {
      triggerToast("Erro de rede.", "error");
    } finally {
      setSavingAccount(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (!accountToDelete) return;
    setDeletingAccount(true);
    try {
      const res = await fetch(`${API}/api/accounts/${accountToDelete.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        triggerToast(`Conta @${accountToDelete.display_name || accountToDelete.username} removida com sucesso.`, "success");
        if (editingProfile?.id === accountToDelete.id) setEditingProfile(null);
        fetchAccounts();
        setAccountToDelete(null);
      } else {
        triggerToast("Falha ao remover conta.", "error");
      }
    } catch (e) {
      triggerToast("Erro ao remover conta.", "error");
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleEditProfile = async (account) => {
    setEditingProfile(account);
    try {
      const res = await fetch(`${API}/api/accounts/${account.id}/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfileData({
          proxy_url: data.proxy_url || '',
          caption_style: data.caption_style || '',
          posting_schedule: typeof data.posting_schedule === 'string' ? data.posting_schedule : JSON.stringify(data.posting_schedule || []),
          timezone: data.timezone || 'America/Sao_Paulo',
          auto_repost_enabled: data.auto_repost_enabled || false,
          auto_repost_days: data.auto_repost_days || 30,
          min_engagement_for_repost: data.min_engagement_for_repost || 5.0,
        });
      }
    } catch (e) {
      console.error(e);
      triggerToast("Erro ao carregar perfil da conta.", "error");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editingProfile) return;
    setSavingProfile(true);
    try {
      let scheduleStr = profileData.posting_schedule;
      if (scheduleStr) {
        try {
          JSON.parse(scheduleStr);
        } catch (err) {
          triggerToast("Cronograma de postagem deve ser um JSON válido.", "error");
          setSavingProfile(false);
          return;
        }
      }

      const res = await fetch(`${API}/api/accounts/${editingProfile.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxy_url: parseProxyInput(profileData.proxy_url) || null,
          caption_style: profileData.caption_style || null,
          posting_schedule: scheduleStr || null,
          timezone: profileData.timezone || null,
          auto_repost_enabled: profileData.auto_repost_enabled,
          auto_repost_days: parseInt(profileData.auto_repost_days) || 30,
          min_engagement_for_repost: parseFloat(profileData.min_engagement_for_repost) || 5.0,
        })
      });
      if (res.ok) {
        triggerToast("Perfil da conta atualizado com sucesso.", "success");
        setEditingProfile(null);
        fetchAccounts();
      } else {
        triggerToast("Falha ao salvar perfil.", "error");
      }
    } catch (err) {
      triggerToast("Erro de rede.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTestProxy = async () => {
    if (!profileData.proxy_url) {
      triggerToast("Nenhum proxy configurado para testar.", "error");
      return;
    }
    setTestingProxy(true);
    try {
      const formData = new FormData();
      formData.append('proxy_url', profileData.proxy_url);
      const res = await fetch(`${API}/api/proxy/test`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        if (data.working) {
          triggerToast(`Proxy funcionando! IP: ${data.ip} - Latência: ${data.latency_ms}ms`, "success");
        } else {
          triggerToast(`Proxy com erro: ${data.error}`, "error");
        }
      } else {
        triggerToast("Erro ao testar proxy.", "error");
      }
    } catch (e) {
      triggerToast("Erro de conexão.", "error");
    } finally {
      setTestingProxy(false);
    }
  };

  const handleSaveConfigs = async (e) => {
    e.preventDefault();
    setSavingConfigs(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: configs })
      });
      if (res.ok) {
        triggerToast("Definições globais salvas com sucesso.", "success");
        fetchConfigs();
        if (isElectron && window.electronAPI.setDownloadFolder && configs.download_directory) {
          window.electronAPI.setDownloadFolder(configs.download_directory);
        }
      } else {
        triggerToast("Erro ao salvar definições.", "error");
      }
    } catch (err) {
      triggerToast("Erro de rede.", "error");
    } finally {
      setSavingConfigs(false);
    }
  };

  const handleConfigChange = (key, value) => {
    setConfigs({ ...configs, [key]: value });
  };

  const handleIgLogin = async () => {
    if (onOpenGlobalBrowser) {
      onOpenGlobalBrowser();
    } else if (isElectron && window.electronAPI.openInstagramLogin) {
      setIgLoggingIn(true);
      triggerToast('Abrindo navegador integrado...', 'info');
      const result = await window.electronAPI.openInstagramLogin();
      setIgLoggingIn(false);
      if (result.success) setIgLoggedIn(true);
    }
  };

  const handleIgLogout = () => {
    if (!isElectron || !window.electronAPI.logoutInstagram) return;
    setShowLogoutConfirm(true);
  };

  const handleConfirmIgLogout = async () => {
    if (!isElectron || !window.electronAPI.logoutInstagram) return;
    setLoggingOutIg(true);
    try {
      const result = await window.electronAPI.logoutInstagram();
      if (result.success) {
        setIgLoggedIn(false);
        triggerToast('Sessão do Instagram encerrada.', 'success');
        setShowLogoutConfirm(false);
      } else {
        triggerToast('Erro ao encerrar sessão.', 'error');
      }
    } catch (err) {
      triggerToast('Erro ao encerrar sessão.', 'error');
    } finally {
      setLoggingOutIg(false);
    }
  };

  const handleTestCloud = async () => {
    if (!cloudConfig.vpsUrl) {
      triggerToast('Informe a URL da VPS para testar a conexão.', 'error');
      return;
    }
    setTestingCloud(true);
    try {
      const data = await testCloudConnection(cloudConfig.vpsUrl, cloudConfig.apiKey);
      setCloudStatus(data);
      if (data.authenticated === false) {
        triggerToast('⚠️ Conectado à VPS, porém a Chave de API é inválida.', 'error');
      } else {
        triggerToast(`🟢 Conectado à VPS com sucesso! (${data.app} v${data.version})`, 'success');
      }
    } catch (err) {
      setCloudStatus({ status: 'offline', error: err.message });
      triggerToast(`🔴 Falha ao conectar à VPS: ${err.message}`, 'error');
    } finally {
      setTestingCloud(false);
    }
  };

  const handleSaveCloudConfig = async (e) => {
    if (e) e.preventDefault();
    saveCloudConfig(cloudConfig);

    // Salvar também via /api/settings diretamente
    try {
      await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            cloud_enabled: String(Boolean(cloudConfig.enabled)),
            cloud_vps_url: String(cloudConfig.vpsUrl || ''),
            cloud_api_key: String(cloudConfig.apiKey || ''),
          }
        })
      });
    } catch (err) {
      console.warn('Erro ao salvar cloud config no backend:', err);
    }

    triggerToast('Configurações da Nuvem salvas!', 'success');

    // Se estiver ativo e com VPS configurada, sincronizar contas cadastradas com a VPS
    if (cloudConfig.enabled && cloudConfig.vpsUrl && accounts.length > 0) {
      try {
        let syncedCount = 0;
        for (const acc of accounts) {
          try {
            await syncAccountToCloud(cloudConfig.vpsUrl, cloudConfig.apiKey, acc);
            syncedCount++;
          } catch (e) {
            console.error(`Erro ao sincronizar conta @${acc.username}:`, e);
          }
        }
        if (syncedCount > 0) {
          triggerToast(`☁️ ${syncedCount} conta(s) sincronizada(s) com a VPS!`, 'success');
        }
      } catch (err) {
        console.error('Erro na sincronização de contas:', err);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="mb-2">
        <h1 className="text-headline-lg font-bold text-text-primary tracking-tight" style={{ fontSize: '32px' }}>Definições</h1>
        <p className="text-body-sm text-text-secondary mt-1">Gerencie suas chaves de API, contas do Instagram, proxies e diretórios locais.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Side: Accounts Management & Profile Editing */}
        <div className="flex flex-col gap-6">

          {/* ─── Card: Sessão do Instagram (IG Saver) ─── */}
          {isElectron && (
            <div className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4 ${
              igLoggedIn ? 'border-[#0071E3]/20' : 'border-outline-variant/30'
            }`}>
              <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3 flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#86868B]">lock</span>
                  Sessão do Instagram
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  igLoggedIn ? 'bg-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/20' : 'bg-[#F5F5F7] text-[#86868B] border border-[#86868B]/20'
                }`}>
                  {igLoggedIn ? '● Conectado' : '○ Desconectado'}
                </span>
              </div>

              {igLoggedIn ? (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 bg-[#0071E3]/5 border border-[#0071E3]/10 rounded-xl text-xs text-[#1D1D1F] leading-relaxed font-medium">
                    Sua sessão está ativa. Vá para a aba <strong className="text-[#0071E3]">Baixar</strong> para usar o IG Saver com sua conta de forma integrada.
                  </div>
                  <button
                    onClick={handleIgLogout}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-text-primary border border-outline-variant/30 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    Encerrar Sessão
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 bg-[#F5F5F7] border border-[#86868B]/10 rounded-xl text-xs text-[#1D1D1F] leading-relaxed font-medium">
                    Faça login para que o navegador integrado em <strong className="text-[#0071E3]">Baixar</strong> identifique sua sessão e execute a automação do IG Saver.
                  </div>
                  <button
                    onClick={handleIgLogin}
                    disabled={igLoggingIn}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#0071E3] hover:bg-[#005cbb] text-white flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-40"
                  >
                    {igLoggingIn ? (
                      <>
                        <div className="spinner !border-white/20 !border-t-white"></div>
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">login</span>
                        <span>Fazer Login no Instagram</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {editingProfile ? (
            <div className="bg-white border border-[#0071E3]/40 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3 flex justify-between items-center">
                <span>⚙️ Perfil: @{editingProfile.username}</span>
                <button 
                  onClick={() => setEditingProfile(null)}
                  className="text-xs text-[#0071E3] hover:underline font-semibold"
                >
                  Voltar
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-primary">Proxy Dedicado (HTTP/Socks)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="http://user:pass@ip:port"
                      value={profileData.proxy_url}
                      onChange={e => setProfileData({ ...profileData, proxy_url: e.target.value })}
                      className="flex-1 p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                    />
                    <button 
                      type="button" 
                      onClick={handleTestProxy} 
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center justify-center transition-all shadow-xs"
                      disabled={testingProxy}
                    >
                      {testingProxy ? <div className="spinner"></div> : "Testar"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-primary">Fuso Horário</label>
                  <input 
                    type="text" 
                    value={profileData.timezone}
                    onChange={e => setProfileData({ ...profileData, timezone: e.target.value })}
                    className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                  />
                </div>

                <div className="border-t border-outline-variant/10 pt-3">
                  <label className="flex justify-between items-center cursor-pointer">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-text-primary">Repostagem Automática Inteligente</span>
                      <span className="text-[10px] text-text-secondary">Reposta conteúdos com alto engajamento</span>
                    </div>
                    <div className="relative inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={profileData.auto_repost_enabled}
                        onChange={e => setProfileData({ ...profileData, auto_repost_enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-container-high rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0071E3]"></div>
                    </div>
                  </label>
                </div>

                {profileData.auto_repost_enabled && (
                  <div className="grid grid-cols-2 gap-3 bg-surface-off-white/50 p-3 rounded-xl border border-outline-variant/20">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-primary uppercase tracking-wide">Dias Mínimos</label>
                      <input 
                        type="number" 
                        value={profileData.auto_repost_days}
                        onChange={e => setProfileData({ ...profileData, auto_repost_days: e.target.value })}
                        className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-primary uppercase tracking-wide">Engajamento Mínimo (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={profileData.min_engagement_for_repost}
                        onChange={e => setProfileData({ ...profileData, min_engagement_for_repost: e.target.value })}
                        className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-primary">Horários de Postagem (JSON)</label>
                  <textarea 
                    placeholder='[{"day": "mon", "times": ["09:00", "18:00"]}]'
                    value={profileData.posting_schedule}
                    onChange={e => setProfileData({ ...profileData, posting_schedule: e.target.value })}
                    className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-mono min-h-[70px] shadow-xs"
                  />
                </div>

                <div className="flex gap-2.5 border-t border-outline-variant/10 pt-4 mt-2">
                  <button 
                    type="submit" 
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#0071E3] hover:bg-[#005cbb] text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    disabled={savingProfile}
                  >
                    {savingProfile && <div className="spinner !border-white/20 !border-t-white"></div>}
                    <span>Salvar Perfil</span>
                  </button>
                  <button 
                    type="button" 
                    className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-text-primary border border-outline-variant/30"
                    onClick={() => setEditingProfile(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3">
                Contas Vinculadas
              </div>
              {accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-text-secondary gap-2 py-10 text-center">
                  <span className="material-symbols-outlined text-[36px] opacity-40">account_circle</span>
                  <p className="text-xs font-semibold">Nenhuma conta cadastrada.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {accounts.map(acc => {
                    const avatarSrc = acc.avatar_url ? (acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`) : null;
                    return (
                      <div 
                        key={acc.id} 
                        className="flex items-center justify-between p-3.5 bg-surface-off-white border border-outline-variant/20 rounded-xl"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[1.5px] shrink-0 shadow-xs">
                            <div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">
                              {avatarSrc ? (
                                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0071E3] to-[#4da3ff] flex items-center justify-center text-white text-[10px] font-extrabold">
                                  {acc.username ? acc.username.charAt(0).toUpperCase() : 'U'}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-text-primary truncate">@{acc.display_name || acc.username}</div>
                            {acc.proxy_url && (
                              <div className="text-[10px] text-[#0071E3] font-semibold mt-0.5 truncate max-w-[200px]" title={acc.proxy_url}>
                                Proxy: {acc.proxy_url.split('@').pop()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <button 
                            onClick={() => handleEditProfile(acc)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-white hover:bg-surface-off-white text-text-primary border border-outline-variant/40 shadow-sm transition-all flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[12px]">settings</span>
                            Perfil
                          </button>
                          <button 
                            onClick={() => setAccountToDelete(acc)}
                            className="text-[10px] text-rose-600 hover:text-rose-700 font-bold transition-colors cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Global System Settings */}
        <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="text-sm font-bold text-text-primary border-b border-outline-variant/20 pb-3">
            Configurações Globais
          </div>
          <form onSubmit={handleSaveConfigs} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-primary">Diretório de Vídeos Baixados</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={configs.download_directory || ''} 
                  onChange={e => handleConfigChange('download_directory', e.target.value)} 
                  className="flex-1 p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                  required
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
                        try {
                          await fetch(`${API}/api/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ settings: { ...configs, download_directory: path } })
                          });
                          triggerToast("Diretório de vídeos baixados atualizado!", "success");
                        } catch (err) {
                          console.error(err);
                        }
                      }
                    }}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center gap-1.5 shrink-0 transition-all shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    Escolher
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-primary">Diretório de Vídeos Editados</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={configs.edited_directory || ''} 
                  onChange={e => handleConfigChange('edited_directory', e.target.value)} 
                  className="flex-1 p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                  required
                />
                {isElectron && (
                  <button
                    type="button"
                    onClick={async () => {
                      const path = await window.electronAPI.selectDirectory();
                      if (path) {
                        handleConfigChange('edited_directory', path);
                        try {
                          await fetch(`${API}/api/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ settings: { ...configs, edited_directory: path } })
                          });
                          triggerToast("Diretório de vídeos editados atualizado!", "success");
                        } catch (err) {
                          console.error(err);
                        }
                      }
                    }}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center gap-1.5 shrink-0 transition-all shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    Escolher
                  </button>
                )}
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-[#0071E3] hover:bg-[#005cbb] text-white disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-sm transition-all mt-4 cursor-pointer" 
              disabled={savingConfigs}
            >
              {savingConfigs && <div className="spinner !border-white/20 !border-t-white"></div>}
              <span>Salvar Configurações</span>
            </button>
          </form>

          {/* ─── Card: Nuvem 24/7 (Publicar com PC Desligado) ─── */}
          <div className="mt-4 pt-4 border-t border-outline-variant/20 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">cloud</span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Nuvem 24/7 (Publicar com PC Desligado)</h3>
                  <p className="text-[10px] text-text-secondary">Sincronize agendamentos com sua VPS para postar mesmo desligado.</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloudConfig.enabled}
                  onChange={(e) => {
                    const next = { ...cloudConfig, enabled: e.target.checked };
                    setCloudConfig(next);
                    saveCloudConfig(next);
                    triggerToast(next.enabled ? 'Modo Nuvem 24/7 ativado!' : 'Modo Nuvem 24/7 desativado (usando local).', 'info');
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-container-high rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0071E3]"></div>
              </label>
            </div>

            {cloudConfig.enabled && (
              <div className="flex flex-col gap-3 p-3.5 bg-[#F5F5F7] rounded-xl border border-outline-variant/20 animate-in fade-in duration-150">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-text-primary">URL da VPS / Servidor Cloud</label>
                  <input
                    type="text"
                    placeholder="Ex: http://123.45.67.89:8000 ou https://vps.seudominio.com"
                    value={cloudConfig.vpsUrl}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, vpsUrl: e.target.value })}
                    className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-text-primary">Chave de Segurança (VIRALDOG_API_KEY)</label>
                  <input
                    type="password"
                    placeholder="Chave secreta configurada no .env da VPS"
                    value={cloudConfig.apiKey}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, apiKey: e.target.value })}
                    className="w-full p-2.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-xl text-xs text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-xs font-mono"
                  />
                </div>

                {cloudStatus && (
                  <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-between ${
                    cloudStatus.status === 'online' && cloudStatus.authenticated !== false
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">
                        {cloudStatus.status === 'online' ? 'check_circle' : 'error'}
                      </span>
                      <span>
                        {cloudStatus.status === 'online'
                          ? `VPS Online (${cloudStatus.stats?.pending_posts || 0} na fila, ${cloudStatus.stats?.accounts_count || 0} contas)`
                          : `Erro: ${cloudStatus.error || 'Não foi possível conectar'}`}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestCloud}
                    disabled={testingCloud}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-text-primary flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    {testingCloud ? <div className="spinner"></div> : <span className="material-symbols-outlined text-[15px]">sensors</span>}
                    <span>Testar Conexão</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCloudConfig}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#0071E3] hover:bg-[#005cbb] text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">cloud_sync</span>
                    <span>Salvar & Sincronizar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Modal de Confirmação de Exclusão de Conta */}
      <ConfirmModal
        isOpen={!!accountToDelete}
        onClose={() => !deletingAccount && setAccountToDelete(null)}
        onConfirm={handleConfirmDeleteAccount}
        title="Remover Conta do Instagram?"
        description="Esta conta será desvinculada do ViralDog. Agendamentos futuros associados a ela poderão ser afetados."
        confirmText="Sim, Remover Conta"
        cancelText="Cancelar"
        type="danger"
        icon="no_accounts"
        isLoading={deletingAccount}
        itemDetails={accountToDelete ? {
          title: `@${accountToDelete.display_name || accountToDelete.username}`,
          account: accountToDelete.proxy_url ? `Proxy: ${accountToDelete.proxy_url.split('@').pop()}` : 'Conta conectada',
          icon: 'account_circle'
        } : null}
      />

      {/* Modal de Confirmação de Logout do Instagram */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => !loggingOutIg && setShowLogoutConfirm(false)}
        onConfirm={handleConfirmIgLogout}
        title="Encerrar Sessão do Instagram?"
        description="Você será desconectado da sessão ativa do Instagram neste computador. Os cookies locais serão apagados."
        confirmText="Sim, Encerrar Sessão"
        cancelText="Manter Conectado"
        type="warning"
        icon="logout"
        isLoading={loggingOutIg}
      />
    </div>
  );
}
