import React from 'react';
import CustomSelect from '../CustomSelect';
import CustomDateTimePicker from '../CustomDateTimePicker';
import { CaptionText } from './PublisherParts';

const API = 'http://localhost:8000';

function getExternalProfileKey(username, accountId) {
  const normalizedUsername = String(username || 'global').replace('@', '').trim().toLowerCase();
  const prefix = accountId ? `account_${accountId}_` : '';
  return `${prefix}instagram-${normalizedUsername}`;
}

export default function PostForm({ pubState, triggerToast }) {
  const isElectron = !!(window.electronAPI);

  const {
    wizardStep, setWizardStep, setCreationWizardOpen,
    postType, setPostType, selectedAccount, setSelectedAccount, accounts = [],
    customFolderPath, setCustomFolderPath, scanFolderVideos, selectedVideo, setSelectedVideo, videos,
    carouselImages, setCarouselImages, carouselPreviewUrls, setCarouselPreviewUrls,
    caption, setCaption, generatingAI, handleGenerateCaption,
    presetType, setPresetType, presetsDropdownOpen, setPresetsDropdownOpen,
    showSavePresetInput, setShowSavePresetInput, newPresetName, setNewPresetName,
    savedPresets, persistPresets,
    videoRef, isVideoPlaying, isVideoMuted, togglePlay, toggleMute,
    suggestingTime, handleSuggestTime, scheduledTime, setScheduledTime,
    scheduling, handleScheduleSubmit
  } = pubState || {};

  const [newPresetContent, setNewPresetContent] = React.useState('');
  const [videoSearchQuery, setVideoSearchQuery] = React.useState('');
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [isLiked, setIsLiked] = React.useState(false);

  // Estados para Conectar Sessão Diretamente
  const [connectingAccount, setConnectingAccount] = React.useState(false);
  const [activeAuthSession, setActiveAuthSession] = React.useState(null);
  const [sessionModalOpen, setSessionModalOpen] = React.useState(false);
  const [sessionCookiesInput, setSessionCookiesInput] = React.useState('');
  const [savingCookies, setSavingCookies] = React.useState(false);

  // Escutar conclusão do login no Instagram via Electron
  React.useEffect(() => {
    if (!isElectron || !activeAuthSession) return;

    window.electronAPI.onProfileLoginComplete((result) => {
      if (result.profileKey && result.profileKey !== activeAuthSession.profileKey) return;

      if (!result.success || !result.cookiesJson) {
        triggerToast?.(result.error || 'Login no Instagram não foi concluído.', 'error');
        setActiveAuthSession(null);
        setConnectingAccount(false);
        return;
      }

      if (activeAuthSession.accountId) {
        fetch(`${API}/api/accounts/${activeAuthSession.accountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_cookies: result.cookiesJson, status: 'active' })
        })
        .then(res => {
          if (res.ok) {
            triggerToast?.(`Sessão de @${activeAuthSession.username} conectada com sucesso! ✅`, 'success');
            pubState.fetchAccounts?.();
          } else {
            triggerToast?.('Erro ao salvar sessão atualizada.', 'error');
          }
        })
        .catch(() => triggerToast?.('Erro de conexão ao salvar sessão.', 'error'))
        .finally(() => {
          setActiveAuthSession(null);
          setConnectingAccount(false);
        });
      }
    });

    return () => {
      window.electronAPI?.removeProfileLoginComplete?.();
    };
  }, [isElectron, activeAuthSession, triggerToast, pubState]);

  // Se a conta selecionada já estiver com sessão ativa, resetar estado de conexão
  React.useEffect(() => {
    const currentAcc = accounts.find(a => a.username === selectedAccount);
    if (currentAcc && (currentAcc.has_session || currentAcc.has_official_token)) {
      setConnectingAccount(false);
      setActiveAuthSession(null);
    }
  }, [accounts, selectedAccount]);

  const handleConnectSession = async (account) => {
    if (!account) return;

    if (isElectron && window.electronAPI?.startExternalInstagramLogin) {
      const username = (account.username || '').replace(/^@/, '').trim();
      const proxy = account.proxy_url || null;
      const profileKey = getExternalProfileKey(username, account.id);

      setConnectingAccount(true);
      setActiveAuthSession({ username, proxy, profileKey, accountId: account.id });
      triggerToast?.(`Abrindo Chrome para login de @${username}...`, 'info');

      try {
        const result = await window.electronAPI.startExternalInstagramLogin(profileKey, username, proxy);
        if (!result?.success) {
          setActiveAuthSession(null);
          setConnectingAccount(false);
          triggerToast?.(result?.error || 'Não foi possível abrir o navegador.', 'error');
        } else {
          triggerToast?.('Faça login no Instagram. Ao fechar a janela, a sessão será salva automaticamente! ✅', 'success');
        }
      } catch {
        setActiveAuthSession(null);
        setConnectingAccount(false);
        triggerToast?.('Erro ao iniciar conexão de sessão.', 'error');
      }
    } else {
      // Fallback para navegador web
      setSessionCookiesInput('');
      setSessionModalOpen(true);
    }
  };

  const handleSaveCookies = async (account) => {
    if (!sessionCookiesInput.trim()) {
      triggerToast?.('Cole o JSON dos cookies da sessão.', 'error');
      return;
    }

    try {
      JSON.parse(sessionCookiesInput);
    } catch {
      triggerToast?.('Os cookies devem estar em formato JSON válido.', 'error');
      return;
    }

    setSavingCookies(true);
    try {
      const res = await fetch(`${API}/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_cookies: sessionCookiesInput.trim(), status: 'active' })
      });
      if (res.ok) {
        triggerToast?.(`Sessão de @${account.username} conectada com sucesso! ✅`, 'success');
        setSessionModalOpen(false);
        setSessionCookiesInput('');
        pubState.fetchAccounts?.();
      } else {
        triggerToast?.('Falha ao salvar sessão.', 'error');
      }
    } catch {
      triggerToast?.('Erro de conexão ao salvar sessão.', 'error');
    } finally {
      setSavingCookies(false);
    }
  };

  const removeCarouselItem = (index) => {
    if (carouselPreviewUrls[index]) {
      URL.revokeObjectURL(carouselPreviewUrls[index]);
    }
    const updatedImages = carouselImages.filter((_, i) => i !== index);
    const updatedUrls = carouselPreviewUrls.filter((_, i) => i !== index);
    setCarouselImages(updatedImages);
    setCarouselPreviewUrls(updatedUrls);
    if (previewIndex >= updatedUrls.length) {
      setPreviewIndex(Math.max(0, updatedUrls.length - 1));
    }
    triggerToast?.('Item removido do carrossel', 'info');
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (sourceIndexStr === '') return;
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (sourceIndex === targetIndex) return;

    const updatedImages = [...carouselImages];
    const updatedUrls = [...carouselPreviewUrls];

    // Swap items
    const tempImg = updatedImages[sourceIndex];
    updatedImages[sourceIndex] = updatedImages[targetIndex];
    updatedImages[targetIndex] = tempImg;

    const tempUrl = updatedUrls[sourceIndex];
    updatedUrls[sourceIndex] = updatedUrls[targetIndex];
    updatedUrls[targetIndex] = tempUrl;

    setCarouselImages(updatedImages);
    setCarouselPreviewUrls(updatedUrls);
    triggerToast?.('Ordem do carrossel atualizada', 'info');
  };

  const handleSavePreset = (type) => {
    if (!newPresetName.trim()) {
      triggerToast?.('Por favor, insira o nome do preset.', 'error');
      return;
    }
    const content = newPresetContent.trim();
    if (!content) {
      triggerToast?.('Por favor, insira o conteúdo do preset.', 'error');
      return;
    }
    const key = type;
    const updated = { ...savedPresets, [key]: [...(savedPresets[key] || []), { name: newPresetName.trim(), content }] };
    persistPresets(updated);
    setNewPresetName('');
    setNewPresetContent('');
    setShowSavePresetInput(false);
    triggerToast?.(`Preset "${newPresetName.trim()}" salvo!`, 'success');
  };

  const handleLoadPreset = (type, preset) => {
    if (type === 'hashtags') setCaption(prev => prev + ' ' + preset.content);
    else if (type === 'assinatura') setCaption(prev => prev + '\n\n' + preset.content);
    else if (type === 'legenda') setCaption(preset.content);
    setPresetsDropdownOpen(false);
    setPresetType(null);
  };

  const handleDeletePreset = (type, index) => {
    const updated = { ...savedPresets, [type]: savedPresets[type].filter((_, i) => i !== index) };
    persistPresets(updated);
    triggerToast?.('Preset removido', 'info');
  };

  // ponytail: plain string ops, no regex inside JSX
  const mediaBasename = selectedVideo
    ? selectedVideo.replace(/\\/g, '/').split('/').pop()
    : 'Nenhum';

  return (
    <div className="h-full flex flex-col bg-[#F5F5F7] border border-black/5 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ minHeight: 0 }}>
        {/* STEP 1: FORMATS */}
        {wizardStep === 1 && (
          <div className="h-full flex items-center justify-center p-8 animate-fadeIn">
            <div className="w-full max-w-xl flex flex-col gap-8">

              {/* Header */}
              <div className="text-center flex flex-col gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#0071E3] flex items-center justify-center mx-auto shadow-[0_8px_24px_rgba(0,113,227,0.3)] mb-1">
                  <span className="material-symbols-outlined text-white text-[22px]">send</span>
                </div>
                <h2 className="text-2xl font-bold text-[#1D1D1F] tracking-[-0.02em]">Como vai publicar?</h2>
                <p className="text-sm text-[#86868B]">Escolha o canal e a conta para esta publicação.</p>
              </div>

              {/* Format cards */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Tipo de Publicação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPostType('reel')}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col gap-3 group ${
                      postType === 'reel'
                        ? 'bg-white border-[#0071E3] shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
                        : 'bg-white border-[#E8E8ED] hover:border-[#0071E3]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      postType === 'reel' ? 'bg-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.3)]' : 'bg-[#F5F5F7] group-hover:bg-[#0071E3]/10'
                    }`}>
                      <span className={`material-symbols-outlined text-[20px] ${ postType === 'reel' ? 'text-white' : 'text-[#86868B]'}`}>smart_display</span>
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${postType === 'reel' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>Reels</div>
                      <div className="text-[10px] text-[#86868B] mt-0.5">Vídeos verticais curtos</div>
                    </div>
                    {postType === 'reel' && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#0071E3] flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-[12px]">check</span>
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostType('carousel')}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col gap-3 group ${
                      postType === 'carousel'
                        ? 'bg-white border-[#0071E3] shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
                        : 'bg-white border-[#E8E8ED] hover:border-[#0071E3]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      postType === 'carousel' ? 'bg-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.3)]' : 'bg-[#F5F5F7] group-hover:bg-[#0071E3]/10'
                    }`}>
                      <span className={`material-symbols-outlined text-[20px] ${ postType === 'carousel' ? 'text-white' : 'text-[#86868B]'}`}>feed</span>
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${postType === 'carousel' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>Feed</div>
                      <div className="text-[10px] text-[#86868B] mt-0.5">Carrossel de imagens</div>
                    </div>
                    {postType === 'carousel' && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#0071E3] flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-[12px]">check</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Account */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Conta do Instagram</label>
                <CustomSelect
                  label=""
                  value={selectedAccount}
                  onChange={setSelectedAccount}
                  placeholder="Selecionar conta..."
                  required
                  icon="person"
                  options={accounts.map(acc => {
                    const isDisconnected = !acc.has_session;
                    const name = acc.display_name || acc.username;
                    const badgeLabel = isDisconnected ? `@${name} (⚠️ Sem Sessão)` : `@${name}`;
                    return {
                      value: acc.username,
                      label: badgeLabel,
                      avatar: acc.avatar_url ? (acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`) : null,
                      username: acc.username
                    };
                  })}
                />
                {(() => {
                  const currentAcc = accounts.find(a => a.username === selectedAccount);
                  if (currentAcc && !currentAcc.has_session) {
                    return (
                      <div className="flex items-center justify-between gap-3 p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl mt-2 backdrop-blur-sm animate-fadeIn">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined text-amber-600 text-[18px] shrink-0">warning</span>
                          <span className="text-xs text-amber-900 font-medium leading-snug">
                            A conta <strong className="font-bold">@{selectedAccount}</strong> não possui sessão de cookies salva.
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={connectingAccount}
                          onClick={() => handleConnectSession(currentAcc)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl shrink-0 transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
                          title="Fazer login no Instagram e salvar a sessão desta conta"
                        >
                          {connectingAccount ? (
                            <>
                              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                              <span>Conectando...</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[15px]">key</span>
                              <span>Conectar Sessão</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  }
                  if (currentAcc && currentAcc.has_official_token) {
                    return (
                      <div className="flex items-center gap-2 p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl mt-2 backdrop-blur-sm animate-fadeIn text-xs text-emerald-900 font-medium">
                        <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified</span>
                        <span>
                          Conta protegida pela <strong>API Oficial da Meta</strong>. Posts serão publicados sem risco de suspeita de automação.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {accounts.length === 0 && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                    <span className="material-symbols-outlined text-rose-400 text-[16px]">warning</span>
                    <span className="text-[11px] text-rose-600 font-medium">Configure suas contas nas Definições.</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* STEP 2: CONTENT */}
        {wizardStep === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch animate-fadeIn" style={{ height: '100%', minHeight: 0 }}>
            {/* Form fields (Left) */}
            <div className="lg:col-span-7 flex flex-col gap-5 overflow-y-auto custom-scrollbar p-6 border-r border-black/5" style={{ minHeight: 0 }}>
              {/* Section header */}
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-bold text-[#1D1D1F] tracking-[-0.01em]">Conteúdos de mídia e texto</h2>
                <p className="text-xs text-[#86868B]">Adicione o vídeo ou imagens e a legenda do post.</p>
              </div>

              {/* Media uploads */}
              <div className="flex flex-col gap-3 bg-[#F5F5F7] rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1D1D1F]">Mídias</span>
                  <span className="text-[10px] text-[#86868B] font-medium">PNG, JPG, JPEG, MP4</span>
                </div>
                {postType === 'reel' ? (
                  <div className="flex flex-col gap-3 mt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-[#86868B]">Pasta de Origem dos Vídeos</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Caminho da pasta (opcional)"
                          value={customFolderPath}
                          onChange={e => { setCustomFolderPath(e.target.value); scanFolderVideos(e.target.value); }}
                          className="flex-1 p-2.5 bg-white border border-[#E8E8ED] rounded-xl text-xs text-[#1D1D1F] hover:border-[#86868B]/40 focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all placeholder:text-[#86868B] shadow-xs"
                        />
                        {isElectron && (
                          <button
                            type="button"
                            onClick={async () => { const path = await window.electronAPI.selectDirectory(); if (path) { setCustomFolderPath(path); scanFolderVideos(path); } }}
                            className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-[#F5F5F7] active:scale-98 text-[#1D1D1F] flex items-center gap-1.5 shrink-0 transition-all shadow-xs">
                            <span className="material-symbols-outlined text-[16px]">folder_open</span> Escolher
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Vídeos Disponíveis ({videos.filter(vid => vid.name.toLowerCase().includes(videoSearchQuery.toLowerCase())).length})</span>
                      </div>
                      
                      {/* Search Bar */}
                      <div className="relative flex items-center">
                        <span className="material-symbols-outlined absolute left-3 text-[16px] text-[#86868B]">search</span>
                        <input
                          type="text"
                          placeholder="Buscar vídeo por nome..."
                          value={videoSearchQuery}
                          onChange={e => videoSearchQuery !== undefined && setVideoSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-white border border-[#E8E8ED] rounded-xl text-xs text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3] transition-all placeholder:text-[#86868B]"
                        />
                        {videoSearchQuery && (
                          <button 
                            type="button" 
                            onClick={() => setVideoSearchQuery('')}
                            className="absolute right-3 text-[#86868B] hover:text-[#1D1D1F] flex items-center"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>

                      {/* Video Cards Grid */}
                      <div className="max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar">
                        {videos.filter(vid => vid.name.toLowerCase().includes(videoSearchQuery.toLowerCase())).length > 0 ? (
                          videos.filter(vid => vid.name.toLowerCase().includes(videoSearchQuery.toLowerCase())).map(vid => {
                            const isSelected = selectedVideo === vid.path;
                            const isEdited = vid.category === 'edited';
                            const isRaw = vid.category === 'raw';
                            
                            return (
                              <button
                                key={vid.path}
                                type="button"
                                onClick={() => setSelectedVideo(vid.path)}
                                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all duration-200 group relative ${
                                  isSelected
                                    ? 'bg-white border-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.08)]'
                                    : 'bg-white/80 border-[#E8E8ED] hover:border-[#0071E3]/40 hover:bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                                }`}
                              >
                                {/* Left icon / Category badge */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                  isSelected
                                    ? 'bg-[#0071E3]/10 text-[#0071E3]'
                                    : isEdited
                                      ? 'bg-emerald-50 text-emerald-500'
                                      : isRaw
                                        ? 'bg-amber-50 text-amber-500'
                                        : 'bg-[#F5F5F7] text-[#86868B]'
                                }`}>
                                  <span className="material-symbols-outlined text-[16px]">
                                    {isEdited ? 'movie_edit' : 'videocam'}
                                  </span>
                                </div>

                                {/* Text content */}
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                                      isEdited
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : isRaw
                                          ? 'bg-amber-500/10 text-amber-600'
                                          : 'bg-black/5 text-[#86868B]'
                                    }`}>
                                      {isEdited ? 'Editado' : isRaw ? 'Bruto' : 'Pasta'}
                                    </span>
                                    <span className="text-[9px] text-[#86868B] font-medium shrink-0">
                                      {(vid.size / (1024 * 1024)).toFixed(2)} MB
                                    </span>
                                  </div>
                                  <span className={`text-[11px] font-semibold truncate ${isSelected ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`} title={vid.name}>
                                    {vid.name}
                                  </span>
                                </div>

                                {/* Right check indicator */}
                                {isSelected && (
                                  <div className="w-5 h-5 rounded-full bg-[#0071E3] flex items-center justify-center shrink-0 shadow-sm animate-scaleUp">
                                    <span className="material-symbols-outlined text-white text-[12px]">check</span>
                                  </div>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-6 text-center bg-white/40 border border-dashed border-[#E8E8ED] rounded-xl flex flex-col items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-[#86868B] text-[20px]">movie_filter</span>
                            <span className="text-[10px] text-[#86868B] font-medium">Nenhum vídeo correspondente.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-col gap-2">
                    <label className="border-2 border-dashed border-[#E8E8ED] hover:border-[#0071E3]/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-[#F5F5F7]/50 hover:bg-[#0071E3]/[0.02] transition-all">
                      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
                        <span className="material-symbols-outlined text-[24px] text-[#0071E3]">cloud_upload</span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-bold text-[#0071E3]">Selecione arquivos</span>
                        <span className="text-xs text-[#86868B]"> ou arraste aqui para fazer upload</span>
                      </div>
                      <input
                        type="file" accept="image/*,video/mp4" multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files);
                          const names = files.map(f => f.name);
                          const urls = files.map(f => URL.createObjectURL(f));
                          carouselPreviewUrls.forEach(u => URL.revokeObjectURL(u));
                          setCarouselImages(names);
                          setCarouselPreviewUrls(urls);
                          setPreviewIndex(0);
                        }}
                        className="hidden"
                      />
                    </label>
                    {carouselImages.length > 0 ? (
                      <div className="flex flex-col gap-3 mt-2 bg-white p-3.5 border border-[#E8E8ED] rounded-2xl shadow-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Mídias ({carouselImages.length}/10)</span>
                          <button 
                            type="button"
                            onClick={() => { 
                              carouselPreviewUrls.forEach(u => URL.revokeObjectURL(u)); 
                              setCarouselImages([]); 
                              setCarouselPreviewUrls([]); 
                              setPreviewIndex(0);
                            }} 
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete_sweep</span> Remover Todos
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-5 gap-2 mt-1">
                          {carouselPreviewUrls.map((url, i) => {
                            const isSelectedInPreview = previewIndex === i;
                            const isVideo = carouselImages[i]?.toLowerCase().endsWith('.mp4');
                            
                            return (
                              <div
                                key={url}
                                draggable
                                onDragStart={(e) => handleDragStart(e, i)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDrop(e, i)}
                                onClick={() => setPreviewIndex(i)}
                                className={`aspect-square rounded-xl overflow-hidden relative cursor-grab active:cursor-grabbing border-2 transition-all ${
                                  isSelectedInPreview 
                                    ? 'border-[#0071E3] scale-102 shadow-sm' 
                                    : 'border-[#E8E8ED] hover:border-[#0071E3]/40'
                                }`}
                              >
                                {isVideo ? (
                                  <div className="w-full h-full bg-black flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white/60 text-[18px]">play_circle</span>
                                  </div>
                                ) : (
                                  <img src={url} alt={carouselImages[i]} className="w-full h-full object-cover" />
                                )}
                                
                                {/* Badge showing order */}
                                <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/60 text-white text-[8px] font-extrabold flex items-center justify-center">
                                  {i + 1}
                                </div>
                                
                                {/* Delete button on hover */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeCarouselItem(i);
                                  }}
                                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[10px]">close</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-[#86868B] font-medium text-center mt-1">💡 Arraste os cards para reordenar a sequência.</p>
                      </div>
                    ) : (
                      <span className="text-[10px] text-text-secondary text-center mt-1">Selecione pelo menos 1 imagem ou vídeo</span>
                    )}
                  </div>
                )}
              </div>

              {/* Caption */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1D1D1F]">Descrição</span>
                  <button
                    type="button"
                    onClick={handleGenerateCaption}
                    className="px-3 py-1.5 rounded-xl bg-[#0071E3]/5 border border-[#0071E3]/20 hover:bg-[#0071E3]/10 hover:border-[#0071E3]/40 text-[11px] text-[#0071E3] font-bold flex items-center gap-1 transition-all duration-200 shadow-xs disabled:opacity-50"
                    disabled={generatingAI}
                  >
                    <span className="material-symbols-outlined text-[14px]">psychology</span>
                    {generatingAI ? 'Gerando Legenda...' : 'Gerar com IA'}
                  </button>
                </div>
                <textarea
                  value={caption} onChange={e => setCaption(e.target.value)} placeholder="Escreva algo..." required
                  className="w-full p-4 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-2xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-y min-h-[140px] leading-relaxed placeholder:text-[#86868B] shadow-xs"
                />
                
                {/* Presets */}
                <div className="flex flex-wrap gap-2 text-xs font-semibold mt-1">
                  {[
                    { type: 'hashtags', label: 'Hashtags', icon: null, iconText: '#' },
                    { type: 'assinatura', label: 'Assinatura', icon: 'edit_note', iconText: null },
                    { type: 'legenda', label: 'Legenda', icon: 'description', iconText: null },
                  ].map(preset => (
                    <div key={preset.type} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (presetType === preset.type && presetsDropdownOpen) {
                            setPresetsDropdownOpen(false); setPresetType(null);
                          } else {
                            setPresetType(preset.type); setPresetsDropdownOpen(true); setShowSavePresetInput(false); setNewPresetName('');
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 active:scale-98 border ${
                          presetType === preset.type && presetsDropdownOpen 
                            ? 'bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/35 shadow-xs' 
                            : 'bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] border-[#E8E8ED] hover:border-[#0071E3]/40'
                        }`}
                      >
                        {preset.iconText && <span className="text-[#0071E3] font-bold text-xs">{preset.iconText}</span>}
                        {preset.icon && <span className="material-symbols-outlined text-[14px]">{preset.icon}</span>}
                        <span>{preset.label}</span>
                        <span className="material-symbols-outlined text-[12px] ml-0.5 opacity-70">expand_more</span>
                      </button>

                      {presetsDropdownOpen && presetType === preset.type && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => { setPresetsDropdownOpen(false); setPresetType(null); }} />
                          <div className="absolute bottom-full left-0 mb-2 bg-white border border-[#E8E8ED]/85 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.08)] z-50 min-w-[240px] py-2 animate-scaleUp">
                            <div className="px-3.5 py-1.5 border-b border-[#F5F5F7] mb-1.5">
                              <span className="text-[10px] font-extrabold text-[#86868B] uppercase tracking-wider">Presets de {preset.label}</span>
                            </div>
                            <div className="max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                              {(savedPresets[preset.type] || []).length === 0 ? (
                                <div className="px-3 py-4 text-center">
                                  <span className="material-symbols-outlined text-[18px] text-[#86868B]/30">bookmark_border</span>
                                  <p className="text-[10px] text-[#86868B] mt-1">Nenhum preset salvo</p>
                                </div>
                              ) : (
                                (savedPresets[preset.type] || []).map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#0071E3]/5 hover:text-[#0071E3] rounded-lg transition-colors group/preset mx-1.5">
                                    <button 
                                      type="button" 
                                      onClick={() => handleLoadPreset(preset.type, p)} 
                                      className="flex-1 text-left text-[11px] font-semibold truncate hover:text-[#0071E3] transition-colors" 
                                      title={p.content}
                                    >
                                      {p.name}
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.type, idx); }} 
                                      className="opacity-0 group-hover/preset:opacity-100 text-[#86868B] hover:text-rose-500 transition-all flex items-center justify-center"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="border-t border-[#F5F5F7] px-3.5 pt-2 mt-1.5">
                              {showSavePresetInput ? (
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Nome</span>
                                    <input 
                                      type="text" 
                                      value={newPresetName} 
                                      onChange={e => setNewPresetName(e.target.value)} 
                                      placeholder="Ex: Assinatura Padrão" 
                                      className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white transition-all" 
                                      autoFocus 
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Conteúdo</span>
                                    <textarea 
                                      value={newPresetContent} 
                                      onChange={e => setNewPresetContent(e.target.value)} 
                                      placeholder={preset.type === 'hashtags' ? "Ex: #marketing #vendas" : "Digite o texto..."} 
                                      rows={2}
                                      className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white resize-none leading-relaxed transition-all" 
                                    />
                                  </div>
                                  <div className="flex gap-1.5 justify-end mt-1">
                                    <button 
                                      type="button" 
                                      onClick={() => { setShowSavePresetInput(false); setNewPresetName(''); setNewPresetContent(''); }} 
                                      className="px-2 py-1 text-[10px] font-bold text-[#86868B] hover:bg-[#F5F5F7] rounded-lg transition-colors"
                                    >
                                      Cancelar
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => handleSavePreset(preset.type)} 
                                      className="px-2.5 py-1 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setShowSavePresetInput(true);
                                    let initialContent = '';
                                    if (preset.type === 'hashtags') {
                                      initialContent = caption.match(/#\w+/g)?.join(' ') || '';
                                    } else {
                                      initialContent = caption;
                                    }
                                    setNewPresetContent(initialContent);
                                    setNewPresetName('');
                                  }} 
                                  className="w-full px-2 py-1.5 text-[10px] font-semibold text-[#0071E3] hover:bg-[#0071E3]/5 rounded-lg flex items-center gap-1 justify-center transition-colors border border-transparent hover:border-[#0071E3]/10"
                                >
                                  <span className="material-symbols-outlined text-[13px]">add</span> Novo preset
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  <span className="ml-auto text-[10px] text-[#86868B] self-center font-medium">{caption.length}/2200</span>
                </div>
              </div>
            </div>

            {/* Live Preview (Right) */}
            <div className="lg:col-span-5 flex flex-col gap-3 bg-[#F5F5F7] p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: 0 }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#86868B] text-[16px]">preview</span>
                <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Prévia do Post</span>
              </div>
              {postType === 'reel' ? (
                <div className="relative bg-black rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.12)] group/reel mx-auto" style={{ flex: '1 1 0', minHeight: 0, aspectRatio: '9/16' }}>
                  <div className="absolute inset-0">
                    {selectedVideo ? (
                      <video ref={videoRef} key={selectedVideo} src={`file:///${selectedVideo.replace(/\\/g, '/')}`} className="w-full h-full object-cover" autoPlay loop muted playsInline onPlay={() => pubState.setIsVideoPlaying(true)} onPause={() => pubState.setIsVideoPlaying(false)} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 p-6">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-[28px] text-white/20">videocam</span></div>
                        <p className="text-[10px] font-semibold text-white/30 leading-relaxed max-w-[220px]">Selecione um vídeo ao lado.</p>
                      </div>
                    )}
                  </div>
                  {selectedVideo && (
                    <button type="button" onClick={togglePlay} className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/reel:opacity-100 transition-opacity duration-200 cursor-pointer">
                      <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-black/60"><span className="material-symbols-outlined text-[28px] text-white">{isVideoPlaying ? 'pause' : 'play_arrow'}</span></div>
                    </button>
                  )}
                  <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/40 to-transparent z-10 pointer-events-none" />
                  <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3.5">
                    <span className="text-white text-[13px] font-bold tracking-tight">Reels</span>
                    <div className="flex items-center gap-2">
                      {selectedVideo && (
                        <button type="button" onClick={toggleMute} className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/50">
                          <span className="material-symbols-outlined text-[16px] text-white">{isVideoMuted ? 'volume_off' : 'volume_up'}</span>
                        </button>
                      )}
                      <span className="material-symbols-outlined text-[22px] text-white/80">photo_camera</span>
                    </div>
                  </div>
                  <div className="absolute right-3 bottom-[120px] z-20 flex flex-col items-center gap-5">
                    <button 
                      type="button" 
                      onClick={() => setIsLiked(!isLiked)}
                      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
                    >
                      <span className={`material-symbols-outlined text-[24px] transition-colors duration-200 ${isLiked ? 'text-rose-500' : 'text-white'}`}>
                        {isLiked ? 'favorite' : 'favorite_border'}
                      </span>
                    </button>
                    <div className="flex flex-col items-center gap-1"><span className="material-symbols-outlined text-[24px] text-white">chat_bubble_outline</span></div>
                    <div className="flex flex-col items-center gap-1"><span className="material-symbols-outlined text-[24px] text-white">send</span></div>
                    <span className="material-symbols-outlined text-[22px] text-white mt-1">more_horiz</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 via-black/30 to-transparent z-10 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 pr-14 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#0071E3] to-[#4da3ff] flex items-center justify-center text-white text-[9px] font-bold">{selectedAccount ? selectedAccount.charAt(0).toUpperCase() : 'A'}</div>
                      <span className="text-[11px] font-bold text-white">@{selectedAccount || "usuario_ig"}</span>
                    </div>
                    <div className="text-[10px] text-white/85 leading-relaxed line-clamp-2 font-medium">
                      <CaptionText text={caption} />
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-white/70 font-semibold mt-0.5 select-none overflow-hidden">
                      <span className="material-symbols-outlined text-[12px] animate-pulse">music_note</span>
                      <span className="truncate">Áudio original • @{selectedAccount || "usuario_ig"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col mx-auto w-full" style={{ maxWidth: '360px' }}>
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px]"><div className="w-full h-full rounded-full bg-white flex items-center justify-center"><div className="w-[26px] h-[26px] rounded-full bg-gradient-to-tr from-[#0071E3] to-[#4da3ff] flex items-center justify-center text-white text-[9px] font-bold">{selectedAccount ? selectedAccount.charAt(0).toUpperCase() : 'A'}</div></div></div>
                      <span className="text-[11px] font-semibold text-[#1D1D1F] leading-tight">{selectedAccount || "usuario_ig"}</span>
                    </div>
                  </div>
                  <div className="w-full bg-[#EFEFEF] relative" style={{ aspectRatio: '1 / 1' }}>
                    {carouselPreviewUrls.length > 0 ? (
                      <div className="w-full h-full relative group/preview">
                        {carouselImages[previewIndex]?.toLowerCase().endsWith('.mp4') ? (
                          <video 
                            src={carouselPreviewUrls[previewIndex]} 
                            className="w-full h-full object-cover animate-fadeIn" 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                          />
                        ) : (
                          <img 
                            src={carouselPreviewUrls[previewIndex]} 
                            alt={carouselImages[previewIndex]} 
                            className="w-full h-full object-cover animate-fadeIn" 
                          />
                        )}
                        
                        {carouselPreviewUrls.length > 1 && (
                          <>
                            <div className="absolute top-3 right-3 bg-[#1D1D1F]/70 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full z-20">
                              {previewIndex + 1}/{carouselPreviewUrls.length}
                            </div>
                            
                            {/* Navigation Chevrons */}
                            {previewIndex > 0 && (
                              <button
                                type="button"
                                onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-[#1D1D1F] flex items-center justify-center shadow-md transition-all duration-205 z-20 hover:scale-105"
                              >
                                <span className="material-symbols-outlined text-[14px] font-bold">chevron_left</span>
                              </button>
                            )}
                            {previewIndex < carouselPreviewUrls.length - 1 && (
                              <button
                                type="button"
                                onClick={() => setPreviewIndex(prev => Math.min(carouselPreviewUrls.length - 1, prev + 1))}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-[#1D1D1F] flex items-center justify-center shadow-md transition-all duration-205 z-20 hover:scale-105"
                              >
                                <span className="material-symbols-outlined text-[14px] font-bold">chevron_right</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-2.5 p-6"><span className="material-symbols-outlined text-[32px] text-[#DBDBDB]">perm_media</span></div>
                    )}
                  </div>
                  <div className="px-3 pt-2.5 pb-1 flex items-center">
                    <div className="flex items-center gap-3.5">
                      <button 
                        type="button" 
                        onClick={() => setIsLiked(!isLiked)} 
                        className="flex items-center justify-center transition-transform active:scale-85"
                      >
                        <span className={`material-symbols-outlined text-[22px] transition-colors ${isLiked ? 'text-rose-500' : 'text-[#1D1D1F]'}`}>
                          {isLiked ? 'favorite' : 'favorite_border'}
                        </span>
                      </button>
                      <span className="material-symbols-outlined text-[22px] text-[#1D1D1F]">chat_bubble_outline</span>
                      <span className="material-symbols-outlined text-[22px] text-[#1D1D1F]">send</span>
                    </div>
                    {carouselPreviewUrls.length > 1 && (
                      <div className="flex-1 flex justify-center gap-1.5 pr-8">
                        {carouselPreviewUrls.map((_, i) => (
                          <div 
                            key={i} 
                            className={`rounded-full transition-all duration-200 ${
                              i === previewIndex 
                                ? 'w-1.5 h-1.5 bg-[#0071E3]' 
                                : 'w-1.2 h-1.2 bg-[#D9D9D9]'
                            }`} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="px-3 pb-3 flex flex-col gap-1">
                    <div className="text-[11px] leading-[16px] text-[#1D1D1F]">
                      <span className="font-semibold mr-1">{selectedAccount || "usuario_ig"}</span>
                      <CaptionText text={caption} hashtagClass="text-[#00376B]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: CONCLUSION */}
        {wizardStep === 3 && (
          <div className="h-full flex items-center justify-center p-8 animate-fadeIn">
            <div className="w-full max-w-lg flex flex-col gap-6">

              {/* Header */}
              <div className="text-center flex flex-col gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto shadow-[0_8px_24px_rgba(16,185,129,0.3)] mb-1">
                  <span className="material-symbols-outlined text-white text-[22px]">event_available</span>
                </div>
                <h2 className="text-2xl font-bold text-[#1D1D1F] tracking-[-0.02em]">Quando publicar?</h2>
                <p className="text-sm text-[#86868B]">Programe no melhor horário de engajamento.</p>
              </div>

              {/* Date + AI Suggest */}
              <div className="flex flex-col gap-2">
                <CustomDateTimePicker
                  value={scheduledTime}
                  onChange={setScheduledTime}
                  onSuggestTime={handleSuggestTime}
                  suggestingTime={suggestingTime}
                />
              </div>

              {/* Summary card */}
              <div className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
                <div className="px-5 py-3.5 border-b border-[#F5F5F7] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#86868B] text-[16px]">receipt_long</span>
                  <span className="text-xs font-bold text-[#1D1D1F]">Resumo do Agendamento</span>
                </div>
                <div className="flex flex-col divide-y divide-[#F5F5F7]">
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[15px] text-[#0071E3]">{postType === 'reel' ? 'smart_display' : 'feed'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#86868B] font-medium">Tipo</span>
                      <span className="text-xs font-bold text-[#1D1D1F]">{postType === 'reel' ? 'Reels' : 'Feed'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[15px] text-purple-500">person</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#86868B] font-medium">Conta</span>
                      <span className="text-xs font-bold text-[#1D1D1F]">@{selectedAccount || 'Nenhuma'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[15px] text-amber-500">{postType === 'reel' ? 'movie' : 'photo_library'}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-[#86868B] font-medium">Mídia</span>
                      <span className="text-xs font-bold text-[#1D1D1F] truncate">
                        {postType === 'reel' ? mediaBasename : `${carouselImages.length} imagens/vídeos`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3.5 bg-emerald-500/[0.03]">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[15px] text-emerald-500">event</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#86868B] font-medium">Data Programada</span>
                      <span className={`text-xs font-bold ${scheduledTime ? 'text-emerald-600' : 'text-[#86868B]'}`}>
                        {scheduledTime ? new Date(scheduledTime).toLocaleString('pt-BR') : 'Não selecionada'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Sticky footer — Voltar · Steps · Continuar */}
      <footer className="flex-shrink-0 border-t border-black/5 bg-white px-6 py-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => { if (wizardStep === 1) setCreationWizardOpen(false); else setWizardStep(prev => prev - 1); }}
          className="px-5 py-2.5 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#1D1D1F] text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_back</span>
          Voltar
        </button>

        {/* Step indicator with labels */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          {[
            { n: 1, label: 'Formato' },
            { n: 2, label: 'Conteúdo' },
            { n: 3, label: 'Agendar' },
          ].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 ${
                n < wizardStep
                  ? 'bg-[#0071E3] text-white'
                  : n === wizardStep
                  ? 'bg-[#0071E3] text-white ring-4 ring-[#0071E3]/15'
                  : 'bg-[#F5F5F7] text-[#86868B]'
              }`}>
                <span className="flex items-center justify-center w-4 h-4">
                  {n < wizardStep
                    ? <span className="material-symbols-outlined text-[12px]">check</span>
                    : <span className="text-[9px] font-bold">{n}</span>}
                </span>
                <span className="text-[10px] font-bold hidden sm:block">{label}</span>
              </div>
              {n < 3 && <div className={`w-6 h-[2px] rounded-full transition-all duration-300 ${n < wizardStep ? 'bg-[#0071E3]' : 'bg-[#E8E8ED]'}`} />}
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={scheduling || (wizardStep === 1 && !selectedAccount) || (wizardStep === 2 && postType === 'reel' && !selectedVideo) || (wizardStep === 2 && postType === 'carousel' && carouselImages.length === 0)}
          onClick={() => { if (wizardStep < 3) setWizardStep(prev => prev + 1); else handleScheduleSubmit(); }}
          className="px-6 py-2.5 bg-[#0071E3] hover:bg-[#005cbb] text-white text-xs font-bold rounded-xl disabled:opacity-40 flex items-center gap-1.5 shadow-[0_4px_12px_rgba(0,113,227,0.3)] hover:shadow-[0_6px_20px_rgba(0,113,227,0.4)] transition-all shrink-0"
        >
          {scheduling
            ? <div className="spinner !border-white/20 !border-t-white"></div>
            : wizardStep === 3
            ? (postType === 'carousel' ? 'Agendar Feed' : 'Agendar Reels')
            : <><span>Continuar</span><span className="material-symbols-outlined text-[15px]">arrow_forward</span></>}
        </button>
      </footer>

      {/* Modal Rápido para Conectar Sessão (Fallback Web) */}
      {sessionModalOpen && (() => {
        const currentAcc = accounts.find(a => a.username === selectedAccount);
        if (!currentAcc) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-black/5 animate-scaleUp">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                    <span className="material-symbols-outlined text-[20px]">key</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1D1D1F]">Conectar Sessão</h3>
                    <p className="text-xs text-[#86868B]">Perfil @{currentAcc.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSessionModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#86868B] hover:bg-[#F5F5F7] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-[#555] leading-relaxed">
                  Cole abaixo os cookies de sessão em formato JSON extraídos do Instagram para autenticar esta conta:
                </p>

                <textarea
                  rows={5}
                  value={sessionCookiesInput}
                  onChange={(e) => setSessionCookiesInput(e.target.value)}
                  placeholder='[{"name": "sessionid", "value": "...", "domain": ".instagram.com"}]'
                  className="w-full text-xs font-mono p-3 bg-[#F5F5F7] border border-[#E8E8EA] rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none transition-all"
                />

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSessionModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingCookies}
                    onClick={() => handleSaveCookies(currentAcc)}
                    className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {savingCookies ? (
                      <>
                        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[14px]">save</span>
                        <span>Salvar Sessão</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
