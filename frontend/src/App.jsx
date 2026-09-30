import React, { useState, useEffect, useRef, useCallback } from 'react';
import Downloader from './components/Downloader';
import MultiLogin from './components/MultiLogin';
import Editor from './components/editor/Editor';
import Publisher from './components/Publisher';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import LoginModal from './components/LoginModal';
import LoginScreen from './components/LoginScreen';
import logoImage from './assets/logo.jpg';
import { saveCloudConfig } from './utils/cloudSync';
import { getCurrentUser, setCurrentUser, setAuthToken, apiFetch, logoutUser } from './config';
import { pauseAllMedia } from './utils/mediaManager';

export default function App() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [toast, setToast] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [globalBrowserRequested, setGlobalBrowserRequested] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());

  // Track which tabs have been visited at least once (lazy-mount)
  const [mountedTabs, setMountedTabs] = useState(new Set(['analytics']));

  // When activeTab changes, mark it as mounted so it stays alive forever and pause all media
  useEffect(() => {
    pauseAllMedia();
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);





  useEffect(() => {
    // Buscar configurações iniciais do backend e sincronizar a pasta de download no Electron
    fetch('http://localhost:8000/api/settings')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Falha ao obter configurações');
      })
      .then(data => {
        if (data && data.download_directory && window.electronAPI && window.electronAPI.setDownloadFolder) {
          window.electronAPI.setDownloadFolder(data.download_directory);
        }
        if (data && (data.cloud_enabled !== undefined || data.cloud_vps_url !== undefined)) {
          saveCloudConfig({
            enabled: data.cloud_enabled === 'true',
            vpsUrl: data.cloud_vps_url || '',
            apiKey: data.cloud_api_key || '',
          });
        }
      })
      .catch(err => console.error('Erro ao sincronizar pasta de downloads:', err));

    // Ouvinte global para recarregar contas ao focar e pausar mídia ao desfocar/minimizar/sair
    let lastFocusSync = 0;
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusSync < 4000) return;
      lastFocusSync = now;
      window.dispatchEvent(new CustomEvent('viraldog:accounts-updated'));
    };
    const handleBlur = () => {
      pauseAllMedia();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      } else if (document.visibilityState === 'hidden') {
        pauseAllMedia();
      }
    };
    const handlePageHide = () => {
      pauseAllMedia();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Ouvinte global do Electron para pausar todas as mídias (minimize / blur / hide do Electron)
    let unsubscribePauseMedia = null;
    if (window.electronAPI?.onPauseAllMedia) {
      unsubscribePauseMedia = window.electronAPI.onPauseAllMedia(() => {
        pauseAllMedia();
      });
    }

    // Ouvinte global do Electron para logins concluídos
    let unsubscribeLogin = null;
    if (window.electronAPI?.onProfileLoginComplete) {
      unsubscribeLogin = window.electronAPI.onProfileLoginComplete(async (result) => {
        if (result?.success && result.username && result.cookiesJson) {
          try {
            // Buscar ID da conta pelo username se necessário
            const accsRes = await fetch('http://localhost:8000/api/accounts');
            if (accsRes.ok) {
              const accs = await accsRes.json();
              const cleanUser = result.username.replace(/^@/, '').trim().toLowerCase();
              const matched = accs.find(a => a.username.toLowerCase() === cleanUser);
              if (matched) {
                await fetch(`http://localhost:8000/api/accounts/${matched.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_cookies: result.cookiesJson, status: 'active' })
                });
              }
            }
          } catch (e) {
            console.error('Erro ao salvar sessão automaticamente:', e);
          }
          triggerToast(`Sessão de @${result.username} sincronizada com sucesso! ✅`, 'success');
          window.dispatchEvent(new CustomEvent('viraldog:accounts-updated', { detail: result }));
        }
      });
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (typeof unsubscribePauseMedia === 'function') unsubscribePauseMedia();
      if (typeof unsubscribeLogin === 'function') unsubscribeLogin();
    };
  }, []);

  const toastTimeoutRef = useRef(null);
  const toastExitRef = useRef(null);

  const triggerToast = useCallback((message, type = 'info') => {
    // Clear any existing timeouts
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    if (toastExitRef.current) clearTimeout(toastExitRef.current);

    setToast({ message, type, exiting: false });

    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => prev ? { ...prev, exiting: true } : null);
      toastExitRef.current = setTimeout(() => {
        setToast(null);
      }, 350);
    }, 4000);
  }, []);

  const navItems = [
    { id: 'analytics', icon: 'analytics', label: 'Analytics' },
    { id: 'downloader', icon: 'download', label: 'Baixar' },
    { id: 'multilogin', icon: 'group', label: 'Perfis' },
    { id: 'editor', icon: 'movie_edit', label: 'Editar' },
    { id: 'publisher', icon: 'calendar_today', label: 'Agendador' },
  ];

  const ViralDogLogo = () => (
    <div className="w-8 h-8 rounded-xl bg-white border border-[#E8E8EA] shadow-sm flex items-center justify-center overflow-hidden shrink-0">
      <img 
        src={logoImage} 
        alt="ViralDog Logo" 
        className="w-full h-full object-cover select-none" 
      />
    </div>
  );

  const handleLogout = () => {
    logoutUser();
    setCurrentUserState(null);
    triggerToast('Você saiu da sua conta.', 'info');
  };

  // Auth Gate: Se o usuário não estiver autenticado, exibe a tela de login obrigatória
  if (!currentUser) {
    return (
      <>
        <LoginScreen
          onLoginSuccess={(user) => {
            setCurrentUserState(user);
          }}
          triggerToast={triggerToast}
        />
        {toast && (
          <div className={`toast-enhanced ${toast.type} ${toast.exiting ? 'toast-exit' : ''}`}>
            <div className="toast-icon">
              <span className="material-symbols-outlined">
                {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
              </span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1D1D1F' }}>{toast.message}</span>
            <div className="toast-progress" />
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Navigation */}
      <aside 
        className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-1 mb-6 mt-1">
          <ViralDogLogo />
          <div className="logo-text min-w-0">
            <h1 className="text-[17px] font-bold text-[#1D1D1F] tracking-tight leading-tight">ViralDog</h1>
            <p className="text-[9px] text-[#86868B] uppercase tracking-wider font-semibold">Video Suite</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 w-full">
          <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
            {navItems.map((item) => (
              <li key={item.id} className="sidebar-nav-item">
                <button
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                    isSidebarCollapsed ? 'justify-center' : 'justify-start'
                  } ${
                    activeTab === item.id
                      ? 'bg-[#0071E3]/10 text-[#0071E3] font-semibold shadow-[inset_0_0_0_1px_rgba(0,113,227,0.12)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04] font-medium'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[20px] shrink-0"
                    style={{ fontVariationSettings: activeTab === item.id ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span className="nav-label text-left">{item.label}</span>
                </button>
                {isSidebarCollapsed && <span className="sidebar-tooltip">{item.label}</span>}
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom Section: Admin Profile + Configurações */}
        <div className="w-full pt-3 mt-auto border-t border-[#E8E8EA] flex flex-col gap-2">
          {/* Card do Usuário / Administrador (sem caixa de avatar) */}
          <div 
            className={`flex items-center rounded-2xl bg-white border border-[#E8E8EA] shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all ${
              isSidebarCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2.5'
            }`}
          >
            {!isSidebarCollapsed ? (
              <>
                <div className="min-w-0 flex-1 user-info-text pr-2">
                  <p className="text-xs font-bold text-[#1D1D1F] truncate leading-tight">
                    {currentUser.name || currentUser.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-[#86868B] truncate font-medium mt-0.5">
                    {currentUser.role === 'admin' ? '👑 Administrador' : '👤 Cliente'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair da conta"
                  className="w-7 h-7 rounded-lg hover:bg-red-50 text-[#86868B] hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">logout</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                title={`Sair (${currentUser.name || currentUser.email})`}
                className="w-7 h-7 rounded-lg hover:bg-red-50 text-[#86868B] hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
              </button>
            )}
          </div>

          {/* Botão de Configurações abaixo do card de Administrador */}
          <div className="sidebar-nav-item">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'
              } ${
                activeTab === 'settings'
                  ? 'bg-[#0071E3]/10 text-[#0071E3] font-semibold shadow-[inset_0_0_0_1px_rgba(0,113,227,0.12)]'
                  : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04] font-medium'
              }`}
            >
              <span
                className="material-symbols-outlined text-[19px] shrink-0"
                style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}
              >
                settings
              </span>
              <span className="nav-label text-left">Configurações</span>
            </button>
            {isSidebarCollapsed && <span className="sidebar-tooltip">Configurações</span>}
          </div>

          <div className="sidebar-version text-[10px] text-[#86868B] font-medium mt-1 text-center">
            ViralDog Suite v2.0
          </div>
        </div>
      </aside>

      {/* Main Panel View — Lazy-mount + keep-alive: tabs mount on first visit, never unmount */}
      <main className={`main-content ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {mountedTabs.has('analytics') && (
          <div style={{ display: activeTab === 'analytics' ? 'block' : 'none', width: '100%' }}>
            <Analytics triggerToast={triggerToast} />
          </div>
        )}
        {mountedTabs.has('downloader') && (
          <div style={{ display: activeTab === 'downloader' ? 'block' : 'none', width: '100%', height: '100%' }}>
            <Downloader triggerToast={triggerToast} isVisible={activeTab === 'downloader'} />
          </div>
        )}
        {mountedTabs.has('multilogin') && (
          <div style={{ display: activeTab === 'multilogin' ? 'block' : 'none', width: '100%', height: '100%' }}>
            <MultiLogin
              triggerToast={triggerToast}
              isVisible={activeTab === 'multilogin'}
              openGlobalSession={globalBrowserRequested}
              onGlobalSessionOpened={() => setGlobalBrowserRequested(false)}
            />
          </div>
        )}
        {mountedTabs.has('editor') && (
          <div style={{ display: activeTab === 'editor' ? 'block' : 'none', width: '100%', height: '100%' }}>
            <Editor triggerToast={triggerToast} />
          </div>
        )}
        {mountedTabs.has('publisher') && (
          <div style={{ display: activeTab === 'publisher' ? 'block' : 'none', width: '100%', height: '100%' }}>
            <Publisher triggerToast={triggerToast} />
          </div>
        )}
        {mountedTabs.has('settings') && (
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none', width: '100%' }}>
            <Settings triggerToast={triggerToast} />
          </div>
        )}
      </main>


      {/* Notification Toast */}
      {toast && (
        <div className={`toast-enhanced ${toast.type} ${toast.exiting ? 'toast-exit' : ''}`}>
          <div className="toast-icon">
            <span className="material-symbols-outlined">
              {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
            </span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#1D1D1F' }}>{toast.message}</span>
          <div className="toast-progress" />
        </div>
      )}
    </div>
  );
}
