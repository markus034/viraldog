import { useState, useEffect, useRef, Fragment } from 'react';
import CustomSelect from './CustomSelect';
import { API, apiFetch } from '../config';

/**
 * Aceita qualquer formato comum de proxy e normaliza para http://user:pass@host:port
 */
function parseProxyInput(raw) {
  if (!raw) return '';
  let s = raw.trim();

  // Extrair URL de dentro de um comando curl
  const curlMatch = s.match(/--proxy\s+["']?([^"'\s]+)["']?/);
  if (curlMatch) s = curlMatch[1];

  // Remover barra final
  s = s.replace(/\/$/, '');

  // Se tem esquema (http, https, socks4, socks5)
  const withScheme = s.match(/^(https?|socks[45]?):(\/\/)?(.+)/);
  if (withScheme) {
    const proto = withScheme[1] === 'https' ? 'http' : withScheme[1];
    const rest = withScheme[3]; // user:pass@host:port ou host:port
    return `${proto}://${rest}`;
  }

  // Formato host:port:user:pass (sem esquema, 4 partes separadas por ':')
  const fourParts = s.match(/^([^:@]+):(\d+):([^:@]+):(.+)$/);
  if (fourParts) {
    const [, host, port, user, pass] = fourParts;
    return `http://${user}:${pass}@${host}:${port}`;
  }

  // Formato user:pass@host:port (sem esquema)
  if (s.includes('@')) {
    return `http://${s}`;
  }

  // Formato simples host:port
  if (/^[^:]+:\d+$/.test(s)) {
    return `http://${s}`;
  }

  // Devolve como está (fallback)
  return s;
}

export const USER_AGENT_PRESETS = [
  { label: 'Chrome 124 (Windows 11)', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
  { label: 'Chrome 123 (macOS Sonoma)', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' },
  { label: 'Safari 17.4 (macOS Sonoma)', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' },
  { label: 'Edge 124 (Windows 11)', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0' },
  { label: 'Chrome Mobile (Android 14)', value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36' },
];

export const RESOLUTION_PRESETS = [
  { label: '1920 × 1080 (FHD)', width: 1920, height: 1080 },
  { label: '1440 × 900 (MacBook)', width: 1440, height: 900 },
  { label: '1366 × 768 (HD)', width: 1366, height: 768 },
  { label: '1280 × 800 (Compact)', width: 1280, height: 800 },
];


export const STATUS_OPTIONS = [
  { id: 'active', label: 'Ativo', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', dot: 'bg-emerald-500', icon: 'check_circle' },
  { id: 'new', label: 'Novo', color: '#0071E3', bg: '#EFF6FF', border: '#BFDBFE', dot: 'bg-blue-500', icon: 'fiber_new' },
  { id: 'paused', label: 'Pausado', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: 'bg-amber-500', icon: 'pause_circle' },
  { id: 'banned', label: 'Banido', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: 'bg-rose-500', icon: 'block' },
];

function getExternalProfileKey(username, accountId) {
  const normalizedUsername = String(username || 'global').replace('@', '').trim().toLowerCase();
  const prefix = accountId ? `account_${accountId}_` : '';
  return `${prefix}instagram-${normalizedUsername}`;
}

export default function MultiLogin({ triggerToast, isVisible = true, openGlobalSession = false, onGlobalSessionOpened }) {
  const isElectron = !!(window.electronAPI);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileSearch, setProfileSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [openProfileMenuId, setOpenProfileMenuId] = useState(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState(null);

  // Seleção Múltipla (Bulk Selection)
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);

  // Perfis externos do Chrome
  const [openingProfileId, setOpeningProfileId] = useState(null);

  // Modais & Exclusão Customizada
  const [editingAccount, setEditingAccount] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const newUsernameInputRef = useRef(null);

  useEffect(() => {
    if (isCreateModalOpen) {
      window.focus();
      const timer = setTimeout(() => {
        newUsernameInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isCreateModalOpen]);

  // Form de Novo Perfil
  const [newUsername, setNewUsername] = useState('');
  const [newFolder, setNewFolder] = useState('Geral');
  const [newProxy, setNewProxy] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newTags, setNewTags] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');
  const [savingNewAccount, setSavingNewAccount] = useState(false);
  const [testingNewProxy, setTestingNewProxy] = useState(false);
  const [newProxyTestResult, setNewProxyTestResult] = useState(null);

  // Form de Edição de Perfil
  const [editProxy, setEditProxy] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editCustomTagInput, setEditCustomTagInput] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState(null);
  const [testingProxy, setTestingProxy] = useState(false);
  const [editProxyTestResult, setEditProxyTestResult] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Fingerprint & Anti-Detect States
  const [editUserAgent, setEditUserAgent] = useState('');
  const [editWindowWidth, setEditWindowWidth] = useState(1920);
  const [editWindowHeight, setEditWindowHeight] = useState(1080);
  const [editLang, setEditLang] = useState('pt-BR');
  const [editCanvasNoise, setEditCanvasNoise] = useState(true);
  const [editWebglNoise, setEditWebglNoise] = useState(true);
  const [editAudioNoise, setEditAudioNoise] = useState(true);
  const [editTimezone, setEditTimezone] = useState('America/Sao_Paulo');


  // Sessão de autenticação acompanhada no Chrome externo
  const [authBrowserSession, setAuthBrowserSession] = useState(null);

  // Modal de Apelido da Conta
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameData, setNicknameData] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const nicknameInputRef = useRef(null);

  // 🧩 Gerenciador de Extensões
  const [isExtensionsModalOpen, setIsExtensionsModalOpen] = useState(false);
  const [extensionsList, setExtensionsList] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [uploadingExtZip, setUploadingExtZip] = useState(false);
  const [editExtensionsConfig, setEditExtensionsConfig] = useState({});

  // 🚀 Multi-Launch / Grade Inteligente de Navegadores
  const [isMultiLaunchModalOpen, setIsMultiLaunchModalOpen] = useState(false);
  const [multiLaunchLayout, setMultiLaunchLayout] = useState('grid'); // 'grid' | 'cascade' | 'default'
  const [multiLaunchSyncUrl, setMultiLaunchSyncUrl] = useState('https://www.instagram.com/');
  const [isLaunchingMultiple, setIsLaunchingMultiple] = useState(false);

  // Buscar catálogo de extensões do backend
  const fetchExtensions = async () => {
    setLoadingExtensions(true);
    try {
      const res = await fetch(`${API}/api/extensions`);
      if (res.ok) {
        const data = await res.json();
        setExtensionsList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingExtensions(false);
    }
  };

  // Alternar ativação global de extensão
  const handleToggleGlobalExtension = async (extId, currentEnabled) => {
    const nextState = !currentEnabled;
    try {
      const res = await fetch(`${API}/api/extensions/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension_id: extId, enabled: nextState })
      });
      if (res.ok) {
        setExtensionsList(prev => prev.map(ext => ext.id === extId ? { ...ext, enabled: nextState } : ext));
        triggerToast(`Extensão ${nextState ? 'ativada' : 'desativada'} globalmente!`, 'success');
      } else {
        triggerToast('Erro ao atualizar status da extensão.', 'error');
      }
    } catch {
      triggerToast('Erro de conexão ao alternar extensão.', 'error');
    }
  };

  // Upload de extensão compactada (.zip)
  const handleUploadExtensionZip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      triggerToast('Por favor, selecione um arquivo compactado .ZIP válido.', 'error');
      return;
    }

    setUploadingExtZip(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API}/api/extensions/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(`✅ Extensão "${data.name || file.name}" instalada com sucesso!`, 'success');
        fetchExtensions();
      } else {
        triggerToast(data.detail || 'Falha ao instalar extensão.', 'error');
      }
    } catch {
      triggerToast('Erro de conexão ao enviar arquivo de extensão.', 'error');
    } finally {
      setUploadingExtZip(false);
      e.target.value = '';
    }
  };

  // Executar abertura simultânea direta com Grade Inteligente (Lado a lado, Instagram)
  const handleExecuteMultiLaunch = async () => {
    if (!isElectron || !window.electronAPI?.openMultipleProfileBrowsers) {
      triggerToast('A abertura simultânea requer o aplicativo desktop.', 'info');
      return;
    }

    const selectedAccounts = safeAccountsList.filter(a => selectedAccountIds.includes(a.id));
    if (selectedAccounts.length === 0) return;

    setIsLaunchingMultiple(true);
    triggerToast(`🚀 Abrindo ${selectedAccounts.length} perfis lado a lado em Grade Inteligente...`, 'info');

    try {
      const formattedAccounts = selectedAccounts.map(acc => ({
        profile_key: getExternalProfileKey(acc.username, acc.id),
        proxy: acc.proxy_url || null,
        last_url: 'https://www.instagram.com/',
        session_cookies: acc.session_cookies || null,
        fingerprint_json: acc.fingerprint_json || null,
        extensions_config_json: acc.extensions_config_json || null,
      }));

      const res = await window.electronAPI.openMultipleProfileBrowsers(
        formattedAccounts,
        'grid',
        'https://www.instagram.com/'
      );

      if (res?.success) {
        triggerToast(`✅ ${res.openedCount} de ${res.total} perfis iniciados em grade com sucesso!`, 'success');
      } else {
        triggerToast(res?.error || 'Erro ao abrir perfis em lote.', 'error');
      }
    } catch (e) {
      triggerToast('Erro ao despachar abertura simultânea.', 'error');
    } finally {
      setIsLaunchingMultiple(false);
    }
  };

  // Fechar todos os navegadores externos abertos
  const handleCloseAllBrowsers = async () => {
    if (!isElectron || !window.electronAPI?.closeAllProfileBrowsers) {
      triggerToast('O controle de processos requer o aplicativo desktop.', 'info');
      return;
    }

    try {
      const res = await window.electronAPI.closeAllProfileBrowsers();
      if (res?.success) {
        triggerToast(`⛔ ${res.count || 'Todos os'} navegadores externos foram encerrados com sucesso.`, 'info');
      }
    } catch {
      triggerToast('Erro ao encerrar navegadores.', 'error');
    }
  };



  // Listener para capturar quando o login no Chrome do Instagram é concluído
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onProfileLoginComplete) return;

    const cleanup = window.electronAPI.onProfileLoginComplete(async (data) => {
      if (data.success && data.cookiesJson) {
        const cleanUser = (data.username || '').replace(/^@/, '').trim();
        try {
          const res = await fetch(`${API}/api/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: cleanUser || `instagram_user_${Date.now().toString().slice(-4)}`,
              cookies_json: data.cookiesJson,
              status: 'active'
            })
          });
          if (res.ok) {
            triggerToast(`Sessão de @${cleanUser || 'Instagram'} conectada com sucesso! 🎉`, 'success');
            await fetchAccounts(true);
          }
        } catch (e) {
          console.error(e);
        }
      } else if (data.error) {
        triggerToast(data.error, 'error');
      }
      setAuthBrowserSession(null);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
      else window.electronAPI.removeProfileLoginComplete?.();
    };
  }, [isElectron, triggerToast]);


  const handleStartNewProfileInstagramLogin = async () => {
    if (!isElectron || !window.electronAPI?.startExternalInstagramLogin) {
      triggerToast('A abertura do navegador para login requer o aplicativo desktop.', 'info');
      return;
    }

    const cleanUser = (newUsername.trim() || `perfil_${Date.now().toString().slice(-4)}`).replace(/^@/, '');
    const proxy = parseProxyInput(newProxy);
    const profileKey = getExternalProfileKey(cleanUser, 'new');

    setAuthBrowserSession({ username: cleanUser, proxy, profileKey, isNewProfile: true, phase: 'capturing' });
    setIsCreateModalOpen(false);
    triggerToast('Abrindo Chrome do Instagram para login...', 'info');

    try {
      const result = await window.electronAPI.startExternalInstagramLogin(profileKey, cleanUser, proxy || null);
      if (!result?.success) {
        setAuthBrowserSession(null);
        triggerToast(result?.error || 'Não foi possível abrir o Chrome.', 'error');
        return;
      }
      triggerToast('Navegador do Instagram aberto. Faça o login na sua conta. Ao concluir, o perfil será adicionado automaticamente! 🚀', 'success');
    } catch {
      setAuthBrowserSession(null);
      triggerToast('Erro ao iniciar login no Instagram.', 'error');
    }
  };

  const handleStartInstagramDirectLogin = async (forceLogout = false) => {
    try {
      if (forceLogout) {
        // Abrir logout do Instagram para limpar sessão anterior
        const logoutWin = window.open('https://www.instagram.com/accounts/logout/', 'IgLogout', 'width=500,height=500');
        triggerToast('Desconectando sessão antiga do Instagram...', 'info');
        await new Promise(r => setTimeout(r, 1500));
        if (logoutWin) logoutWin.close();
      }

      const callbackUri = `${API}/api/auth/meta/callback`;
      const res = await fetch(`${API}/api/auth/meta/direct/url?redirect_uri=${encodeURIComponent(callbackUri)}`);
      const data = await res.json();
      if (res.ok && data.auth_url) {
        // Abrir popup de consentimento nativo do Instagram (Telas 1 e 2)
        const width = 580;
        const height = 700;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;
        const popup = window.open(
          data.auth_url,
          'InstagramOAuth',
          `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`
        );
        if (!popup) {
          window.open(data.auth_url, '_blank');
        }
        triggerToast('Janela oficial do Instagram aberta.', 'info');
      } else {
        triggerToast(data.detail || 'Erro ao gerar link de login do Instagram.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('Erro de conexão ao iniciar login com o Instagram.', 'error');
    }
  };

  const handleSaveNicknameAccount = async (e) => {
    if (e) e.preventDefault();
    if (!nicknameData) return;

    setIsSavingNickname(true);
    try {
      const res = await fetch(`${API}/api/auth/meta/direct/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nicknameInput.trim() || nicknameData.username,
          username: nicknameData.username,
          user_id: nicknameData.user_id,
          access_token: nicknameData.access_token,
          avatar_url: nicknameData.avatar_url
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        triggerToast(`✅ Conta @${data.username} vinculada com sucesso!`, 'success');
        setIsNicknameModalOpen(false);
        setNicknameData(null);
        await fetchAccounts(true);
      } else {
        triggerToast(data.detail || 'Erro ao salvar perfil.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('Erro de rede ao salvar apelido.', 'error');
    } finally {
      setIsSavingNickname(false);
    }
  };

  async function fetchAccounts(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        const localProfiles = Array.isArray(data) ? data.filter(a => a.auth_mode !== 'official_api') : [];
        setAccounts(localProfiles);
      } else if (!silent) {
        triggerToast("Falha ao obter perfis.", "error");
      }
    } catch (e) {
      console.error(e);
      if (!silent) triggerToast("Erro ao obter perfis do servidor.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();

    let lastSync = 0;
    const handleSync = () => {
      const now = Date.now();
      if (now - lastSync < 3000) return;
      lastSync = now;
      fetchAccounts(true);
    };

    window.addEventListener('viraldog:accounts-updated', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      window.removeEventListener('viraldog:accounts-updated', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, []);

  // Escutar encerramento e captura automática da sessão do Instagram pelo Electron
  useEffect(() => {
    if (!isElectron || !authBrowserSession) return;

    window.electronAPI.onProfileLoginComplete((result) => {
      if (result.profileKey && result.profileKey !== authBrowserSession.profileKey) return;

      if (!result.success || !result.cookiesJson) {
        triggerToast(result.error || 'Login no Instagram não foi concluído.', 'error');
        setAuthBrowserSession(null);
        return;
      }

      if (authBrowserSession.directAccountId) {
        fetch(`${API}/api/accounts/${authBrowserSession.directAccountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_cookies: result.cookiesJson, status: 'active' })
        })
        .then(res => {
          if (res.ok) {
            triggerToast(`Sessão de @${authBrowserSession.username} atualizada com sucesso! ✅`, 'success');
            fetchAccounts();
          } else {
            triggerToast('Erro ao persistir sessão atualizada.', 'error');
          }
        })
        .catch(() => triggerToast('Erro de conexão ao salvar sessão.', 'error'));
      }
      setAuthBrowserSession(null);
    });

    return () => {
      window.electronAPI.removeProfileLoginComplete?.();
    };
  }, [isElectron, authBrowserSession, triggerToast]);

  // Escutar encerramento e sucesso do OAuth do Instagram para salvar e fechar automaticamente
  useEffect(() => {
    const handleOAuthMessage = async (event) => {
      if (!event.data) return;
      if (event.data.type === 'INSTAGRAM_OAUTH_SUCCESS' || event.data.type === 'META_OAUTH_SUCCESS') {
        const username = event.data.username || (event.data.accounts && event.data.accounts[0]?.username) || '';
        triggerToast(`Conta @${username} conectada e salva com sucesso via API Oficial!`, 'success');
        fetchAccounts();
        closeCreateProfile();
      } else if (event.data.type === 'META_OAUTH_CODE' && event.data.code) {
        try {
          const res = await fetch(`${API}/auth/callback?code=${encodeURIComponent(event.data.code)}&state=${encodeURIComponent(event.data.state || '')}`);
          if (res.ok) {
            triggerToast('Conta conectada com sucesso via API Oficial!', 'success');
            fetchAccounts();
            closeCreateProfile();
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Atalhos de teclado ('/' para buscar, 'Escape' para desmarcar seleção)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedAccountIds.length > 0 && !accountToDelete && !isCreateModalOpen && !editingAccount) {
          setSelectedAccountIds([]);
        }
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('profile-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAccountIds.length, accountToDelete, isCreateModalOpen, editingAccount]);

  // Seleção Múltipla Handlers
  const toggleSelectAccount = (id) => {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAccountIds.length === filteredAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(filteredAccounts.map(a => a.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedAccountIds.length === 0) return;
    setAccountToDelete({ isBulk: true, count: selectedAccountIds.length });
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectedAccountIds.length === 0) return;
    try {
      for (const id of selectedAccountIds) {
        await fetch(`${API}/api/accounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      }
      triggerToast(`Status de ${selectedAccountIds.length} perfil(is) alterado para "${getStatusLabel(newStatus)}".`, 'success');
      setIsBulkStatusOpen(false);
      setSelectedAccountIds([]);
      fetchAccounts();
    } catch {
      triggerToast('Erro ao atualizar status em lote.', 'error');
    }
  };

  // Criar Perfil - Salvar no Backend e Abrir Navegador no Instagram
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!newUsername) {
      triggerToast("O nome de usuário é obrigatório.", "error");
      return;
    }

    setSavingNewAccount(true);
    try {
      const name = newUsername.replace('@', '').trim();
      const parsedProxy = parseProxyInput(newProxy) || null;
      const res = await fetch(`${API}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: name,
          proxy_url: parsedProxy,
          folder: newFolder.trim() || 'Geral',
          notes: newNotes.trim() || null,
          tags: newTags.trim() || null
        })
      });

      if (res.ok) {
        const createdAccount = await res.json();
        triggerToast(`Perfil @${name} cadastrado com sucesso!`, "success");
        setNewUsername('');
        setNewFolder('Geral');
        setNewProxy('');
        setNewNotes('');
        setNewTags('');
        setNewProxyTestResult(null);
        setIsCreateModalOpen(false);
        fetchAccounts();

        // Abrir navegador do Instagram para captura de sessão (se estiver no Electron)
        if (createdAccount && isElectron && window.electronAPI?.startExternalInstagramLogin) {
          const profileKey = getExternalProfileKey(name, createdAccount.id);
          setAuthBrowserSession({
            username: name,
            proxy: parsedProxy,
            profileKey,
            directAccountId: createdAccount.id,
            phase: 'capturing'
          });
          triggerToast(`Abrindo Chrome para login no Instagram de @${name}...`, 'info');

          try {
            const result = await window.electronAPI.startExternalInstagramLogin(profileKey, name, parsedProxy);
            if (!result?.success) {
              setAuthBrowserSession(null);
              triggerToast(result?.error || 'Não foi possível abrir o Chrome para login.', 'error');
            } else {
              triggerToast('Chrome aberto. Faça o login no Instagram. Ao fechar a janela, a sessão será salva automaticamente! ✅', 'success');
            }
          } catch {
            setAuthBrowserSession(null);
            triggerToast('Erro ao iniciar login no Instagram.', 'error');
          }
        }
      } else {
        triggerToast("Falha ao cadastrar perfil.", "error");
      }
    } catch {
      triggerToast("Erro de conexão com o backend.", "error");
    } finally {
      setSavingNewAccount(false);
    }
  };


  // Abrir Modal Limpo de Edição de Perfil
  const openEditModal = (account) => {
    setEditingAccount(account);
    setEditProxy(account.proxy_url || '');
    setEditNotes(account.notes || '');
    setEditTags(account.tags || '');
    setEditCustomTagInput('');
    setEditStatus(account.status || 'new');
    setEditDisplayName(account.display_name || account.username || '');
    setEditAvatarFile(null);
    setEditAvatarPreview(account.avatar_url ? `${API}${account.avatar_url}` : null);
    setEditProxyTestResult(null);
  };

  // Atualizar Sessão Diretamente pelo Chrome na Tabela de Perfis
  const handleDirectSessionCapture = async (account) => {
    if (!isElectron || !window.electronAPI.startExternalInstagramLogin) {
      triggerToast('A captura de sessão requer a versão Desktop do aplicativo.', 'error');
      return;
    }

    const username = (account.username || '').replace(/^@/, '').trim();
    const proxy = parseProxyInput(account.proxy_url);
    const profileKey = getExternalProfileKey(username, account.id);

    setAuthBrowserSession({ username, proxy, profileKey, directAccountId: account.id, phase: 'capturing' });
    triggerToast(`Abrindo Chrome para atualizar a sessão de @${username}...`, 'info');

    try {
      const result = await window.electronAPI.startExternalInstagramLogin(profileKey, username, proxy || null);
      if (!result?.success) {
        setAuthBrowserSession(null);
        triggerToast(result?.error || 'Não foi possível abrir o Chrome para captura.', 'error');
        return;
      }
      triggerToast('Chrome aberto. Faça o login no Instagram. Ao fechar a janela, a sessão será salva automaticamente! ✅', 'success');
    } catch {
      setAuthBrowserSession(null);
      triggerToast('Erro ao iniciar atualização de sessão.', 'error');
    }
  };

  const handleOpenAccount = async (account) => {
    if (!isElectron || !window.electronAPI.openExternalProfileBrowser) {
      triggerToast('Este recurso requer a versão desktop.', 'error');
      return;
    }

    setOpeningProfileId(account.id);
    const nowIso = new Date().toISOString();

    fetch(`${API}/api/accounts/${account.id}/open`, { method: 'POST' }).catch(err => console.error(err));
    setAccounts(prev => prev.map(acc => acc.id === account.id ? { ...acc, last_opened_at: nowIso } : acc));

    try {
      const result = await window.electronAPI.openExternalProfileBrowser(
        getExternalProfileKey(account.username, account.id),
        account.proxy_url || null,
        'https://www.instagram.com/',
        account.session_cookies || null,
        account.fingerprint_json || null,
        account.extensions_config_json || null
      );
      if (result?.success) {
        const proxyMessage = result.requiresProxyAuthentication
          ? ' O navegador poderá solicitar as credenciais do proxy.'
          : '';
        triggerToast(`${result.browser} aberto para @${account.username}.${proxyMessage}`, 'success');
      } else {
        triggerToast(result?.error || 'Não foi possível abrir o perfil.', 'error');
      }
    } catch {
      triggerToast('Erro ao abrir o perfil no Chrome.', 'error');
    } finally {
      setOpeningProfileId(null);
    }
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingAccount) return;

    setSavingEdit(true);
    try {
      let avatarUrl = editingAccount.avatar_url || null;
      if (editAvatarFile) {
        const formData = new FormData();
        formData.append('file', editAvatarFile);
        const avatarRes = await fetch(`${API}/api/accounts/${editingAccount.id}/avatar`, {
          method: 'POST',
          body: formData
        });
        if (avatarRes.ok) {
          const avatarData = await avatarRes.json();
          avatarUrl = avatarData.avatar_url;
        }
      }

      const cleanName = editDisplayName.trim().replace(/^@/, '');

      // Garantir Fingerprint aleatório anti-detect automático transparente
      let fingerprintObj = null;
      if (editingAccount.fingerprint_json) {
        try { fingerprintObj = JSON.parse(editingAccount.fingerprint_json); } catch (e) {}
      }
      if (!fingerprintObj) {
        const randomUa = USER_AGENT_PRESETS[Math.floor(Math.random() * USER_AGENT_PRESETS.length)].value;
        const randomRes = RESOLUTION_PRESETS[Math.floor(Math.random() * RESOLUTION_PRESETS.length)];
        fingerprintObj = {
          userAgent: randomUa,
          windowWidth: randomRes.width,
          windowHeight: randomRes.height,
          lang: 'pt-BR',
          canvasNoise: true,
          webglNoise: true,
          audioNoise: true,
          timezone: 'America/Sao_Paulo'
        };
      }

      const payload = {
        username: cleanName,
        display_name: cleanName,
        proxy_url: parseProxyInput(editProxy) || '',
        notes: editNotes.trim(),
        tags: editTags.trim(),
        status: editStatus,
        avatar_url: avatarUrl,
        fingerprint_json: JSON.stringify(fingerprintObj)
      };

      const res = await fetch(`${API}/api/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setAccounts(prev => prev.map(a => a.id === editingAccount.id ? {
          ...a,
          username: cleanName,
          display_name: cleanName,
          notes: editNotes.trim(),
          tags: editTags.trim(),
          status: editStatus,
          proxy_url: parseProxyInput(editProxy) || '',
          avatar_url: avatarUrl,
          fingerprint_json: JSON.stringify(fingerprintObj)
        } : a));
        triggerToast(`Perfil @${cleanName} atualizado com sucesso.`, "success");
        setEditingAccount(null);
        fetchAccounts();
      } else {
        triggerToast("Erro ao atualizar perfil.", "error");
      }
    } catch {
      triggerToast("Erro de conexão.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteAccount = (account) => {
    setAccountToDelete(account);
  };

  const executeDelete = async () => {
    if (!accountToDelete) return;
    setDeletingAccount(true);
    try {
      if (accountToDelete.isBulk) {
        let successCount = 0;
        for (const id of selectedAccountIds) {
          const res = await fetch(`${API}/api/accounts/${id}`, { method: 'DELETE' });
          if (res.ok) successCount++;
        }
        triggerToast(`${successCount} perfil(is) excluído(s) com sucesso.`, 'success');
        setSelectedAccountIds([]);
        fetchAccounts();
      } else {
        const res = await fetch(`${API}/api/accounts/${accountToDelete.id}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setAccounts(prev => prev.filter(a => a.id !== accountToDelete.id));
          triggerToast(`Perfil @${accountToDelete.username} excluído com sucesso.`, "success");
        } else {
          triggerToast("Falha ao excluir o perfil.", "error");
        }
      }
    } catch {
      triggerToast("Erro ao executar exclusão.", "error");
    } finally {
      setDeletingAccount(false);
      setAccountToDelete(null);
    }
  };

  const handleTestProxy = async () => {
    if (!editProxy) {
      triggerToast("Nenhum proxy inserido para teste.", "error");
      return;
    }
    setTestingProxy(true);
    setEditProxyTestResult(null);
    try {
      const formData = new FormData();
      formData.append('proxy_url', editProxy.trim());
      const res = await fetch(`${API}/api/proxy/test`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setEditProxyTestResult(data);
        if (data.working) {
          triggerToast(`Proxy ativo! IP: ${data.ip} - Latência: ${data.latency_ms}ms`, "success");
        } else {
          triggerToast(`Erro no proxy: ${data.error}`, "error");
        }
      } else {
        triggerToast("Erro ao testar proxy.", "error");
      }
    } catch {
      triggerToast("Erro de rede ao testar proxy.", "error");
    } finally {
      setTestingProxy(false);
    }
  };

  const handleTestNewProxy = async () => {
    if (!newProxy.trim()) {
      triggerToast('Informe um proxy para testar.', 'error');
      return;
    }

    setTestingNewProxy(true);
    setNewProxyTestResult(null);
    try {
      const formData = new FormData();
      formData.append('proxy_url', newProxy.trim());
      const res = await fetch(`${API}/api/proxy/test`, { method: 'POST', body: formData });
      const data = await res.json();
      setNewProxyTestResult(data);
      if (res.ok && data.working) {
        triggerToast(`Proxy ativo! IP: ${data.ip} • ${data.latency_ms}ms`, 'success');
      } else {
        triggerToast(data.error || 'Não foi possível conectar ao proxy.', 'error');
      }
    } catch {
      triggerToast('Erro de rede ao testar o proxy.', 'error');
    } finally {
      setTestingNewProxy(false);
    }
  };

  // Auxiliares
  const getStatusLabel = (status) => {
    switch (status) {
      case 'new': return 'Novo';
      case 'active': return 'Ativo';
      case 'paused': return 'Pausado';
      case 'banned': return 'Banido';
      default: return status;
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'new':
        return { bg: '#EFF6FF', text: '#0071E3', border: '#DBEAFE' };
      case 'active':
        return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' };
      case 'paused':
        return { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' };
      case 'banned':
        return { bg: '#FEF2F2', text: '#DC2626', border: '#FCA5A5' };
      default:
        return { bg: '#F5F5F7', text: '#86868B', border: '#E8E8EA' };
    }
  };

  const formatRelativeTime = (dateValue) => {
    if (!dateValue) return 'Nunca acessado';

    const timestamp = new Date(dateValue).getTime();
    if (Number.isNaN(timestamp)) return 'Nunca acessado';

    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (elapsedMinutes < 1) return 'Ativo agora';
    if (elapsedMinutes < 60) return `Há ${elapsedMinutes} min`;

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `Há ${elapsedHours} ${elapsedHours === 1 ? 'hora' : 'horas'}`;

    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 30) return `Há ${elapsedDays} ${elapsedDays === 1 ? 'dia' : 'dias'}`;

    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(timestamp));
  };

  const defaultSuggestedTags = ['Instagram', 'Principal', 'Aquecimento', 'Vendas', 'Suporte', 'VIP'];
  const safeAccountsList = Array.isArray(accounts) ? accounts : [];

  const [deletedTags, setDeletedTags] = useState(() => {
    try {
      const saved = localStorage.getItem('viraldog_deleted_tags');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customTags, setCustomTags] = useState(() => {
    try {
      const saved = localStorage.getItem('viraldog_custom_tags');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const existingAccountTags = safeAccountsList
    .flatMap(acc => (typeof acc.tags === 'string' ? acc.tags : '').split(','))
    .map(t => t.trim())
    .filter(Boolean);

  const selectedTagsList = (typeof newTags === 'string' ? newTags : '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const editSelectedTagsList = (typeof editTags === 'string' ? editTags : '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const allAvailableTags = Array.from(
    new Set([
      ...defaultSuggestedTags,
      ...customTags,
      ...existingAccountTags,
      ...selectedTagsList,
      ...editSelectedTagsList
    ])
  ).filter(tag => !deletedTags.includes(tag.toLowerCase()));

  const toggleTag = (tagToToggle) => {
    const exists = selectedTagsList.some(t => t.toLowerCase() === tagToToggle.toLowerCase());
    if (exists) {
      const updated = selectedTagsList.filter(t => t.toLowerCase() !== tagToToggle.toLowerCase());
      setNewTags(updated.join(', '));
    } else {
      const updated = [...selectedTagsList, tagToToggle];
      setNewTags(updated.join(', '));
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    const tagLower = trimmed.toLowerCase();

    // Reativar se foi excluída anteriormente
    const nextDeleted = deletedTags.filter(t => t !== tagLower);
    setDeletedTags(nextDeleted);
    try {
      localStorage.setItem('viraldog_deleted_tags', JSON.stringify(nextDeleted));
    } catch {}

    if (!customTags.some(t => t.toLowerCase() === tagLower)) {
      const nextCustom = [...customTags, trimmed];
      setCustomTags(nextCustom);
      try {
        localStorage.setItem('viraldog_custom_tags', JSON.stringify(nextCustom));
      } catch {}
    }

    const exists = selectedTagsList.some(t => t.toLowerCase() === tagLower);
    if (!exists) {
      setNewTags([...selectedTagsList, trimmed].join(', '));
    }
    setCustomTagInput('');
  };

  const toggleEditTag = (tagToToggle) => {
    const exists = editSelectedTagsList.some(t => t.toLowerCase() === tagToToggle.toLowerCase());
    if (exists) {
      const updated = editSelectedTagsList.filter(t => t.toLowerCase() !== tagToToggle.toLowerCase());
      setEditTags(updated.join(', '));
    } else {
      const updated = [...editSelectedTagsList, tagToToggle];
      setEditTags(updated.join(', '));
    }
  };

  const handleAddEditCustomTag = () => {
    const trimmed = editCustomTagInput.trim();
    if (!trimmed) return;
    const tagLower = trimmed.toLowerCase();

    // Reativar se foi excluída anteriormente
    const nextDeleted = deletedTags.filter(t => t !== tagLower);
    setDeletedTags(nextDeleted);
    try {
      localStorage.setItem('viraldog_deleted_tags', JSON.stringify(nextDeleted));
    } catch {}

    if (!customTags.some(t => t.toLowerCase() === tagLower)) {
      const nextCustom = [...customTags, trimmed];
      setCustomTags(nextCustom);
      try {
        localStorage.setItem('viraldog_custom_tags', JSON.stringify(nextCustom));
      } catch {}
    }

    const exists = editSelectedTagsList.some(t => t.toLowerCase() === tagLower);
    if (!exists) {
      setEditTags([...editSelectedTagsList, trimmed].join(', '));
    }
    setEditCustomTagInput('');
  };

  const handleDeleteTag = async (tagToDelete, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const tagLower = tagToDelete.toLowerCase();

    // 1. Gravar em deletedTags
    const nextDeleted = Array.from(new Set([...deletedTags, tagLower]));
    setDeletedTags(nextDeleted);
    try {
      localStorage.setItem('viraldog_deleted_tags', JSON.stringify(nextDeleted));
    } catch (err) {
      console.error(err);
    }

    // 2. Remover de customTags
    const nextCustom = customTags.filter(t => t.toLowerCase() !== tagLower);
    setCustomTags(nextCustom);
    try {
      localStorage.setItem('viraldog_custom_tags', JSON.stringify(nextCustom));
    } catch (err) {
      console.error(err);
    }

    // 3. Desmarcar nos modais
    const updatedNewTags = selectedTagsList.filter(t => t.toLowerCase() !== tagLower);
    setNewTags(updatedNewTags.join(', '));

    const updatedEditTags = editSelectedTagsList.filter(t => t.toLowerCase() !== tagLower);
    setEditTags(updatedEditTags.join(', '));

    // 4. Remover globalmente de todas as contas cadastradas
    const accountsWithTag = safeAccountsList.filter(acc => {
      const accTags = (typeof acc.tags === 'string' ? acc.tags : '').split(',').map(t => t.trim()).filter(Boolean);
      return accTags.some(t => t.toLowerCase() === tagLower);
    });

    if (accountsWithTag.length > 0) {
      setAccounts(prev => (Array.isArray(prev) ? prev : []).map(acc => {
        const accTags = (typeof acc.tags === 'string' ? acc.tags : '').split(',').map(t => t.trim()).filter(Boolean);
        const filtered = accTags.filter(t => t.toLowerCase() !== tagLower);
        return { ...acc, tags: filtered.join(', ') };
      }));

      for (const acc of accountsWithTag) {
        const accTags = (typeof acc.tags === 'string' ? acc.tags : '').split(',').map(t => t.trim()).filter(Boolean);
        const filtered = accTags.filter(t => t.toLowerCase() !== tagLower);
        fetch(`${API}/api/accounts/${acc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: filtered.join(', ') })
        }).catch(err => console.error(err));
      }
    }

    triggerToast(`Tag "${tagToDelete}" excluída com sucesso.`, 'success');
  };

  const tagOptions = [
    { value: '', label: 'Todas as Tags', icon: 'sell' },
    ...allAvailableTags.map(tag => ({ value: tag, label: tag, isTag: true }))
  ];

  const statusOptions = [
    { value: '', label: 'Todos os Status', icon: 'checklist' },
    { value: 'new', label: 'Novo', dotColor: '#0071E3' },
    { value: 'active', label: 'Ativo', dotColor: '#30D158' },
    { value: 'paused', label: 'Pausado', dotColor: '#FF9500' },
    { value: 'banned', label: 'Banido', dotColor: '#FF3B30' },
  ];

  const handleQuickStatusChange = async (account, newStatus) => {
    if (!account || account.status === newStatus) return;

    setAccounts(prev => (Array.isArray(prev) ? prev : []).map(acc => acc.id === account.id ? { ...acc, status: newStatus } : acc));

    try {
      const res = await fetch(`${API}/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Falha ao atualizar status');
      triggerToast(`Status de @${account.username} alterado para "${getStatusLabel(newStatus)}".`, 'success');
    } catch {
      fetchAccounts();
      triggerToast('Erro ao atualizar status.', 'error');
    }
  };

  const normalizedSearch = (profileSearch || '').trim().toLowerCase();
  const filteredAccounts = safeAccountsList.filter(account => {
    if (!account) return false;
    if (normalizedSearch) {
      const matchesSearch = [
        account.display_name,
        account.username,
        account.notes,
        account.tags,
        account.folder,
        account.status,
        ...(Array.isArray(account.tags) ? account.tags : []),
      ].some(val => val && String(val).toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) return false;
    }

    if (selectedTag) {
      const accTags = Array.isArray(account.tags)
        ? account.tags
        : (typeof account.tags === 'string' ? account.tags.split(',').map(t => t.trim()) : []);
      if (!accTags.includes(selectedTag)) return false;
    }

    if (selectedStatus) {
      const statusVal = account.status || 'new';
      if (statusVal !== selectedStatus) return false;
    }

    return true;
  });

  const handleCreateSuccess = () => {
    fetchAccounts();
    fetchTags();
    if (authBrowserSession) {
      authBrowserSession.close();
      setAuthBrowserSession(null);
    }
    setNewProxyTestResult(null);
    setIsCreateModalOpen(false);
  };

  const closeCreateProfile = () => {
    if (authBrowserSession && authBrowserSession.isNewProfile) {
      window.electronAPI?.cancelExternalInstagramLogin?.(authBrowserSession.profileKey);
      setAuthBrowserSession(null);
    }
    setNewProxyTestResult(null);
    setIsCreateModalOpen(false);
  };

  // Contadores Estatísticos
  const totalCount = safeAccountsList.length;
  const activeCount = safeAccountsList.filter(a => a.status === 'active').length;
  const newCount = safeAccountsList.filter(a => (a.status || 'new') === 'new').length;
  const pausedCount = safeAccountsList.filter(a => a.status === 'paused').length;
  const bannedCount = safeAccountsList.filter(a => a.status === 'banned').length;

  return (
    <div className="w-full min-h-[calc(100vh-64px)] flex flex-col fade-in pb-16">
      
      {/* ─── Toolbar Principal: Busca + Filtros + Status Badge + Extensões + Criar Perfil (/DESIGN) ─── */}
      <div className="bg-white border border-[#E8E8EA] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs mb-5">
        
        {/* Esquerda: Busca + Filtro Tag + Filtro Status + Limpar */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
          {/* Campo de Busca */}
          <div className="relative flex-1 min-w-[200px] max-w-[360px] flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 top-0 bottom-0 flex items-center justify-center text-[18px] text-[#86868B] pointer-events-none select-none">
              search
            </span>
            <input
              id="profile-search-input"
              type="text"
              inputMode="search"
              value={profileSearch}
              onChange={e => setProfileSearch(e.target.value)}
              placeholder="Buscar por nome, tag ou notas..."
              className="w-full h-10 rounded-xl bg-[#F5F5F7] pl-10 pr-9 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
            />
            {profileSearch && (
              <button
                type="button"
                onClick={() => setProfileSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] p-0.5 rounded-full hover:bg-black/5 transition-colors flex items-center justify-center"
                title="Limpar busca"
              >
                <span className="material-symbols-outlined text-[16px] leading-none block">close</span>
              </button>
            )}
          </div>

          {/* Filtro por Tag */}
          <div className="w-48">
            <CustomSelect
              value={selectedTag}
              onChange={setSelectedTag}
              options={tagOptions}
              placeholder="Todas as Tags"
              icon="sell"
              size="md"
            />
          </div>

          {/* Filtro por Status */}
          <div className="w-48">
            <CustomSelect
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={statusOptions}
              placeholder="Todos os Status"
              icon="checklist"
              size="md"
            />
          </div>

          {(selectedTag || selectedStatus || profileSearch) && (
            <button
              type="button"
              onClick={() => { setSelectedTag(''); setSelectedStatus(''); setProfileSearch(''); }}
              className="h-10 px-3 rounded-xl border border-[#E8E8EA] text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Limpar todos os filtros"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              <span>Limpar</span>
            </button>
          )}
        </div>

        {/* Direita: Badges de Status + Botão Extensões + Botão Criar Perfil */}
        <div className="flex items-center gap-2.5">
          {/* Quick Counter Badges */}
          {totalCount > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA] text-[11px] font-medium select-none shadow-2xs">
              {[
                { key: 'total', count: totalCount, label: `${totalCount} Total`, color: 'text-[#1D1D1F]', dot: 'bg-[#1D1D1F]' },
                { key: 'active', count: activeCount, label: `${activeCount} Ativo${activeCount !== 1 ? 's' : ''}`, color: 'text-[#059669]', dot: 'bg-[#059669]' },
                { key: 'new', count: newCount, label: `${newCount} Novo${newCount !== 1 ? 's' : ''}`, color: 'text-[#0071E3]', dot: 'bg-[#0071E3]' },
                { key: 'paused', count: pausedCount, label: `${pausedCount} Pausado${pausedCount !== 1 ? 's' : ''}`, color: 'text-[#D97706]', dot: 'bg-[#D97706]' },
                { key: 'banned', count: bannedCount, label: `${bannedCount} Banido${bannedCount !== 1 ? 's' : ''}`, color: 'text-[#DC2626]', dot: 'bg-[#DC2626]' },
              ]
                .filter(item => item.count > 0)
                .map((item, idx, arr) => (
                  <Fragment key={item.key}>
                    <span className={`${item.color} font-bold flex items-center gap-1.5`}>
                      <span className={`w-2 h-2 rounded-full ${item.dot} inline-block`}></span>
                      {item.label}
                    </span>
                    {idx < arr.length - 1 && (
                      <span className="text-[#D1D1D6] font-normal">|</span>
                    )}
                  </Fragment>
                ))}
            </div>
          )}

          {/* Botão Extensões */}
          <button
            type="button"
            onClick={() => { setIsExtensionsModalOpen(true); fetchExtensions(); }}
            className="h-10 px-3.5 rounded-xl bg-white hover:bg-[#F5F5F7] border border-[#E8E8EA] text-[#1D1D1F] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            title="Gerenciar extensões do Chrome (Cookie-Editor, Dog Saver, Canvas Defender, etc.)"
          >
            <span className="material-symbols-outlined text-[18px] text-[#0071E3]">extension</span>
            <span>Extensões</span>
          </button>

          {/* Botão Criar Perfil */}
          <button
            type="button"
            className="group relative h-10 px-5 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] text-white text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,113,227,0.35)] hover:shadow-[0_6px_22px_rgba(0,113,227,0.48)] transition-all duration-200 active:scale-[0.97] cursor-pointer shrink-0 whitespace-nowrap overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0071E3 0%, #0077ED 50%, #0085FF 100%)' }}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <span className="material-symbols-outlined text-[19px] font-bold leading-none transition-transform group-hover:rotate-90 duration-300">
              add
            </span>
            <span className="whitespace-nowrap font-bold text-xs tracking-wide">
              Criar Perfil
            </span>
          </button>
        </div>
      </div>

      {/* ─── Tabela Container (Card com Cantos Arredondados) ─── */}
      <div className="bg-white border border-[#E8E8EA] rounded-2xl overflow-visible card-elevation">
        
        {/* Cabeçalho da Tabela */}
        <div className="hidden md:grid grid-cols-[44px_minmax(180px,1.5fr)_minmax(130px,1fr)_minmax(140px,1.2fr)_minmax(130px,1fr)_minmax(110px,1fr)_44px] items-center h-11 px-5 border-b border-[#E8E8EA] text-[10px] font-bold uppercase tracking-[0.04em] text-[#86868B] bg-[#FAFAFC] rounded-t-2xl">
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={filteredAccounts.length > 0 && selectedAccountIds.length === filteredAccounts.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-[#E8E8EA] text-[#0071E3] focus:ring-[#0071E3]/20 cursor-pointer"
              title="Selecionar todos os perfis filtrados"
            />
          </div>
          <span>Nome do perfil</span>
          <span>Tags</span>
          <span>Notas</span>
          <span>Status</span>
          <span>Linha do tempo</span>
          <span className="text-right">Ações</span>
        </div>

        {/* Conteúdo da Tabela */}
        {loading && accounts.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-44 gap-3">
            <span className="spinner" style={{ width: '30px', height: '30px' }} />
            <span className="text-xs font-medium text-[#86868B]">Carregando seus ambientes de navegação...</span>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-48 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#86868B] mb-3">
              <span className="material-symbols-outlined text-[24px]">person_search</span>
            </div>
            <p className="text-sm font-semibold text-[#1D1D1F]">
              {profileSearch || selectedTag || selectedStatus ? 'Nenhum perfil encontrado para esta busca' : 'Nenhum perfil cadastrado'}
            </p>
            <p className="text-xs text-[#86868B] mt-1 max-w-sm">
              {profileSearch || selectedTag || selectedStatus
                ? 'Tente remover os filtros aplicados para visualizar outros perfis.'
                : 'Crie seu primeiro perfil para iniciar navegações isoladas de alta segurança.'}
            </p>
          </div>
        ) : (
          filteredAccounts.map(acc => {
            const isSelected = selectedAccountIds.includes(acc.id);
            const statusStyle = getStatusBadgeStyle(acc.status || 'new');
            const isOpening = openingProfileId === acc.id;

            return (
              <div
                key={acc.id}
                style={{ zIndex: openProfileMenuId === acc.id || openStatusMenuId === acc.id ? 40 : 'auto' }}
                className={`relative grid grid-cols-[auto_1fr_auto] md:grid-cols-[44px_minmax(180px,1.5fr)_minmax(130px,1fr)_minmax(140px,1.2fr)_minmax(130px,1fr)_minmax(110px,1fr)_44px] gap-y-3 items-center min-h-[72px] px-5 border-b border-[#F0F0F2] last:border-b-0 transition-all ${
                  isSelected ? 'bg-[#F0F7FF]' : 'hover:bg-[#F5F5F7]/70'
                }`}
              >
                {/* Checkbox */}
                <div className="flex items-center justify-center pr-2 md:pr-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectAccount(acc.id)}
                    className="w-4 h-4 rounded border-[#E8E8EA] text-[#0071E3] focus:ring-[#0071E3]/20 cursor-pointer"
                  />
                </div>

                {/* Perfil (Play + Avatar + Nome) */}
                <div className="flex items-center gap-2.5 min-w-0 pr-3">
                  {/* Play Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenAccount(acc)}
                    disabled={isOpening || (authBrowserSession?.directAccountId === acc.id)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all cursor-pointer disabled:opacity-50 ${
                      isOpening
                        ? 'bg-[#0071E3] text-white pulse-active'
                        : 'bg-[#EFF6FF] text-[#0071E3] hover:bg-[#0071E3] hover:text-white hover:scale-105 active:scale-95'
                    }`}
                    title="Abrir perfil no Chrome isolado com Fingerprint"
                    aria-label={`Abrir perfil ${acc.username}`}
                  >
                    {isOpening ? (
                      <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" />
                    ) : (
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        play_arrow
                      </span>
                    )}
                  </button>

                  <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-tr from-[#0071E3]/20 to-[#0071E3]/5 border border-[#E8E8EA] text-[#0071E3] flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs">
                    {typeof acc.avatar_url === 'string' && acc.avatar_url ? (
                      <img
                        src={acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      String(acc.display_name || acc.username || 'P').substring(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1D1D1F] truncate">
                      {acc.display_name || acc.username}
                    </div>
                    <div className="text-[11px] font-normal text-[#86868B] truncate">
                      @{acc.display_name || acc.username}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="hidden md:flex flex-wrap items-center gap-1.5 min-w-0 pr-2">
                  {typeof acc.tags === 'string' && acc.tags.trim() ? (
                    acc.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-[#F5F5F7] px-2.5 py-0.5 text-[10px] font-semibold text-[#1D1D1F] border border-[#E8E8EA] hover:border-[#0071E3]/30 transition-colors truncate max-w-[100px]"
                        title={tag}
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[#86868B] italic">—</span>
                  )}
                </div>

                {/* Notas */}
                <div className="hidden md:block pr-4 min-w-0 text-xs text-[#86868B] truncate" title={acc.notes || ''}>
                  {acc.notes || '—'}
                </div>

                {/* Status Badge + Popover */}
                <div className="hidden md:flex items-center pr-3 relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenStatusMenuId(current => current === acc.id ? null : acc.id);
                    }}
                    style={{
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                      borderColor: statusStyle.border,
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold border hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-xs"
                    title="Clique para alterar o status do perfil"
                  >
                    <span>{getStatusLabel(acc.status || 'new')}</span>
                    <span className="material-symbols-outlined text-[13px]">expand_more</span>
                  </button>

                  {openStatusMenuId === acc.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenStatusMenuId(null); }} />
                      <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[130px] bg-white border border-[#E8E8EA] rounded-2xl p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.12)] space-y-1 animate-modal-scale">
                        {[
                          { value: 'new', label: 'Novo', color: '#0071E3' },
                          { value: 'active', label: 'Ativo', color: '#059669' },
                          { value: 'paused', label: 'Pausado', color: '#D97706' },
                          { value: 'banned', label: 'Banido', color: '#DC2626' },
                        ].map(opt => {
                          const isSelectedOpt = (acc.status || 'new') === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickStatusChange(acc, opt.value);
                                setOpenStatusMenuId(null);
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                isSelectedOpt ? 'bg-[#F5F5F7]' : 'hover:bg-[#F5F5F7]'
                              }`}
                              style={{ color: opt.color }}
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
                                {opt.label}
                              </span>
                              {isSelectedOpt && <span className="material-symbols-outlined text-[14px]">check</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Timeline / Linha do Tempo */}
                <div className="hidden md:flex items-center gap-2 text-xs font-medium text-[#86868B]">
                  <span className={`w-1.5 h-1.5 rounded-full ${acc.last_opened_at ? 'bg-[#059669]' : 'bg-[#D1D5DB]'}`} />
                  {formatRelativeTime(acc.last_opened_at)}
                </div>

                {/* Ações Menu (Três Pontos) */}
                <div className="relative justify-self-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenProfileMenuId(current => current === acc.id ? null : acc.id);
                    }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors cursor-pointer"
                    aria-label={`Ações do perfil ${acc.username}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                  </button>

                  {openProfileMenuId === acc.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenProfileMenuId(null);
                        }}
                      />
                      <div className="absolute right-0 top-9 z-40 w-48 rounded-2xl border border-[#E8E8EA] bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.12)] animate-modal-scale space-y-0.5">

                        <button
                          type="button"
                          onClick={() => { setOpenProfileMenuId(null); openEditModal(acc); }}
                          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px] text-[#0071E3]">edit</span>
                          Editar perfil
                        </button>
                        <div className="my-1 border-t border-[#F0F0F2]" />
                        <button
                          type="button"
                          onClick={() => { setOpenProfileMenuId(null); handleDeleteAccount(acc); }}
                          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px] text-[#DC2626]">delete</span>
                          Excluir perfil
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Mobile Info view */}
                <div className="md:hidden col-span-3 flex items-center justify-between pl-11 pt-1 text-[11px] text-[#86868B]">
                  <span className="rounded-full bg-[#F5F5F7] px-2.5 py-0.5 font-bold text-[#1D1D1F]">
                    {getStatusLabel(acc.status || 'new')}
                  </span>
                  <span>{formatRelativeTime(acc.last_opened_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Bulk Actions Floating Bar (Ações em Lote - Apple Clean Dock /DESIGN) ─── */}
      {selectedAccountIds.length > 0 && (
        <div className="fixed bottom-8 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-xl text-[#1D1D1F] px-4 py-2.5 rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.14)] flex items-center gap-2.5 animate-slide-up-float border border-[#E8E8EA] max-w-[92vw] ring-1 ring-black/5">
            {/* Badge & Contador */}
            <div className="flex items-center gap-2 pl-1 pr-1.5 py-0.5">
              <span className="w-5 h-5 rounded-full bg-[#0071E3] text-white flex items-center justify-center text-[11px] font-bold shadow-[0_2px_8px_rgba(0,113,227,0.35)]">
                {selectedAccountIds.length}
              </span>
              <span className="text-xs font-bold tracking-tight text-[#1D1D1F] whitespace-nowrap">
                selecionado{selectedAccountIds.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="h-4 w-px bg-[#E8E8EA]" />

            {/* Bulk Multi-Launch Grid Button (Abertura Direta em Grade Inteligente) */}
            <button
              type="button"
              onClick={handleExecuteMultiLaunch}
              disabled={isLaunchingMultiple || selectedAccountIds.length === 0}
              className="h-8.5 px-3.5 rounded-full bg-[#0071E3] hover:bg-[#005CBB] active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_2px_10px_rgba(0,113,227,0.3)] cursor-pointer disabled:opacity-50"
              title="Abrir perfis selecionados simultaneamente lado a lado em Grade Inteligente no Instagram"
            >
              {isLaunchingMultiple ? (
                <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
              )}
              <span>Abrir Grade ({selectedAccountIds.length})</span>
            </button>


            {/* Bulk Status Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsBulkStatusOpen(prev => !prev)}
                className="h-8.5 px-3.5 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] active:scale-95 text-xs font-semibold text-[#1D1D1F] border border-[#E8E8EA] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Alterar Status</span>
                <span className={`material-symbols-outlined text-[16px] text-[#86868B] transition-transform duration-200 ${isBulkStatusOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {isBulkStatusOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsBulkStatusOpen(false)} />
                  <div className="absolute bottom-full mb-2.5 left-0 z-50 min-w-[160px] bg-white/95 backdrop-blur-xl border border-[#E8E8EA] rounded-2xl p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.12)] space-y-0.5 animate-modal-scale">
                    {[
                      { value: 'new', label: 'Novo', color: '#0071E3', bg: '#EFF6FF' },
                      { value: 'active', label: 'Ativo', color: '#16A34A', bg: '#F0FDF4' },
                      { value: 'paused', label: 'Pausado', color: '#D97706', bg: '#FFFBEB' },
                      { value: 'banned', label: 'Banido', color: '#DC2626', bg: '#FEF2F2' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleBulkStatusChange(opt.value)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7] active:scale-98 transition-all cursor-pointer"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Botão Fechar Todos os Navegadores */}
            <button
              type="button"
              onClick={handleCloseAllBrowsers}
              className="h-8.5 px-3 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] active:scale-95 text-xs font-semibold text-[#1D1D1F] border border-[#E8E8EA] flex items-center gap-1.5 transition-all cursor-pointer"
              title="Encerrar todas as janelas do Chrome externas abertas pelo MultiLogin"
            >
              <span className="material-symbols-outlined text-[15px] text-[#86868B]">cancel</span>
              <span>Fechar Navegadores</span>
            </button>

            {/* Botão Excluir */}
            <button
              type="button"
              onClick={handleBulkDelete}
              className="h-8.5 px-3.5 rounded-full bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 border border-rose-200/80 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px] text-rose-500">delete</span>
              <span>Excluir</span>
            </button>

            <div className="h-4 w-px bg-[#E8E8EA]" />

            {/* Botão Desmarcar */}
            <button
              type="button"
              onClick={() => setSelectedAccountIds([])}
              title="Pressione ESC para desmarcar"
              className="h-8.5 px-2.5 rounded-full hover:bg-[#F5F5F7] active:scale-95 text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] flex items-center gap-1 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-[#86868B]">close</span>
              <span>Desmarcar</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal Flutuante: Novo Perfil (Apple Minimalist /DESIGN) ─── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-[620px] max-h-[90vh] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col animate-modal-scale my-auto">
            
            {/* Modal Header */}
            <header className="px-6 py-5 border-b border-[#E8E8EA] flex items-center justify-between bg-white flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.02em] text-[#1D1D1F]">Criar Novo Perfil</h2>
                <p className="text-xs text-[#86868B] mt-0.5">Configure os dados de acesso, tag e proxy do ambiente isolado.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateProfile}
                className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </header>

            {/* Modal Body (Scrollable) */}
            <main className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar bg-[#FAFAFC]">
              <form id="create-profile-form" onSubmit={handleCreateAccount} className="space-y-5">
                
                {/* Seção 1: Informações Gerais */}
                <section className="bg-white rounded-xl border border-[#E8E8EA] p-5 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868B]">Informações Gerais</h3>
                  
                  <div>
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      Nome do perfil / Usuário
                    </label>
                    <input
                      ref={newUsernameInputRef}
                      type="text"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      placeholder="Ex: @meuperfil ou Nome de exibição"
                      required
                      autoFocus
                      className="w-full h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-[#1D1D1F]">Tags do Perfil</label>
                      {selectedTagsList.length > 0 && (
                        <span className="text-[11px] font-semibold text-[#0071E3]">
                          {selectedTagsList.length} selecionada{selectedTagsList.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    
                    <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA]">
                      <div className="flex flex-wrap items-center gap-2">
                        {allAvailableTags.map(tag => {
                          const isSelected = selectedTagsList.some(t => t.toLowerCase() === tag.toLowerCase());
                          return (
                            <div
                              key={tag}
                              className={`group/tag relative inline-flex items-center h-7 rounded-full text-xs font-semibold transition-all select-none ${
                                isSelected
                                  ? 'bg-[#0071E3] text-white shadow-xs'
                                  : 'bg-white text-[#1D1D1F] hover:bg-[#E8E8EA] border border-[#E8E8EA]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleTag(tag)}
                                title={isSelected ? `Remover tag "${tag}" deste perfil` : `Adicionar tag "${tag}"`}
                                className="h-full pl-3 pr-2 flex items-center gap-1.5 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {isSelected ? 'check' : 'add'}
                                </span>
                                <span>{tag}</span>
                              </button>

                              {isSelected ? (
                                <button
                                  type="button"
                                  onClick={() => toggleTag(tag)}
                                  title={`Desmarcar tag "${tag}" deste perfil`}
                                  className="h-5 w-5 mr-1 rounded-full flex items-center justify-center transition-all cursor-pointer text-white/70 hover:text-white hover:bg-white/20"
                                >
                                  <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTag(tag, e)}
                                  title={`Excluir tag "${tag}" do catálogo do sistema`}
                                  className="h-5 w-5 mr-1 rounded-full flex items-center justify-center transition-all cursor-pointer opacity-0 group-hover/tag:opacity-100 text-[#86868B] hover:text-[#DC2626] hover:bg-[#DC2626]/10"
                                >
                                  <span className="material-symbols-outlined text-[12px] leading-none">delete</span>
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <div className="flex items-center gap-1 ml-auto">
                          <input
                            type="text"
                            value={customTagInput}
                            onChange={e => setCustomTagInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomTag();
                              }
                            }}
                            placeholder="+ Criar tag"
                            className="h-7 w-28 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-[#E8E8EA] focus:outline-none focus:border-[#0071E3] transition-all"
                          />
                          {customTagInput.trim() && (
                            <button
                              type="button"
                              onClick={handleAddCustomTag}
                              className="h-7 px-3 rounded-full bg-[#0071E3] text-white text-xs font-bold hover:bg-[#005CBB] transition-colors cursor-pointer"
                            >
                              OK
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">Notas / Observações</label>
                    <textarea
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value.slice(0, 1500))}
                      placeholder="Escreva anotações importantes para este ambiente..."
                      className="w-full h-24 rounded-xl bg-[#F5F5F7] p-3 text-xs leading-relaxed font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-none"
                    />
                  </div>
                </section>

                {/* Seção 2: Proxy & Conexão */}
                <section className="bg-white rounded-xl border border-[#E8E8EA] p-5 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868B]">Proxy &amp; Conexão</h3>

                  <div>
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">Detalhes do Proxy</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProxy}
                        onChange={e => { setNewProxy(e.target.value); setNewProxyTestResult(null); }}
                        placeholder="ip:porta:usuario:senha ou http://user:pass@ip:port"
                        className="flex-1 h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleTestNewProxy}
                        disabled={testingNewProxy || !newProxy.trim()}
                        className="h-10 px-4 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8EA] border border-[#E8E8EA] text-xs font-semibold text-[#1D1D1F] flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {testingNewProxy ? <span className="spinner !w-3 !h-3" /> : 'Testar IP'}
                      </button>
                    </div>

                    {newProxyTestResult && (
                      <div className={`mt-2 p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                        newProxyTestResult.working
                          ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                          : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]'
                      }`}>
                        <span className="material-symbols-outlined text-[16px]">
                          {newProxyTestResult.working ? 'check_circle' : 'error'}
                        </span>
                        <span>
                          {newProxyTestResult.working
                            ? `Proxy Funcional! IP: ${newProxyTestResult.ip} • Latência: ${newProxyTestResult.latency_ms}ms`
                            : `Erro no Proxy: ${newProxyTestResult.error}`}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              </form>
            </main>

            {/* Modal Sticky Footer */}
            <footer className="px-6 py-4 border-t border-[#E8E8EA] bg-white flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={closeCreateProfile}
                className="h-10 px-5 rounded-xl border border-[#E8E8EA] bg-white hover:bg-[#F5F5F7] text-xs font-semibold text-[#1D1D1F] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="create-profile-form"
                disabled={savingNewAccount || !newUsername.trim()}
                className="h-10 px-6 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] text-white text-xs font-bold shadow-[0_4px_14px_rgba(0,113,227,0.25)] transition-all disabled:opacity-45 disabled:shadow-none cursor-pointer"
              >
                {savingNewAccount ? <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" /> : 'Salvar Perfil'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ─── Modal Flutuante: Confirmar Exclusão de Perfil ─── */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-[420px] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-6 overflow-hidden flex flex-col items-center text-center animate-modal-scale">
            
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[24px]">delete_forever</span>
            </div>

            <h3 className="text-base font-bold text-[#1D1D1F]">
              {accountToDelete.isBulk
                ? `Excluir ${accountToDelete.count} Perfil(is)?`
                : `Excluir @${accountToDelete.username}?`}
            </h3>

            <p className="text-xs text-[#86868B] mt-2 leading-relaxed">
              {accountToDelete.isBulk
                ? `Esta ação removerá permanentemente os ${accountToDelete.count} perfis selecionados e seus dados associados. Não é possível desfazer.`
                : `Esta ação removerá permanentemente a conta @${accountToDelete.username} e seus dados de navegação. Não é possível desfazer.`}
            </p>

            <div className="flex items-center justify-end gap-3 w-full mt-6">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                disabled={deletingAccount}
                className="flex-1 h-10 rounded-xl border border-[#E8E8EA] bg-white hover:bg-[#F5F5F7] text-xs font-semibold text-[#1D1D1F] transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={deletingAccount}
                className="flex-1 h-10 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold shadow-[0_4px_14px_rgba(220,38,38,0.25)] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingAccount ? (
                  <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" />
                ) : (
                  'Excluir'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Flutuante: Editar Perfil (Visual Apple Clean /DESIGN - Ref Imagem 2) ─── */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-[620px] max-h-[90vh] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col animate-modal-scale my-auto">
            
            {/* Modal Header */}
            <header className="px-6 py-5 border-b border-[#E8E8EA] flex items-center justify-between bg-white flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.02em] text-[#1D1D1F]">
                  Editar Perfil @{editingAccount.display_name || editingAccount.username}
                </h2>
                <p className="text-xs text-[#86868B] mt-0.5">
                  Atualize os dados de acesso, tag e proxy do ambiente isolado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
                title="Fechar"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </header>

            {/* Modal Body (Scrollable) */}
            <main className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar bg-[#FAFAFC]">
              
              {/* Seção 1: Informações Gerais */}
              <section className="bg-white rounded-xl border border-[#E8E8EA] p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868B]">Informações Gerais</h3>

                {/* Avatar e Nome de Usuário Lado a Lado */}
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    <label className="relative cursor-pointer group block" title="Clique para alterar a foto do perfil">
                      <div className="w-[52px] h-[52px] rounded-full overflow-hidden border-2 border-[#E8E8EA] group-hover:border-[#0071E3] transition-all shadow-xs flex items-center justify-center bg-[#F5F5F7] relative">
                        {editAvatarPreview ? (
                          <img src={editAvatarPreview} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-tr from-[#0071E3]/10 to-[#4da3ff]/20 flex items-center justify-center text-[#0071E3]">
                            <span className="material-symbols-outlined text-[28px]">account_circle</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all text-white">
                          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                        </div>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files[0];
                          if (!f) return;
                          setEditAvatarFile(f);
                          setEditAvatarPreview(URL.createObjectURL(f));
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                      Nome do perfil / Usuário
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={e => setEditDisplayName(e.target.value)}
                      placeholder="Ex: @meuperfil ou Nome de exibição"
                      required
                      className="w-full h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                    />
                  </div>
                </div>

                {/* Status da Conta (Segmented Control Compacto) */}
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">
                    Status da Conta
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA]/80">
                    {STATUS_OPTIONS.map(status => {
                      const isSelected = editStatus === status.id;
                      return (
                        <button
                          key={status.id}
                          type="button"
                          onClick={() => setEditStatus(status.id)}
                          className={`h-8 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white shadow-xs font-bold'
                              : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-white/50'
                          }`}
                          style={isSelected ? { color: status.color } : {}}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${isSelected ? 'animate-pulse' : 'opacity-40'}`} />
                          <span>{status.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tags do Perfil */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#1D1D1F]">Tags do Perfil</label>
                    {editSelectedTagsList.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#0071E3]">
                        {editSelectedTagsList.length} selecionada{editSelectedTagsList.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  <div className="p-3.5 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA]">
                    <div className="flex flex-wrap items-center gap-2">
                      {allAvailableTags.map(tag => {
                        const isSelected = editSelectedTagsList.some(t => t.toLowerCase() === tag.toLowerCase());
                        return (
                          <div
                            key={tag}
                            className={`group/tag relative inline-flex items-center h-7 rounded-full text-xs font-semibold transition-all select-none ${
                              isSelected
                                ? 'bg-[#0071E3] text-white shadow-xs'
                                : 'bg-white text-[#1D1D1F] hover:bg-[#E8E8EA] border border-[#E8E8EA]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleEditTag(tag)}
                              title={isSelected ? `Remover tag "${tag}" deste perfil` : `Adicionar tag "${tag}"`}
                              className="h-full pl-3 pr-2 flex items-center gap-1.5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                {isSelected ? 'check' : 'add'}
                              </span>
                              <span>{tag}</span>
                            </button>

                            {isSelected ? (
                              <button
                                type="button"
                                onClick={() => toggleEditTag(tag)}
                                title={`Desmarcar tag "${tag}" deste perfil`}
                                className="h-5 w-5 mr-1 rounded-full flex items-center justify-center transition-all cursor-pointer text-white/70 hover:text-white hover:bg-white/20"
                              >
                                <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTag(tag, e)}
                                title={`Excluir tag "${tag}" do catálogo do sistema`}
                                className="h-5 w-5 mr-1 rounded-full flex items-center justify-center transition-all cursor-pointer opacity-0 group-hover/tag:opacity-100 text-[#86868B] hover:text-[#DC2626] hover:bg-[#DC2626]/10"
                              >
                                <span className="material-symbols-outlined text-[12px] leading-none">delete</span>
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-1 ml-auto">
                        <input
                          type="text"
                          value={editCustomTagInput}
                          onChange={e => setEditCustomTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddEditCustomTag();
                            }
                          }}
                          placeholder="+ Criar tag"
                          className="h-7 w-28 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-[#E8E8EA] focus:outline-none focus:border-[#0071E3] transition-all"
                        />
                        {editCustomTagInput.trim() && (
                          <button
                            type="button"
                            onClick={handleAddEditCustomTag}
                            className="h-7 px-3 rounded-full bg-[#0071E3] text-white text-xs font-bold hover:bg-[#005CBB] transition-colors cursor-pointer"
                          >
                            OK
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notas / Observações */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#1D1D1F]">Notas / Observações</label>
                    <span className="text-[10px] font-mono text-[#86868B]">
                      {editNotes.length} / 1500
                    </span>
                  </div>
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value.slice(0, 1500))}
                    placeholder="Escreva anotações importantes para este ambiente..."
                    className="w-full h-24 rounded-xl bg-[#F5F5F7] p-3 text-xs leading-relaxed font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-none"
                  />
                </div>
              </section>

              {/* Seção 2: Proxy & Conexão */}
              <section className="bg-white rounded-xl border border-[#E8E8EA] p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#86868B]">Proxy &amp; Conexão</h3>

                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">Detalhes do Proxy</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editProxy}
                      onChange={e => { setEditProxy(e.target.value); setEditProxyTestResult(null); }}
                      placeholder="ip:porta:usuario:senha ou http://user:pass@ip:port"
                      className="flex-1 h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleTestProxy}
                      disabled={testingProxy || !editProxy.trim()}
                      className="h-10 px-4 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8EA] border border-[#E8E8EA] text-xs font-semibold text-[#1D1D1F] flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer flex-shrink-0"
                    >
                      {testingProxy ? <span className="spinner !w-3 !h-3" /> : 'Testar IP'}
                    </button>
                  </div>

                  {editProxyTestResult && (
                    <div className={`mt-2 p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      editProxyTestResult.working
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                        : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]'
                    }`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {editProxyTestResult.working ? 'check_circle' : 'error'}
                      </span>
                      <span>
                        {editProxyTestResult.working
                          ? `Proxy Funcional! IP: ${editProxyTestResult.ip} • Latência: ${editProxyTestResult.latency_ms}ms`
                          : `Erro no Proxy: ${editProxyTestResult.error}`}
                      </span>
                    </div>
                  )}
                </div>
              </section>

            </main>

            {/* Modal Sticky Footer */}
            <footer className="px-6 py-4 border-t border-[#E8E8EA] bg-white flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="h-10 px-5 rounded-xl border border-[#E8E8EA] bg-white hover:bg-[#F5F5F7] text-xs font-semibold text-[#1D1D1F] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="h-10 px-6 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] text-white text-xs font-bold shadow-[0_4px_14px_rgba(0,113,227,0.25)] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {savingEdit ? <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" /> : 'Salvar Alterações'}
              </button>
            </footer>
          </div>
        </div>
      )}


      {/* ─── Modal 3: Apelido da Conta (Fiel ao Print) ─── */}
      {isNicknameModalOpen && nicknameData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-[360px] flex flex-col items-center relative shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-[#E8E8EA] animate-modal-scale">
            
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsNicknameModalOpen(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] text-[#86868B] flex items-center justify-center transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>

            {/* Header */}
            <h3 className="text-sm font-bold text-[#1D1D1F] mb-4">
              Apelido da conta
            </h3>

            {/* Profile Avatar */}
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-tr from-rose-500 to-amber-500 p-0.5 shadow-md mb-3">
              <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                {nicknameData.avatar_url ? (
                  <img src={nicknameData.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-[#1D1D1F]">
                    {String(nicknameData.username || 'IG').substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Username & Subtitle */}
            <div className="text-base font-bold text-[#1D1D1F] tracking-tight">
              @{nicknameData.username}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#86868B] font-medium mt-0.5 mb-5">
              <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold">
                📷
              </span>
              <span>@{nicknameData.username}</span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSaveNicknameAccount} className="w-full flex flex-col items-center">
              <div className="w-full relative">
                <input
                  ref={nicknameInputRef}
                  type="text"
                  placeholder="minhacontainsta"
                  value={nicknameInput}
                  onChange={e => setNicknameInput(e.target.value)}
                  className="w-full h-11 px-4 text-center rounded-2xl border-2 border-[#F43F5E] focus:outline-none focus:ring-4 focus:ring-[#F43F5E]/15 text-xs font-semibold text-[#1D1D1F] bg-white transition-all shadow-xs"
                  required
                />
              </div>

              <p className="text-[11px] text-[#86868B] font-medium text-center mt-2.5 mb-5">
                Facilite a identificação das suas contas!
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsNicknameModalOpen(false)}
                  disabled={isSavingNickname}
                  className="flex-1 h-10 rounded-full bg-[#E5E7EB] hover:bg-[#D1D5DB] text-[#4B5563] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingNickname || !nicknameInput.trim()}
                  className="flex-1 h-10 rounded-full bg-[#F43F5E] hover:bg-[#E11D48] text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingNickname ? (
                    <div className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" />
                  ) : (
                    'Ok'
                  )}
                </button>
              </div>

              <p className="text-[9px] text-[#DC2626] font-semibold text-center mt-4 leading-tight">
                ⚠️ IMPORTANTE: O apelido facilita a organização e agendamento dos seus posts.
              </p>
            </form>

          </div>
        </div>
      )}

      {/* ─── Modal Flutuante: Gerenciador de Extensões (/DESIGN Apple Minimalist) ─── */}
      {isExtensionsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-[680px] max-h-[90vh] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col animate-modal-scale my-auto">
            
            {/* Modal Header */}
            <header className="px-6 py-5 border-b border-[#E8E8EA] flex items-center justify-between bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#0071E3] flex items-center justify-center shadow-xs flex-shrink-0">
                  <span className="material-symbols-outlined text-[22px]">extension</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.02em] text-[#1D1D1F]">Gerenciador de Extensões</h2>
                  <p className="text-xs text-[#86868B] mt-0.5">Controle extensões ativas globalmente nos navegadores isolados.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Upload ZIP button */}
                <label className="h-9 px-3.5 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] active:scale-95 text-[#1D1D1F] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border border-[#E8E8EA]">
                  <span className="material-symbols-outlined text-[16px] text-[#0071E3]">upload_file</span>
                  <span>{uploadingExtZip ? 'Carregando...' : 'Instalar ZIP'}</span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleUploadExtensionZip}
                    disabled={uploadingExtZip}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setIsExtensionsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </header>

            {/* Modal Body */}
            <main className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar bg-[#FAFAFC]">
              {loadingExtensions && extensionsList.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-48 gap-3">
                  <span className="spinner" style={{ width: '30px', height: '30px' }} />
                  <span className="text-xs font-medium text-[#86868B]">Carregando catálogo de extensões...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {extensionsList.map(ext => {
                    const isEnabled = ext.enabled !== false;
                    return (
                      <div
                        key={ext.id}
                        className={`p-4 rounded-2xl border transition-all bg-white shadow-2xs flex flex-col justify-between gap-3 ${
                          isEnabled ? 'border-[#0071E3]/25 hover:border-[#0071E3]/40' : 'border-[#E8E8EA] opacity-80'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-7 h-7 rounded-lg bg-[#EFF6FF] text-[#0071E3] flex items-center justify-center text-xs font-bold flex-shrink-0">
                                <span className="material-symbols-outlined text-[16px]">{ext.icon || 'extension'}</span>
                              </span>
                              <span className="text-xs font-bold text-[#1D1D1F] truncate">{ext.name}</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[#86868B] font-mono border border-[#E8E8EA] flex-shrink-0">
                              v{ext.version}
                            </span>
                          </div>

                          <p className="text-[11px] text-[#86868B] leading-relaxed line-clamp-2">
                            {ext.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#F0F0F2] text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F5F5F7] text-[#86868B] text-[10px] font-semibold">
                            {ext.is_builtin ? 'Embutida' : 'Customizada'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleGlobalExtension(ext.id, isEnabled)}
                            className={`h-7 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                              isEnabled
                                ? 'bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] border border-[#A7F3D0]'
                                : 'bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8EA] border border-[#E8E8EA]'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-[#059669]' : 'bg-[#86868B]'}`} />
                            <span>{isEnabled ? 'Ativa' : 'Desativada'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>

            {/* Modal Footer */}
            <footer className="px-6 py-4 border-t border-[#E8E8EA] bg-white flex items-center justify-between gap-3 flex-shrink-0">
              <span className="text-[11px] text-[#86868B]">
                💡 As extensões ativas são injetadas em todas as janelas do Chrome externas.
              </span>
              <button
                type="button"
                onClick={() => setIsExtensionsModalOpen(false)}
                className="h-9 px-5 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Concluído
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}
