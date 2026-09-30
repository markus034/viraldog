import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../config';

const API = 'http://localhost:8000';

export default function ConnectedAccountsTab({ pubState, triggerToast, isModal = false, isOpen = true, onClose }) {
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountToDisconnect, setAccountToDisconnect] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

  const fetchConnectedAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        // Filtrar apenas contas que possuem conexão com a API Oficial da Meta
        const official = (Array.isArray(data) ? data : []).filter(
          a => a.auth_mode === 'official_api' || a.has_official_token || a.fb_ig_account_id
        );
        setAccounts(official);
        if (pubState?.fetchAccounts) pubState.fetchAccounts();
      }
    } catch (e) {
      console.error(e);
      triggerToast?.('Erro ao carregar contas conectadas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isModal && !isOpen) return;
    fetchConnectedAccounts();

    // Listener para mensagens vindas do popup OAuth
    const handleMessage = async (event) => {
      if (!event.data) return;
      if (event.data.type === 'META_OAUTH_SUCCESS') {
        const accs = event.data.accounts || [];
        const names = accs.map(a => `@${a.username}`).join(', ');
        triggerToast?.(`✅ Conta oficial vinculada com sucesso: ${names || 'Instagram'}!`, 'success');
        setConnecting(false);
        await fetchConnectedAccounts();
        setTimeout(() => fetchConnectedAccounts(), 1500);
      } else if (event.data.type === 'META_OAUTH_ERROR' || event.data.type === 'IG_OAUTH_ERROR') {
        triggerToast?.(`❌ Falha ao autorizar conta: ${event.data.error || 'Cancelado'}`, 'error');
        setConnecting(false);
      } else if (event.data.type === 'META_OAUTH_CODE' && event.data.code) {
        try {
          const res = await fetch(`${API}/auth/callback?code=${encodeURIComponent(event.data.code)}&state=${encodeURIComponent(event.data.state || '')}`);
          if (res.ok) {
            triggerToast?.('✅ Conta vinculada com sucesso via API Oficial!', 'success');
            await fetchConnectedAccounts();
            setTimeout(() => fetchConnectedAccounts(), 1500);
          } else {
            const errHtml = await res.text();
            triggerToast?.('❌ Erro ao validar token do Instagram.', 'error');
          }
        } catch (err) {
          console.error('[OAuth Web Callback Error]', err);
          triggerToast?.('❌ Erro ao comunicar com o servidor.', 'error');
        } finally {
          setConnecting(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);

    // Listener para o Deep Link do Electron
    let cleanupElectron = null;
    if (isElectron && window.electronAPI?.onMetaOAuthComplete) {
      cleanupElectron = window.electronAPI.onMetaOAuthComplete(async (result) => {
        setConnecting(false);
        if (result?.success === false) {
          triggerToast?.(`❌ ${result?.error || 'Falha ao vincular conta do Instagram.'}`, 'error');
        } else {
          triggerToast?.('✅ Conta do Instagram vinculada com sucesso via API Oficial!', 'success');
          await fetchConnectedAccounts();
          setTimeout(() => fetchConnectedAccounts(), 1500);
        }
      });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      if (typeof cleanupElectron === 'function') cleanupElectron();
    };
  }, [isElectron, triggerToast, isModal, isOpen]);

  const handleConnectInstagram = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch('/api/auth/meta/url');
      const data = await res.json();
      if (res.ok && data.auth_url) {
        const width = 580;
        const height = 720;
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
        triggerToast?.('Aguardando autorização na janela modal do Instagram...', 'info');

        const pollTimer = setInterval(() => {
          if (popup && popup.closed) {
            clearInterval(pollTimer);
            setConnecting(false);
          }
        }, 1000);
      } else {
        setConnecting(false);
        triggerToast?.(data.detail || 'Erro ao gerar link de conexão oficial.', 'error');
      }
    } catch (e) {
      console.error(e);
      setConnecting(false);
      triggerToast?.('Erro de conexão com o backend.', 'error');
    }
  };

  const handleConfirmDisconnect = async () => {
    if (!accountToDisconnect) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`${API}/api/accounts/${accountToDisconnect.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        triggerToast?.(`Conta @${accountToDisconnect.username} desconectada com sucesso.`, 'success');
        setAccountToDisconnect(null);
        await fetchConnectedAccounts();
      } else {
        triggerToast?.('Falha ao desconectar conta.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast?.('Erro ao desconectar conta.', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSyncAvatar = async (accountId) => {
    try {
      const res = await apiFetch(`/api/accounts/${accountId}/sync-avatar`, { method: 'POST' });
      if (res.ok) {
        triggerToast?.('Foto de perfil sincronizada!', 'success');
        await fetchConnectedAccounts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const calculateDaysRemaining = (expiresAt) => {
    if (!expiresAt) return 60;
    const now = new Date().getTime();
    const exp = new Date(expiresAt).getTime();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const countScheduledPosts = (username) => {
    const list = pubState?.scheduledPosts || [];
    return list.filter(p => p.account_username === username && p.status === 'pending').length;
  };

  if (isModal && !isOpen) return null;

  const content = (
    <div className="w-full flex flex-col gap-6 fade-in">
      {/* Banner de Conexão Ativa */}
      {connecting && (
        <div className="bg-[#0071E3]/5 border border-[#0071E3]/20 rounded-2xl p-4 flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0071E3]/10 flex items-center justify-center text-[#0071E3]">
              <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#1D1D1F]">Conectando Conta Oficial do Instagram...</p>
              <p className="text-[11px] text-[#86868B]">Conclua a autorização na janela modal para finalizar a vinculação.</p>
            </div>
          </div>
          <button
            onClick={() => setConnecting(false)}
            className="text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] px-3 py-1.5 rounded-lg border border-[#E8E8EA] bg-white transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Header com Ação Principal */}
      <div className="bg-white border border-[#E8E8EA] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[24px] text-[#0071E3]">manage_accounts</span>
            <h2 className="text-lg font-bold text-[#1D1D1F] tracking-tight">Perfis Conectados</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F5F5F7] text-[#1D1D1F] border border-[#E8E8EA]">
              {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
            </span>
          </div>
          <p className="text-xs text-[#86868B] mt-1 max-w-xl">
            Conecte suas contas profissionais do Instagram via API Oficial da Meta para agendar publicações e sincronizar métricas com segurança.
          </p>
        </div>

        <button
          type="button"
          onClick={handleConnectInstagram}
          disabled={connecting}
          className="bg-[#0071E3] hover:bg-[#005CBB] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-[0_4px_14px_rgba(0,113,227,0.25)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0 disabled:opacity-50"
        >
          {connecting ? (
            <div className="spinner !w-3.5 !h-3.5 !border-white/20 !border-t-white" />
          ) : (
            <span className="material-symbols-outlined text-[18px]">verified</span>
          )}
          <span>Conectar Conta Instagram</span>
        </button>
      </div>

      {/* Lista de Contas Conectadas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map(n => (
            <div key={n} className="bg-white border border-[#E8E8EA] rounded-2xl p-5 h-44 animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-[#E8E8EA] rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#0071E3]">
            <span className="material-symbols-outlined text-[32px]">link_off</span>
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-[#1D1D1F]">Nenhuma conta do Instagram conectada</h3>
            <p className="text-xs text-[#86868B] mt-1.5 leading-relaxed">
              Vincule sua conta Instagram Business ou Criador de Conteúdo para começar a agendar Reels, carrosséis e posts com publicação 24/7.
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectInstagram}
            className="mt-2 bg-[#0071E3] hover:bg-[#005CBB] text-white px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_link</span>
            Conectar Minha Primeira Conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const daysLeft = calculateDaysRemaining(acc.fb_token_expires_at);
            const scheduledCount = countScheduledPosts(acc.username);
            const isRevoked = Boolean(acc.revoked);

            return (
              <div
                key={acc.id}
                className="bg-white border border-[#E8E8EA] rounded-2xl p-5 shadow-xs hover:border-[#0071E3]/30 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        onClick={() => handleSyncAvatar(acc.id)}
                        className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#FD5949] to-[#D6249F] p-[2px] shrink-0 cursor-pointer hover:scale-105 transition-transform"
                        title="Clique para sincronizar foto de perfil"
                      >
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                          {acc.avatar_url ? (
                            <img
                              src={acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`}
                              alt={acc.username}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <span className="text-sm font-bold text-[#1D1D1F]">
                              {String(acc.display_name || acc.username || 'IG').slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-[#1D1D1F] truncate">
                            {acc.display_name || acc.username}
                          </h4>
                          {!isRevoked && (
                            <span className="material-symbols-outlined text-[16px] text-[#0084FF] shrink-0" title="API Oficial Verificada">
                              verified
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#86868B] truncate">@{acc.username}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                        isRevoked
                          ? 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]'
                          : 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                      }`}
                    >
                      {isRevoked ? 'Desautorizado' : 'Ativa'}
                    </span>
                  </div>

                  {/* Informações da Conexão */}
                  <div className="mt-4 pt-3 border-t border-[#F5F5F7] grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#F5F5F7] p-2.5 rounded-xl">
                      <span className="text-[10px] text-[#86868B] block">Posts Agendados</span>
                      <span className="text-xs font-bold text-[#1D1D1F] mt-0.5 block">
                        {scheduledCount} {scheduledCount === 1 ? 'post' : 'posts'}
                      </span>
                    </div>

                    <div className="bg-[#F5F5F7] p-2.5 rounded-xl">
                      <span className="text-[10px] text-[#86868B] block">Validade do Token</span>
                      <span className={`text-xs font-bold mt-0.5 block ${daysLeft <= 7 ? 'text-[#DC2626]' : 'text-[#059669]'}`}>
                        {daysLeft > 0 ? `${daysLeft} dias restantes` : 'Expirado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações da Conta */}
                <div className="pt-3 border-t border-[#F5F5F7] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleConnectInstagram}
                    className="text-xs font-semibold text-[#0071E3] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    Reconectar
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountToDisconnect(acc)}
                    className="text-xs font-semibold text-[#86868B] hover:text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    Desconectar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação para Desconectar */}
      {accountToDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-[#E8E8EA] rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-modal-scale">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center text-[#DC2626] mb-4">
              <span className="material-symbols-outlined text-[24px]">link_off</span>
            </div>

            <h3 className="text-base font-bold text-[#1D1D1F]">Desconectar @{accountToDisconnect.username}?</h3>
            <p className="text-xs text-[#86868B] mt-1.5 leading-relaxed">
              Esta conta deixará de publicar automaticamente. Você poderá reconectá-la a qualquer momento sem perder seus vídeos locais.
            </p>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setAccountToDisconnect(null)}
                disabled={disconnecting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#1D1D1F] hover:bg-[#F5F5F7] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white transition-all cursor-pointer flex items-center gap-1.5"
              >
                {disconnecting && <div className="spinner !w-3 !h-3 !border-white/20 !border-t-white" />}
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-modal-scale">
          {/* Header do Modal */}
          <div className="bg-white px-6 py-4 border-b border-[#E8E8ED] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">manage_accounts</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1D1D1F]">Perfis Conectados</h2>
                <p className="text-xs text-[#86868B]">Gerencie e conecte suas contas oficiais do Instagram</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F] flex items-center justify-center transition-colors cursor-pointer"
              title="Fechar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Conteúdo com Scroll */}
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return content;
}
