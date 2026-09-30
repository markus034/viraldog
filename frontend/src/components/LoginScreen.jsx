import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, setAuthToken, setCurrentUser } from '../config';
import logoImage from '../assets/logo.jpg';

export default function LoginScreen({ onLoginSuccess, triggerToast }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setErrorMessage('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (countdown > 0) return;

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Por favor, informe seu e-mail e senha.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        // Bloqueado por Rate Limiting
        const retryAfter = data.retry_after || 60;
        setCountdown(retryAfter);
        setErrorMessage(data.detail || `Muitas tentativas. Aguarde ${retryAfter}s.`);
        if (triggerToast) triggerToast(`Proteção de segurança: muitas tentativas. Aguarde ${retryAfter}s.`, 'error');
        return;
      }

      if (res.ok && data.access_token) {
        setAuthToken(data.access_token);
        setCurrentUser(data.user);
        if (triggerToast) triggerToast(`Bem-vindo de volta, ${data.user?.name || data.user?.email}! 🎉`, 'success');
        if (onLoginSuccess) onLoginSuccess(data.user);
      } else {
        const errorDetail = data.detail || 'E-mail ou senha incorretos.';
        setErrorMessage(errorDetail);
        if (triggerToast) triggerToast(errorDetail, 'error');
      }
    } catch (err) {
      console.error('Erro no login:', err);
      const connError = 'Não foi possível conectar ao servidor. Verifique se o backend está em execução.';
      setErrorMessage(connError);
      if (triggerToast) triggerToast(connError, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F5F7] flex items-center justify-center p-4 selection:bg-[#0071E3] selection:text-white overflow-y-auto">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/3 w-[450px] h-[450px] bg-[#0071E3]/[0.04] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-[#00C6FF]/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[420px] bg-white rounded-3xl border border-[#E8E8EA] p-8 sm:p-9 shadow-[0_20px_60px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.02)] animate-modal-scale flex flex-col my-auto">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-3.5 group">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/5 bg-white flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <img src={logoImage} alt="ViralDog" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#0071E3] text-white rounded-full flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[11px]">lock</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">ViralDog</h1>
          <p className="text-xs text-[#86868B] mt-1 font-medium">
            Painel de Automação & Publicação no Instagram
          </p>
        </div>

        {/* Rate Limit / Error Banner */}
        {errorMessage && (
          <div className={`mb-6 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border transition-all ${
            countdown > 0
              ? 'bg-amber-50 border-amber-200/80 text-amber-800'
              : 'bg-rose-50 border-rose-200/80 text-rose-700'
          }`}>
            <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
              countdown > 0 ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {countdown > 0 ? 'timer' : 'error'}
            </span>
            <div className="flex-1 leading-relaxed">
              <p className="font-semibold">{errorMessage}</p>
              {countdown > 0 && (
                <p className="mt-1 text-[11px] opacity-90">
                  Desbloqueio em <span className="font-bold font-mono">{countdown}s</span>...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#1D1D1F] uppercase tracking-wider mb-1.5">
              E-mail de Acesso
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-[#86868B] text-[18px] pointer-events-none">
                mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                disabled={loading || countdown > 0}
                className="w-full h-11 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA] pl-10 pr-3.5 text-xs font-medium text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/12 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1D1D1F] uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-[#86868B] text-[18px] pointer-events-none">
                key
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading || countdown > 0}
                className="w-full h-11 rounded-xl bg-[#F5F5F7] border border-[#E8E8EA] pl-10 pr-10 text-xs font-medium text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:bg-white focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/12 transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-[#86868B] hover:text-[#1D1D1F] p-1 transition-colors cursor-pointer"
                title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || countdown > 0}
            className="w-full h-11 mt-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] active:scale-[0.99] text-white text-xs font-semibold shadow-md shadow-[#0071E3]/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#0071E3]/30"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                <span>Autenticando...</span>
              </>
            ) : countdown > 0 ? (
              <>
                <span className="material-symbols-outlined text-[18px]">timer</span>
                <span>Aguarde {countdown}s</span>
              </>
            ) : (
              <>
                <span>Acessar Painel</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Support Info */}
        <div className="mt-8 pt-5 border-t border-[#F0F0F2] text-center">
          <p className="text-[11px] text-[#86868B] font-medium flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-[#86868B]">verified_user</span>
            <span>Acesso restrito para clientes autorizados</span>
          </p>
        </div>

      </div>
    </div>
  );
}
