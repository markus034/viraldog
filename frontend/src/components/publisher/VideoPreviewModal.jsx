import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CustomDateTimePicker from '../CustomDateTimePicker';

const API = 'http://localhost:8000';

export default function VideoPreviewModal({
  isOpen,
  onClose,
  video,
  videos = [],
  accounts = [],
  currentIndex = 0,
  onNavigate,
  onUpdateCaption,
  onUpdateScheduleTime,
  onDeleteVideo,
}) {
  const isElectron = !!(window.electronAPI);
  const videoRef = useRef(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Caption Editing & Presets
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState('');

  // Presets
  const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false);
  const [presetType, setPresetType] = useState(null);
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetContent, setNewPresetContent] = useState('');
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('viraldog_presets') || '{}';
      return JSON.parse(saved);
    } catch { return {}; }
  });

  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem('viraldog_presets') || '{}';
        setSavedPresets(JSON.parse(saved));
      } catch { setSavedPresets({}); }
    }
  }, [isOpen]);

  const persistPresets = (newPresets) => {
    setSavedPresets(newPresets);
    try {
      localStorage.setItem('viraldog_presets', JSON.stringify(newPresets));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePreset = (type) => {
    if (!newPresetName.trim()) return;
    const content = newPresetContent.trim();
    if (!content) return;
    const updated = {
      ...savedPresets,
      [type]: [...(savedPresets[type] || []), { name: newPresetName.trim(), content }]
    };
    persistPresets(updated);
    setNewPresetName('');
    setNewPresetContent('');
    setShowSavePresetInput(false);
  };

  const handleLoadPreset = (type, preset) => {
    let newCaption = '';
    const base = isEditingCaption ? editedCaption : (currentVideo?.caption || '');
    if (type === 'hashtags') {
      newCaption = base ? `${base} ${preset.content}` : preset.content;
    } else if (type === 'assinatura') {
      newCaption = base ? `${base}\n\n${preset.content}` : preset.content;
    } else if (type === 'legenda') {
      newCaption = preset.content;
    }
    setEditedCaption(newCaption);
    if (!isEditingCaption && onUpdateCaption) {
      onUpdateCaption(newCaption, currentIndex);
    }
    setPresetsDropdownOpen(false);
    setPresetType(null);
  };

  const handleDeletePreset = (type, index) => {
    const updated = {
      ...savedPresets,
      [type]: savedPresets[type].filter((_, i) => i !== index)
    };
    persistPresets(updated);
  };

  const currentVideo = video || (videos.length > 0 ? videos[currentIndex] : null);
  const hasMultiple = videos.length > 1;

  // Sync edited caption when current video changes
  useEffect(() => {
    if (currentVideo) {
      setEditedCaption(currentVideo.caption || '');
      setIsEditingCaption(false);
      setPresetsDropdownOpen(false);
      setPresetType(null);
      setCurrentTime(0);
      setIsPlaying(true);
      setIsLiked(false);
    }
  }, [currentVideo, currentIndex]);

  // Video source resolution
  const getVideoSrc = (v) => {
    if (!v || !v.video_path) return '';
    if (isElectron) {
      return `file:///${v.video_path.replace(/\\/g, '/')}`;
    }
    return `${API}/api/videos/file?path=${encodeURIComponent(v.video_path)}`;
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Don't trigger playback shortcuts if typing in caption textarea or preset inputs
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          setIsEditingCaption(false);
          setPresetsDropdownOpen(false);
          setPresetType(null);
        }
        return;
      }

      if (presetsDropdownOpen && e.key === 'Escape') {
        setPresetsDropdownOpen(false);
        setPresetType(null);
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasMultiple && onNavigate && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && hasMultiple && onNavigate && currentIndex < videos.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, hasMultiple, videos.length, isPlaying, isMuted, presetsDropdownOpen]);

  // Video event handlers
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  const handleSeek = (e) => {
    if (!videoRef.current) return;
    const seekTo = parseFloat(e.target.value);
    videoRef.current.currentTime = seekTo;
    setCurrentTime(seekTo);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSaveCaption = () => {
    if (onUpdateCaption) {
      onUpdateCaption(editedCaption, currentIndex);
    }
    setIsEditingCaption(false);
  };

  if (!isOpen || !currentVideo) return null;

  const rawCaption = isEditingCaption ? editedCaption : (currentVideo.caption || '');
  const hashtags = (rawCaption.match(/#[a-zA-Z0-9_À-ÿ]+/g) || []);
  const mentions = (rawCaption.match(/@[a-zA-Z0-9_.]+/g) || []);

  const renderFormattedCaption = (text) => {
    if (!text) return <span className="text-[#86868B] italic">Sem legenda definida para esta publicação.</span>;
    const tokens = text.split(/([ \n\t]+)/);
    return tokens.map((token, i) => {
      if (token.startsWith('#') && token.length > 1) {
        return (
          <span key={i} className="text-[#0071E3] font-bold hover:underline cursor-pointer">
            {token}
          </span>
        );
      }
      if (token.startsWith('@') && token.length > 1) {
        return (
          <span key={i} className="text-[#0071E3] font-bold hover:underline cursor-pointer">
            {token}
          </span>
        );
      }
      return token;
    });
  };

  const matchedAccount = accounts.find(a => a.username === currentVideo.account_username || a.id === currentVideo.account_id);
  const rawAvatar = currentVideo.avatar_url || currentVideo.account_avatar_url || matchedAccount?.avatar_url;
  const avatarSrc = rawAvatar ? (rawAvatar.startsWith('http') || rawAvatar.startsWith('data:') ? rawAvatar : `${API}${rawAvatar}`) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#E8E8ED] rounded-3xl overflow-hidden max-w-5xl w-full h-[92vh] max-h-[820px] shadow-[0_20px_50px_rgba(0,0,0,0.18)] flex flex-col md:flex-row relative animate-in zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* LEFT COLUMN: REALISTIC SMARTPHONE REELS FRAME                              */}
        {/* ========================================================================= */}
        <div className="md:w-[48%] bg-[#F5F5F7] flex flex-col items-center justify-center p-4 sm:p-6 relative border-b md:border-b-0 md:border-r border-[#E8E8ED] select-none overflow-hidden">

          {/* Smartphone Frame (9:16 Ratio) */}
          <div
            className="relative w-full max-w-[310px] sm:max-w-[325px] h-[94%] max-h-[720px] rounded-[36px] bg-black border-[5px] border-[#1D1D1F] shadow-[0_20px_45px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col group/phone"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
          >
            {/* Dynamic Island / Notch */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-40 flex items-center justify-center border border-white/10 shadow-sm pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full bg-[#18181A] mr-4 border border-white/5" />
              <div className="w-2 h-2 rounded-full bg-[#0a192f]/60" />
            </div>

            {/* Video Player */}
            <div
              className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer overflow-hidden group/video"
              onClick={togglePlay}
            >
              <video
                ref={videoRef}
                key={currentVideo.video_path}
                src={getVideoSrc(currentVideo)}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-cover"
              />

              {/* Central Play/Pause Watermark Trigger */}
              {!isPlaying && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-30 transition-all">
                  <div className="w-16 h-16 rounded-full bg-white/25 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-xl scale-100 hover:scale-105 active:scale-95 transition-transform">
                    <span className="material-symbols-outlined text-[36px] text-white ml-1">play_arrow</span>
                  </div>
                </div>
              )}

              {/* Clean Transport & Scrubber Bar at Bottom (visible on hover or when paused) */}
              <div
                className={`absolute bottom-0 left-0 right-0 z-30 p-3.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 flex flex-col gap-2 ${
                  showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Timeline slider */}
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.05"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1 bg-white/30 hover:bg-white/50 rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                  />
                </div>

                {/* Controls row: Play/Pause, Mute/Unmute, Time indicator */}
                <div className="flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                      title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isPlaying ? 'pause' : 'play_arrow'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleMute}
                      className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                      title={isMuted ? 'Ativar Som (M)' : 'Silenciar (M)'}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isMuted ? 'volume_off' : 'volume_up'}
                      </span>
                    </button>
                  </div>

                  <span className="text-[10px] font-mono font-bold text-white/90">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: METADATA, CAPTION EDITOR & QUEUE CONTROLS (LIGHT THEME)    */}
        {/* ========================================================================= */}
        <div className="md:w-[52%] flex flex-col justify-between bg-white p-6 sm:p-7 overflow-y-auto custom-scrollbar text-left">
          
          {/* Top Bar / Header */}
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#E8E8ED]">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0 border border-[#0071E3]/20 shadow-2xs">
                  <span className="material-symbols-outlined text-[20px]">smart_display</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-extrabold text-[#0071E3] uppercase tracking-wider flex items-center gap-1.5">
                    Prévia do Post
                    {hasMultiple && (
                      <span className="bg-[#F5F5F7] border border-[#E8E8ED] text-[#1D1D1F] text-[9px] px-2 py-0.2 rounded-full font-bold">
                        {currentIndex + 1} de {videos.length}
                      </span>
                    )}
                  </span>
                  <h3 className="text-sm font-bold text-[#1D1D1F] truncate max-w-[280px] sm:max-w-[340px]" title={currentVideo.video_name}>
                    {currentVideo.video_name || 'video_post.mp4'}
                  </h3>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[#86868B] hover:text-[#1D1D1F] flex items-center justify-center transition-all cursor-pointer hover:rotate-90 shadow-2xs"
                title="Fechar (Esc)"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Post Metadata Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
              
              {/* Account Box with Profile Picture */}
              <div className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shrink-0 shadow-2xs">
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={currentVideo.account_username || 'avatar'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-[#1D1D1F] text-xs font-extrabold">
                        {(currentVideo.account_username || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Conta Alvo</span>
                  <span className="text-xs font-bold text-[#1D1D1F] truncate" title={currentVideo.account_username}>
                    @{currentVideo.account_username || 'Selecione uma conta'}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Instagram Reel
                  </span>
                </div>
              </div>

              {/* Schedule Box with Integrated Date/Time Picker */}
              {onUpdateScheduleTime ? (
                <CustomDateTimePicker
                  mode="datetime"
                  value={currentVideo.scheduled_time || new Date().toISOString()}
                  onChange={(newVal) => onUpdateScheduleTime(currentIndex, newVal)}
                  renderTrigger={({ open, isOpen }) => (
                    <div
                      onClick={open}
                      className={`bg-[#F5F5F7] border transition-all rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer group hover:bg-[#EFF6FF]/60 hover:border-[#0071E3]/40 ${
                        isOpen ? 'border-[#0071E3] ring-2 ring-[#0071E3]/15 bg-[#EFF6FF]/40' : 'border-[#E8E8ED]'
                      }`}
                      title="Clique para alterar a data e o horário"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0 border border-[#0071E3]/20 shadow-2xs group-hover:scale-105 transition-transform">
                        <span className="material-symbols-outlined text-[20px]">schedule</span>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Horário Previsto</span>
                        <span className="text-xs font-bold text-[#1D1D1F] truncate group-hover:text-[#0071E3] transition-colors">
                          {currentVideo.scheduled_time
                            ? new Date(currentVideo.scheduled_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                            : 'Publicação Imediata (Clique p/ agendar)'}
                        </span>
                        <span className="text-[9px] text-[#86868B] font-medium mt-0.5">
                          Fuso: Horário Local
                        </span>
                      </div>
                    </div>
                  )}
                />
              ) : (
                <div className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0 border border-[#0071E3]/20 shadow-2xs">
                    <span className="material-symbols-outlined text-[20px]">schedule</span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Horário Previsto</span>
                    <span className="text-xs font-bold text-[#1D1D1F] truncate">
                      {currentVideo.scheduled_time 
                        ? new Date(currentVideo.scheduled_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : 'Publicação Imediata'}
                    </span>
                    <span className="text-[9px] text-[#86868B] font-medium mt-0.5">
                      Fuso: Horário Local
                    </span>
                  </div>
                </div>
              )}

            </div>

            {/* Caption & Hashtags Section */}
            <div className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#0071E3]">description</span>
                  <span className="text-[11px] font-extrabold text-[#1D1D1F] uppercase tracking-wider">Legenda do Post</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {onUpdateCaption && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingCaption) {
                          handleSaveCaption();
                        } else {
                          setIsEditingCaption(true);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                        isEditingCaption
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] border-[#E8E8ED]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isEditingCaption ? 'check' : 'edit'}
                      </span>
                      <span>{isEditingCaption ? 'Salvar' : 'Editar'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Caption Display or Edit Textarea */}
              {isEditingCaption ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editedCaption}
                    onChange={(e) => setEditedCaption(e.target.value)}
                    rows={4}
                    placeholder="Digite a legenda do post..."
                    className="w-full min-h-[110px] max-h-[140px] px-3 py-2.5 bg-white border border-[#0071E3] rounded-xl text-xs text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 resize-none leading-relaxed font-sans shadow-xs custom-scrollbar overflow-y-auto"
                    autoFocus
                  />
                  <div className="flex items-center justify-between text-[10px] text-[#86868B]">
                    <span>Pressione <b>Salvar</b> para confirmar as alterações.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedCaption(currentVideo.caption || '');
                        setIsEditingCaption(false);
                      }}
                      className="text-[#86868B] hover:text-[#1D1D1F] underline cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => {
                    if (onUpdateCaption) {
                      setEditedCaption(currentVideo.caption || '');
                      setIsEditingCaption(true);
                    }
                  }}
                  className="w-full min-h-[110px] max-h-[140px] px-3 py-2.5 bg-white rounded-xl border border-[#E8E8ED] overflow-y-auto custom-scrollbar shadow-2xs hover:border-[#0071E3]/40 transition-colors cursor-text group"
                  title="Clique para editar a legenda"
                >
                  <p className="text-xs text-[#1D1D1F] leading-relaxed break-words font-sans whitespace-pre-wrap">
                    {renderFormattedCaption(currentVideo.caption)}
                  </p>
                </div>
              )}

              {/* Presets Row */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 relative">
                {[
                  { type: 'hashtags', label: 'Hashtags', icon: null, iconText: '#' },
                  { type: 'assinatura', label: 'Assinatura', icon: 'edit_note', iconText: null },
                  { type: 'legenda', label: 'Legenda', icon: 'description', iconText: null },
                ].map((preset) => (
                  <div key={preset.type} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (presetType === preset.type && presetsDropdownOpen) {
                          setPresetsDropdownOpen(false);
                          setPresetType(null);
                        } else {
                          setPresetType(preset.type);
                          setPresetsDropdownOpen(true);
                          setShowSavePresetInput(false);
                          setNewPresetName('');
                          setNewPresetContent('');
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl flex items-center gap-1 transition-all text-[11px] font-semibold border shadow-2xs cursor-pointer ${
                        presetType === preset.type && presetsDropdownOpen
                          ? 'bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/35'
                          : 'bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] border-[#E8E8ED] hover:border-[#0071E3]/40'
                      }`}
                    >
                      {preset.iconText && <span className="text-[#0071E3] font-bold text-xs">{preset.iconText}</span>}
                      {preset.icon && <span className="material-symbols-outlined text-[14px]">{preset.icon}</span>}
                      <span>{preset.label}</span>
                      <span className="material-symbols-outlined text-[12px] opacity-70">expand_more</span>
                    </button>

                    {presetsDropdownOpen && presetType === preset.type && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => {
                            setPresetsDropdownOpen(false);
                            setPresetType(null);
                          }}
                        />
                        <div className="absolute bottom-full left-0 mb-2 bg-white border border-[#E8E8ED] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] z-50 min-w-[240px] py-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-3.5 py-1.5 border-b border-[#F5F5F7] mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-[#86868B] uppercase tracking-wider">
                              Presets de {preset.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPresetsDropdownOpen(false);
                                setPresetType(null);
                              }}
                              className="text-[#86868B] hover:text-[#1D1D1F] cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>

                          <div className="max-h-[160px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                            {(savedPresets[preset.type] || []).length === 0 ? (
                              <div className="px-3 py-3 text-center">
                                <span className="material-symbols-outlined text-[18px] text-[#86868B]/40">bookmark_border</span>
                                <p className="text-[10px] text-[#86868B] mt-0.5">Nenhum preset salvo</p>
                              </div>
                            ) : (
                              (savedPresets[preset.type] || []).map((p, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#0071E3]/5 hover:text-[#0071E3] rounded-lg transition-colors group/preset mx-1.5 cursor-pointer"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleLoadPreset(preset.type, p)}
                                    className="flex-1 text-left text-[11px] font-semibold truncate hover:text-[#0071E3] transition-colors cursor-pointer"
                                    title={p.content}
                                  >
                                    {p.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePreset(preset.type, idx);
                                    }}
                                    className="opacity-0 group-hover/preset:opacity-100 text-[#86868B] hover:text-rose-500 transition-all flex items-center justify-center cursor-pointer"
                                    title="Excluir preset"
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
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    placeholder="Ex: Assinatura Padrão"
                                    className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white transition-all"
                                    autoFocus
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Conteúdo</span>
                                  <textarea
                                    value={newPresetContent}
                                    onChange={(e) => setNewPresetContent(e.target.value)}
                                    placeholder={preset.type === 'hashtags' ? 'Ex: #marketing #vendas' : 'Digite o texto...'}
                                    rows={2}
                                    className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white resize-none leading-relaxed transition-all"
                                  />
                                </div>
                                <div className="flex gap-1.5 justify-end mt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowSavePresetInput(false);
                                      setNewPresetName('');
                                      setNewPresetContent('');
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold text-[#86868B] hover:bg-[#F5F5F7] rounded-lg transition-colors cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSavePreset(preset.type)}
                                    className="px-2.5 py-1 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[10px] font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
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
                                  const currentText = isEditingCaption ? editedCaption : (currentVideo.caption || '');
                                  if (preset.type === 'hashtags') {
                                    initialContent = currentText.match(/#\w+/g)?.join(' ') || '';
                                  } else {
                                    initialContent = currentText;
                                  }
                                  setNewPresetContent(initialContent);
                                  setNewPresetName('');
                                }}
                                className="w-full px-2 py-1.5 text-[10px] font-semibold text-[#0071E3] hover:bg-[#0071E3]/5 rounded-lg flex items-center gap-1 justify-center transition-colors border border-transparent hover:border-[#0071E3]/10 cursor-pointer"
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
              </div>

              {/* Hashtag & Character Counter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E8E8ED]">
                <span className="px-2 py-0.5 rounded-md bg-white border border-[#E8E8ED] text-[10px] font-medium text-[#86868B] shadow-2xs">
                  {rawCaption.length} caracteres
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-bold border border-[#0071E3]/20 shadow-2xs">
                  {hashtags.length} hashtags
                </span>
                {mentions.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200 shadow-2xs">
                    {mentions.length} menções
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Bottom Footer / Queue Navigation */}
          <div className="pt-4 border-t border-[#E8E8ED] flex items-center justify-between gap-3 mt-4">
            
            {/* Previous Video */}
            {hasMultiple ? (
              <button
                type="button"
                disabled={currentIndex <= 0}
                onClick={() => onNavigate && onNavigate(currentIndex - 1)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs ${
                  currentIndex <= 0
                    ? 'border-[#E8E8ED] text-[#86868B]/40 cursor-not-allowed bg-transparent'
                    : 'border-[#E8E8ED] bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] cursor-pointer active:scale-95'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Anterior</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onDeleteVideo) {
                    onDeleteVideo(currentIndex);
                  } else {
                    onClose();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                title="Excluir este vídeo do agendamento"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Excluir Vídeo</span>
              </button>
            </div>

            {/* Next Video */}
            {hasMultiple ? (
              <button
                type="button"
                disabled={currentIndex >= videos.length - 1}
                onClick={() => onNavigate && onNavigate(currentIndex + 1)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm shadow-[#0071E3]/20 ${
                  currentIndex >= videos.length - 1
                    ? 'border-[#E8E8ED] text-[#86868B]/40 cursor-not-allowed bg-transparent'
                    : 'border-[#0071E3] bg-[#0071E3] hover:bg-[#005cbb] text-white cursor-pointer active:scale-95'
                }`}
              >
                <span>Próximo</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : <div />}

          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}
