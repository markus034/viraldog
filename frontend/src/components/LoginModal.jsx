import React, { useState } from 'react';
import { apiFetch, setAuthToken, setCurrentUser, getApiBaseUrl, setServerUrl } from '../config';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, triggerToast }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getApiBaseUrl());

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      triggerToast('Preencha todos os campos.', 'error');
      return;
    }

    if (isRegister && password.trim().length < 6) {
      triggerToast('A senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }

    setLoading(true);
    // Salvar URL personalizada caso o usuário tenha alterado
    if (serverUrl.trim() && serverUrl.trim() !== getApiBaseUrl()) {
      setServerUrl(serverUrl.trim());
    }

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = isRegister ? { email, password, name } : { email, password };

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok && data.access_token) {
        setAuthToken(data.access_token);
        setCurrentUser(data.user);
        triggerToast(`Bem-vindo, ${data.user.name || data.user.email}! 🎉`, 'success');
        if (onLoginSuccess) onLoginSuccess(data.user);
        onClose();
      } else {
        triggerToast(data.detail || 'Falha na autenticação.', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast(`Erro ao conectar ao servidor em ${getApiBaseUrl()}. Verifique se o backend está ativo.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="relative w-full max-w-[420px] bg-white rounded-3xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col animate-modal-scale p-7">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#00C6FF] text-white flex items-center justify-center shadow-md shadow-[#0071E3]/20">
              <span className="material-symbols-outlined text-[20px]">cloud</span>
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-[#1D1D1F]">
                {isRegister ? 'Criar Conta ViralDog' : 'Conectar à Nuvem 24/7'}
              </h3>
              <p className="text-[11px] text-[#86868B]">
                {isRegister ? 'Cadastre-se para publicar com o PC desligado' : 'Acesse suas contas e agendamentos na nuvem'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8EA] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">Seu Nome</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Markus"
                className="w-full h-11 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              className="w-full h-11 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1D1D1F] mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full h-11 rounded-xl bg-[#F5F5F7] px-3.5 text-xs font-medium text-[#1D1D1F] border border-transparent focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all"
            />
          </div>

          {/* Servidor Backend URL Config */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="text-[11px] font-medium text-[#86868B] hover:text-[#0071E3] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">
                {showServerConfig ? 'expand_less' : 'settings'}
              </span>
              <span>Servidor: <strong className="font-semibold text-[#1D1D1F]">{serverUrl}</strong></span>
            </button>

            {showServerConfig && (
              <div className="mt-2 p-2.5 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA] space-y-1.5 animate-fadeIn">
                <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wider">
                  URL da Nuvem / Backend
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={e => setServerUrlState(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="flex-1 h-8 rounded-lg bg-white px-2.5 text-xs text-[#1D1D1F] border border-[#D2D2D7] focus:outline-none focus:border-[#0071E3]"
                  />
                  <button
                    type="button"
                    onClick={() => setServerUrlState('http://localhost:8000')}
                    className="px-2 h-8 rounded-lg bg-[#E8E8EA] hover:bg-[#D2D2D7] text-[11px] font-medium text-[#1D1D1F] transition-colors"
                  >
                    Padrão
                  </button>
                </div>
                <p className="text-[10px] text-[#86868B]">
                  Use <code>http://localhost:8000</code> para testes locais ou o IP da sua VPS Oracle Cloud.
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[#0071E3] hover:bg-[#005CBB] active:scale-[0.98] text-white text-xs font-bold shadow-[0_4px_14px_rgba(0,113,227,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span className="spinner !w-4 !h-4 !border-white/30 !border-t-white" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  {isRegister ? 'person_add' : 'login'}
                </span>
                <span>{isRegister ? 'Criar Conta' : 'Entrar na Nuvem'}</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Toggle */}
        <div className="mt-5 pt-4 border-t border-[#F0F0F2] text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs font-medium text-[#0071E3] hover:underline cursor-pointer"
          >
            {isRegister
              ? 'Já tem uma conta? Clique para entrar'
              : 'Não tem conta? Cadastre-se gratuitamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
