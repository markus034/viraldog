import React, { useState, useEffect, useRef, useCallback } from 'react';
import Downloader from './components/Downloader';
import MultiLogin from './components/MultiLogin';
import Editor from './components/editor/Editor';
import Publisher from './components/Publisher';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import LoginModal from './components/LoginModal';
import logoImage from './assets/logo.jpg';
import { saveCloudConfig } from './utils/cloudSync';
import { getCurrentUser, setCurrentUser, setAuthToken, apiFetch } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [toast, setToast] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [globalBrowserRequested, setGlobalBrowserRequested] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());

  // Track which tabs have been visited at least once (lazy-mount)
  const [mountedTabs, setMountedTabs] = useState(new Set(['analytics']));

  // When activeTab changes, mark it as mounted so it stays alive forever
  useEffect(() => {
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

    // Ouvinte global para recarregar contas ao focar na janela
    const handleFocus = () => {
      window.dispatchEvent(new CustomEvent('viraldog:accounts-updated'));
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleFocus();
    });

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
    <img 
      src={logoImage} 
      alt="ViralDog Logo" 
      className="w-9 h-9 object-contain flex-shrink-0 select-none mix-blend-multiply" 
    />
  );

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Navigation */}
      <aside 
        className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} bg-surface-off-white border-r border-surface-container-high`}
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
      >
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <ViralDogLogo />
          <div className="logo-text">
            <h1 className="text-title-md font-bold text-primary tracking-tight leading-none" style={{ fontSize: '20px' }}>ViralDog</h1>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold mt-0.5">Video Suite</p>
          </div>
        </div>


        
        <nav style={{ flexGrow: 1, width: '100%' }}>
          <ul className="nav-list flex flex-col gap-1">
            {navItems.map(item => (
              <li key={item.id} className="sidebar-nav-item">
                <button 
                  onClick={() => setActiveTab(item.id)} 
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 ${
                    activeTab === item.id 
                      ? 'text-[#0071E3] font-bold bg-[#0071E3]/[0.06]' 
                      : 'text-text-secondary hover:text-text-primary hover:bg-secondary-container/10'
                  }`}
                  style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: activeTab === item.id ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span> 
                  <span className="nav-label flex items-center justify-between w-full">
                    <span>{item.label}</span>
                  </span>
                </button>
                {activeTab === item.id && <div className="sidebar-active-bar" />}
                {isSidebarCollapsed && <span className="sidebar-tooltip">{item.label}</span>}
              </li>
            ))}
          </ul>
        </nav>

        {/* Cloud / User Account button at the bottom */}
        <div className="w-full mb-2 sidebar-nav-item">
          <button 
            type="button"
            onClick={() => {
              if (currentUser) {
                if (window.confirm(`Logado como ${currentUser.email}. Deseja desconectar da Nuvem?`)) {
                  setAuthToken(null);
                  setCurrentUser(null);
                  setCurrentUserState(null);
                  triggerToast('Você desconectou da Nuvem ViralDog.', 'info');
                }
              } else {
                setIsLoginModalOpen(true);
              }
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
              currentUser 
                ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 border border-emerald-500/20 font-semibold' 
                : 'bg-[#0071E3]/10 text-[#0071E3] hover:bg-[#0071E3]/15 border border-[#0071E3]/20 font-semibold'
            }`}
            style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}
            title={currentUser ? `Conectado como ${currentUser.email}` : 'Conectar à Nuvem 24/7'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {currentUser ? 'cloud_done' : 'cloud'}
            </span>
            <span className="nav-label truncate">
              {currentUser ? (currentUser.name || currentUser.email) : 'Nuvem 24/7'}
            </span>
          </button>
          {isSidebarCollapsed && (
            <span className="sidebar-tooltip">
              {currentUser ? `Nuvem: ${currentUser.email}` : 'Conectar Nuvem'}
            </span>
          )}
        </div>

        {/* Settings button at the bottom */}
        <div className="w-full mb-4 sidebar-nav-item">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 ${
              activeTab === 'settings' 
                ? 'text-[#0071E3] font-bold bg-[#0071E3]/[0.06]' 
                : 'text-text-secondary hover:text-text-primary hover:bg-secondary-container/10'
            }`}
            style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
            <span className="nav-label">Definições</span>
          </button>
          {activeTab === 'settings' && <div className="sidebar-active-bar" />}
          {isSidebarCollapsed && <span className="sidebar-tooltip">Definições</span>}
        </div>

        {/* Version */}
        <div className="sidebar-version text-[10px] text-text-secondary mt-4 text-center">
          ViralDog Video Suite v2.0
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
            <Settings
              triggerToast={triggerToast}
              onOpenGlobalBrowser={() => {
                setGlobalBrowserRequested(true);
                setActiveTab('multilogin');
                setMountedTabs(prev => { const next = new Set(prev); next.add('multilogin'); return next; });
              }}
            />
          </div>
        )}
      </main>

      {/* Login / Nuvem Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUserState(user);
          triggerToast(`Nuvem 24/7 conectada como ${user.email}! ☁️`, 'success');
          window.dispatchEvent(new CustomEvent('viraldog:accounts-updated'));
        }}
        triggerToast={triggerToast}
      />

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
