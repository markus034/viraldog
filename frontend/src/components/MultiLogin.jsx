import { useState, useEffect, useRef } from 'react';
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

  // Sessão de autenticação acompanhada no Chrome externo
  const [authBrowserSession, setAuthBrowserSession] = useState(null);

  // Modal de Apelido da Conta
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameData, setNicknameData] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const nicknameInputRef = useRef(null);



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

  // Listener para capturar o callback do popup oficial da Meta
  useEffect(() => {
    const handleMessage = async (event) => {
      if (!event.data) return;
      if (event.data.type === 'META_OAUTH_SUCCESS') {
        const accs = event.data.accounts || [];
        const names = accs.map(a => `@${a.username}`).join(', ');
        triggerToast(`✅ Conta(s) Oficial Meta vinculada(s) com sucesso: ${names}!`, 'success');
        await fetchAccounts(true);
      } else if (event.data.type === 'META_OAUTH_ERROR' || event.data.type === 'IG_OAUTH_ERROR') {
        triggerToast(`❌ Erro na autorização da Meta: ${event.data.error || 'Operação cancelada'}`, 'error');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [triggerToast]);

  // Listener para capturar o Deep Link nativo (viraldog://auth/callback)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMetaOAuthComplete) return;

    const cleanup = window.electronAPI.onMetaOAuthComplete(async (data) => {
      console.log('[MultiLogin] Deep Link da Meta recebido:', data);
      triggerToast('✅ Conta oficial da Meta vinculada com sucesso pelo aplicativo!', 'success');
      await fetchAccounts(true);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
      else window.electronAPI.removeMetaOAuthComplete?.();
    };
  }, [isElectron, triggerToast]);

  const handleStartMetaOAuthLogin = async () => {
    try {
      const res = await apiFetch('/api/auth/meta/url');
      const data = await res.json();
      if (res.ok && data.auth_url) {
        const width = 640;
        const height = 760;
        const left = (window.innerWidth - width) / 2 + window.screenX;
        const top = (window.innerHeight - height) / 2 + window.screenY;
        const popup = window.open(
          data.auth_url,
          'MetaOAuth',
          `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`
        );
        if (!popup) {
          window.open(data.auth_url, '_blank');
        }
        triggerToast('Janela oficial de Login da Meta aberta.', 'info');
      } else {
        triggerToast(data.detail || 'Erro ao gerar link de login da Meta.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast('Erro de conexão ao iniciar login com a Meta.', 'error');
    }
  };

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
        setAccounts(data);
        window.dispatchEvent(new CustomEvent('viraldog:accounts-updated', { detail: { accounts: data } }));
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

    const handleSync = () => fetchAccounts(true);
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
    const handleOAuthMessage = (event) => {
      if (event.data && event.data.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        triggerToast(`Conta @${event.data.username || ''} conectada e salva com sucesso!`, 'success');
        fetchAccounts();
        closeCreateProfile();
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
          folder: newFolder.trim() || 'Geral'
        })
      });

      if (res.ok) {
        let createdAccount = null;
        const accountsRes = await fetch(`${API}/api/accounts`);
        if (accountsRes.ok) {
          const fetched = await accountsRes.json();
          createdAccount = fetched.find(acc => acc.username === name);
          if (createdAccount) {
            await fetch(`${API}/api/accounts/${createdAccount.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                notes: newNotes.trim() || null,
                tags: newTags.trim() || null,
                folder: newFolder.trim() || 'Geral',
                status: 'new',
              })
            });
          }
        }
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

  // Editar Perfil
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
        account.session_cookies || null
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
    e.preventDefault();
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

      const payload = {
        username: cleanName,
        display_name: cleanName,
        proxy_url: parseProxyInput(editProxy) || '',
        notes: editNotes.trim(),
        tags: editTags.trim(),
        status: editStatus,
        avatar_url: avatarUrl,
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
    new Set([...defaultSuggestedTags, ...existingAccountTags, ...selectedTagsList, ...editSelectedTagsList])
  );

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
    const exists = selectedTagsList.some(t => t.toLowerCase() === trimmed.toLowerCase());
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
    const exists = editSelectedTagsList.some(t => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setEditTags([...editSelectedTagsList, trimmed].join(', '));
    }
    setEditCustomTagInput('');
  };

  const tagOptions = [
    { value: '', label: 'Todas as Tags', icon: 'sell' },
    ...allAvailableTags.map(tag => ({ value: tag, label: tag, icon: 'label' }))
  ];

  const statusOptions = [
    { value: '', label: 'Todos os Status', icon: 'checklist' },
    { value: 'new', label: 'Novo', icon: 'fiber_new' },
    { value: 'active', label: 'Ativo', icon: 'check_circle' },
    { value: 'paused', label: 'Pausado', icon: 'pause_circle' },
    { value: 'banned', label: 'Banido', icon: 'block' },
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
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) return false;
    }

    if (selectedTag) {
      const accTags = (typeof account.tags === 'string' ? account.tags : '').split(',').map(t => t.trim().toLowerCase());
      if (!accTags.includes(selectedTag.toLowerCase())) return false;
    }

    if (selectedStatus) {
      if (String(account.status || 'new').toLowerCase() !== selectedStatus.toLowerCase()) return false;
    }

    return true;
  });

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
      
      {/* ─── Header Minimalista High-End (/DESIGN) ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[#1D1D1F]">Perfis</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F5F5F7] text-[#1D1D1F] border border-[#E8E8EA]">
              {totalCount} {totalCount === 1 ? 'perfil' : 'perfis'}
            </span>
          </div>
          <p className="mt-1 text-[13px] font-normal text-[#86868B]">
            Gerencie e inicie seus ambientes isolados de navegação com alto desempenho.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Counter Badges */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E8E8EA] shadow-xs text-[11px] font-medium">
            <span className="text-[#059669] font-semibold">● {activeCount} Ativo{activeCount !== 1 && 's'}</span>
            <span className="text-[#86868B]">|</span>
            <span className="text-[#0071E3] font-semibold">{newCount} Novo{newCount !== 1 && 's'}</span>
            {pausedCount > 0 && (
              <>
                <span className="text-[#86868B]">|</span>
                <span className="text-[#D97706] font-semibold">{pausedCount} Pausado{pausedCount !== 1 && 's'}</span>
              </>
            )}
            {bannedCount > 0 && (
              <>
                <span className="text-[#86868B]">|</span>
                <span className="text-[#DC2626] font-semibold">{bannedCount} Banido{bannedCount !== 1 && 's'}</span>
              </>
            )}
          </div>

          <button
            type="button"
            className="bg-gradient-to-r from-[#0084FF] to-[#00C6FF] hover:opacity-95 text-white h-10 px-4 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_14px_rgba(0,132,255,0.25)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            onClick={handleStartMetaOAuthLogin}
            title="Conectar contas do Instagram via API Oficial da Meta"
          >
            <span className="material-symbols-outlined text-[18px]">verified</span>
            Conectar com a Meta
          </button>

          <button
            type="button"
            className="bg-[#0071E3] hover:bg-[#005CBB] text-white h-10 px-5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_14px_rgba(0,113,227,0.25)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Criar Perfil
          </button>
        </div>
      </div>

      {/* ─── Toolbar: Busca + Filtros + Atalho ─── */}
      <div className="bg-white border border-[#E8E8EA] rounded-2xl p-3 flex flex-wrap items-center gap-3 card-elevation mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-[420px] flex items-center">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#86868B] pointer-events-none select-none flex items-center justify-center leading-none">
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
        <div className="w-52">
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
            className="h-10 px-3.5 rounded-xl border border-[#E8E8EA] text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Limpar todos os filtros"
          >
            <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
            Limpar Filtros
          </button>
        )}
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

                {/* Perfil (Play + Atualizar Sessão + Avatar + Nome) */}
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
                    title="Abrir perfil no Chrome isolado"
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
                    <div className="text-xs font-bold text-[#1D1D1F] truncate flex items-center gap-1.5">
                      <span className="truncate">{acc.display_name || acc.username}</span>
                      {acc.revoked ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FEF2F2] px-1.5 py-0.5 text-[9px] font-bold text-[#DC2626] border border-[#FCA5A5] shrink-0" title="Acesso desautorizado na Meta. Clique em Conectar com a Meta para reativar.">
                          <span className="material-symbols-outlined text-[10px]">warning</span>
                          Desautorizado
                        </span>
                      ) : (acc.has_official_token || acc.auth_mode === 'official') ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[9px] font-bold text-[#059669] border border-[#A7F3D0] shrink-0" title={`Conectado via API Oficial da Meta ${acc.token_expires_at ? `(expira em ${new Date(acc.token_expires_at).toLocaleDateString('pt-BR')})` : ''}`}>
                          <span className="material-symbols-outlined text-[10px]">verified</span>
                          Meta Oficial
                        </span>
                      ) : null}
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
                      <div className="absolute right-0 top-9 z-40 w-44 rounded-2xl border border-[#E8E8EA] bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.12)] animate-modal-scale space-y-0.5">
                        <button
                          type="button"
                          onClick={() => { setOpenProfileMenuId(null); handleDirectSessionCapture(acc); }}
                          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px] text-amber-600">key</span>
                          Atualizar sessão
                        </button>
                        <div className="my-1 border-t border-[#F0F0F2]" />
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

      {/* ─── Bulk Actions Floating Bar (Ações em Lote - Apple Dark Frosted Glass /DESIGN) ─── */}
      {selectedAccountIds.length > 0 && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-[#1D1D1F]/90 backdrop-blur-xl text-white px-4 py-2.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.35)] flex items-center gap-3 animate-slide-up-float border border-white/12 max-w-[92vw] ring-1 ring-black/5">
          {/* Badge & Contador */}
          <div className="flex items-center gap-2 pl-1 pr-1.5 py-0.5">
            <span className="w-5 h-5 rounded-full bg-[#0071E3] text-white flex items-center justify-center text-[11px] font-bold shadow-[0_2px_8px_rgba(0,113,227,0.4)]">
              {selectedAccountIds.length}
            </span>
            <span className="text-xs font-semibold tracking-[-0.01em] text-white/95 whitespace-nowrap">
              selecionado{selectedAccountIds.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="h-4 w-px bg-white/15" />

          {/* Bulk Status Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsBulkStatusOpen(prev => !prev)}
              className="h-8.5 px-3.5 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-medium text-white flex items-center gap-1.5 transition-all border border-white/10 cursor-pointer"
            >
              <span>Alterar Status</span>
              <span className={`material-symbols-outlined text-[16px] text-white/70 transition-transform duration-200 ${isBulkStatusOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {isBulkStatusOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsBulkStatusOpen(false)} />
                <div className="absolute bottom-full mb-2.5 left-0 z-50 min-w-[155px] bg-[#1D1D1F]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)] space-y-1 animate-modal-scale">
                  {[
                    { value: 'new', label: 'Novo', color: '#60A5FA', glow: 'rgba(96,165,250,0.4)' },
                    { value: 'active', label: 'Ativo', color: '#34D399', glow: 'rgba(52,211,153,0.4)' },
                    { value: 'paused', label: 'Pausado', color: '#FBBF24', glow: 'rgba(251,191,36,0.4)' },
                    { value: 'banned', label: 'Banido', color: '#F87171', glow: 'rgba(248,113,113,0.4)' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleBulkStatusChange(opt.value)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 active:scale-98 transition-all cursor-pointer"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: opt.color, boxShadow: `0 0 6px ${opt.glow}` }}
                      />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Botão Excluir */}
          <button
            type="button"
            onClick={handleBulkDelete}
            className="h-8.5 px-3.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-rose-300 hover:text-rose-200 border border-rose-500/25 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] text-rose-400">delete</span>
            <span>Excluir</span>
          </button>

          <div className="h-4 w-px bg-white/15" />

          {/* Botão Desmarcar */}
          <button
            type="button"
            onClick={() => setSelectedAccountIds([])}
            title="Pressione ESC para desmarcar"
            className="h-8.5 px-2.5 rounded-full hover:bg-white/10 active:scale-95 text-xs font-medium text-white/60 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px] text-white/40">close</span>
            <span>Desmarcar</span>
          </button>
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
              
              {/* Banner API Oficial da Meta */}
              <div className="p-4 bg-gradient-to-r from-[#0084FF]/10 to-[#00C6FF]/10 border border-[#0084FF]/30 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0084FF] text-white flex items-center justify-center shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-[22px]">verified</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1D1D1F]">Conectar Conta Oficial da Meta</h4>
                    <p className="text-[11px] text-[#86868B] mt-0.5">Conecte via Facebook OAuth oficial. Sem necessidade de proxy ou senha.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { closeCreateProfile(); handleStartMetaOAuthLogin(); }}
                  className="px-3.5 py-2 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  Conectar Meta
                </button>
              </div>

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
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-[#0071E3] text-white shadow-xs scale-[1.02]'
                                  : 'bg-white text-[#1D1D1F] hover:bg-[#E8E8EA] border border-[#E8E8EA]'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {isSelected ? 'check' : 'add'}
                              </span>
                              {tag}
                            </button>
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

      {/* ─── Modal Flutuante: Editar Perfil ─── */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-[620px] max-h-[90vh] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col animate-modal-scale my-auto">
            
            {/* Modal Header */}
            <header className="px-6 py-5 border-b border-[#E8E8EA] flex items-center justify-between bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#0071E3]">edit</span>
                <h3 className="text-lg font-bold tracking-[-0.02em] text-[#1D1D1F]">Editar Perfil</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </header>

            {/* Modal Body */}
            <main className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar bg-[#FAFAFC]">
              <form id="edit-profile-form" onSubmit={handleSaveEdit} className="space-y-5">
                
                {/* Avatar + Nome de Exibição */}
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-[#E8E8EA]">
                  <label className="relative cursor-pointer group flex-shrink-0" title="Clique para alterar a foto de perfil">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#E8E8EA] group-hover:border-[#0071E3] transition-colors shadow-sm flex items-center justify-center bg-[#F5F5F7]">
                      {editAvatarPreview ? (
                        <img src={editAvatarPreview} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[32px] text-[#86868B]">account_circle</span>
                      )}
                      <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="material-symbols-outlined text-white text-[18px]">photo_camera</span>
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

                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-[#1D1D1F] mb-1">
                      Nome do Perfil (@username)
                    </label>
                    <input
                      type="text"
                      className="w-full h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                      placeholder="Ex: markus"
                      value={editDisplayName}
                      onChange={e => setEditDisplayName(e.target.value)}
                    />
                    <p className="text-[10px] text-[#86868B] mt-1">
                      O nome e o identificador @ serão sincronizados com este valor.
                    </p>
                  </div>
                </div>

                {/* Tags Picker */}
                <div className="bg-white p-4 rounded-xl border border-[#E8E8EA] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#1D1D1F]">Tags do Perfil</label>
                    {editSelectedTagsList.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#0071E3]">
                        {editSelectedTagsList.length} selecionada{editSelectedTagsList.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  <div className="p-3 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {allAvailableTags.map(tag => {
                        const isSelected = editSelectedTagsList.some(t => t.toLowerCase() === tag.toLowerCase());
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleEditTag(tag)}
                            className={`h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'bg-[#0071E3] text-white shadow-xs scale-[1.02]'
                                : 'bg-white text-[#1D1D1F] hover:bg-[#E8E8EA] border border-[#E8E8EA]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isSelected ? 'check' : 'add'}
                            </span>
                            {tag}
                          </button>
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
                          className="h-7 w-24 rounded-full bg-white px-3 text-xs font-medium text-[#1D1D1F] placeholder:text-[#86868B] border border-[#E8E8EA] focus:outline-none focus:border-[#0071E3] transition-all"
                        />
                        {editCustomTagInput.trim() && (
                          <button
                            type="button"
                            onClick={handleAddEditCustomTag}
                            className="h-7 px-2.5 rounded-full bg-[#0071E3] text-white text-xs font-bold hover:bg-[#005CBB] transition-colors cursor-pointer"
                          >
                            OK
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proxy URL */}
                <div className="bg-white p-4 rounded-xl border border-[#E8E8EA] space-y-2">
                  <label className="block text-xs font-semibold text-[#1D1D1F]">Proxy Dedicado</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 h-10 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
                      placeholder="http://user:pass@ip:port"
                      value={editProxy}
                      onChange={e => { setEditProxy(e.target.value); setEditProxyTestResult(null); }}
                    />
                    <button
                      type="button"
                      className="h-10 px-4 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8EA] border border-[#E8E8EA] text-xs font-semibold text-[#1D1D1F] flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      onClick={handleTestProxy}
                      disabled={testingProxy}
                    >
                      {testingProxy ? <span className="spinner !w-3 !h-3" /> : "Testar IP"}
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

                {/* Notas */}
                <div className="bg-white p-4 rounded-xl border border-[#E8E8EA] space-y-2">
                  <label className="block text-xs font-semibold text-[#1D1D1F]">Notas / Observações</label>
                  <textarea
                    className="w-full h-24 rounded-xl bg-[#F5F5F7] p-3 text-xs leading-relaxed font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-none"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                  />
                </div>
              </form>
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
                type="submit"
                form="edit-profile-form"
                disabled={savingEdit}
                className="h-10 px-6 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] text-white text-xs font-bold shadow-[0_4px_14px_rgba(0,113,227,0.25)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {savingEdit ? <span className="spinner !w-3.5 !h-3.5 !border-white/30 !border-t-white" /> : "Salvar"}
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

    </div>
  );
}
