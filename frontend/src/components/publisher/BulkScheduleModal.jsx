import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CustomSelect from '../CustomSelect';
import CustomDateTimePicker from '../CustomDateTimePicker';
import VideoPreviewModal from './VideoPreviewModal';
import { getCloudConfig, syncAccountToCloud, uploadVideoToCloud, submitCloudBulkSchedule } from '../../utils/cloudSync';

const API = 'http://localhost:8000';

const DAYS_MAP = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
];

const BASE_PEAK_HOURS = [
  { label: 'Manhã', hour: 9, min: 15 },
  { label: 'Tarde', hour: 14, min: 30 },
  { label: 'Noite', hour: 19, min: 10 },
  { label: 'Coruja', hour: 21, min: 45 },
];

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatScheduleBadge(isoStr) {
  if (!isoStr) return '';
  try {
    const dt = new Date(isoStr);
    if (!isNaN(dt.getTime())) {
      const day = dt.getDate();
      const month = dt.getMonth();
      const weekdayShort = WEEKDAYS_SHORT[dt.getDay()] || '';
      const dayStr = String(day).padStart(2, '0');
      const monthShort = MONTH_NAMES_SHORT[month] || '';
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      return `${weekdayShort}, ${dayStr} de ${monthShort} • ${hh}:${mm}`;
    }
    const [dPart, tPart] = isoStr.split('T');
    const [year, month, day] = dPart.split('-').map(Number);
    const [hours, minutes] = (tPart || '00:00').split(':').map(Number);
    const fallbackDt = new Date(year, month - 1, day, hours, minutes);
    const dayStr = String(day).padStart(2, '0');
    const monthShort = MONTH_NAMES_SHORT[month - 1] || '';
    const weekdayShort = WEEKDAYS_SHORT[fallbackDt.getDay()] || '';
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${weekdayShort}, ${dayStr} de ${monthShort} • ${hh}:${mm}`;
  } catch {
    return isoStr;
  }
}

export default function BulkScheduleModal({ isOpen, onClose, accounts, triggerToast, onSuccess }) {
  const isElectron = !!(window.electronAPI);
  const [step, setStep] = useState(1);

  // Step 1 State
  const [folderPath, setFolderPath] = useState('');
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [scannedVideos, setScannedVideos] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');

  // Step 2 State
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().slice(0, 10);
  });
  const [humanizeJitter, setHumanizeJitter] = useState(true);
  const [captionMode, setCaptionMode] = useState('filename'); // 'filename' | 'ai' | 'fixed'
  const [fixedCaption, setFixedCaption] = useState('');

  // Presets State
  const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false);
  const [presetType, setPresetType] = useState(null);
  const [presetCoords, setPresetCoords] = useState({ top: null, bottom: null, left: 0, width: 260 });
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

  const handleOpenPresetDropdown = (type, e) => {
    if (presetType === type && presetsDropdownOpen) {
      setPresetsDropdownOpen(false);
      setPresetType(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownWidth = 260;
    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - dropdownWidth - 10);
    }
    
    // Check if dropdown overflows bottom of viewport; if so, open upwards directly above the button
    const isUpwards = (rect.bottom + 220 > window.innerHeight - 10);

    setPresetCoords({
      top: isUpwards ? null : Math.round(rect.bottom + 6),
      bottom: isUpwards ? Math.round(window.innerHeight - rect.top + 6) : null,
      left: Math.max(10, Math.round(left)),
      width: dropdownWidth
    });
    setPresetType(type);
    setPresetsDropdownOpen(true);
    setShowSavePresetInput(false);
    setNewPresetName('');
    setNewPresetContent('');
  };

  useEffect(() => {
    function handlePresetClickOutside(e) {
      const portalEl = document.getElementById('bulk-preset-portal');
      if (portalEl && !portalEl.contains(e.target) && !e.target.closest('.preset-trigger-btn')) {
        setPresetsDropdownOpen(false);
        setPresetType(null);
      }
    }
    if (presetsDropdownOpen) {
      document.addEventListener('mousedown', handlePresetClickOutside);
    }
    return () => document.removeEventListener('mousedown', handlePresetClickOutside);
  }, [presetsDropdownOpen]);

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
    if (type === 'hashtags') setFixedCaption(prev => prev ? prev + ' ' + preset.content : preset.content);
    else if (type === 'assinatura') setFixedCaption(prev => prev ? prev + '\n\n' + preset.content : preset.content);
    else if (type === 'legenda') setFixedCaption(preset.content);
    setPresetsDropdownOpen(false);
    setPresetType(null);
  };

  const handleDeletePreset = (type, index) => {
    const updated = { ...savedPresets, [type]: savedPresets[type].filter((_, i) => i !== index) };
    persistPresets(updated);
    triggerToast?.('Preset removido', 'info');
  };

  // Step 3 State (Generated Schedule Preview)
  const [previewSchedule, setPreviewSchedule] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewModalIndex, setPreviewModalIndex] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({
    isUploading: false,
    current: 0,
    total: 0,
    currentFilename: '',
    percent: 0,
    statusText: '',
  });

  const handleUpdateCaptionFromModal = (newCaption, index) => {
    const updated = [...previewSchedule];
    if (updated[index]) {
      updated[index].caption = newCaption;
      setPreviewSchedule(updated);
      triggerToast?.('Legenda atualizada na fila!', 'success');
    }
  };

  const handleRemoveScheduleItem = (index) => {
    const updated = previewSchedule.filter((_, i) => i !== index);
    setPreviewSchedule(updated);
    triggerToast?.('Vídeo removido do agendamento', 'info');
  };

  const handleDeleteVideoFromModal = (index) => {
    const updated = previewSchedule.filter((_, i) => i !== index);
    setPreviewSchedule(updated);
    triggerToast?.('Vídeo removido do agendamento', 'info');

    if (updated.length === 0) {
      setPreviewModalIndex(null);
    } else if (index >= updated.length) {
      // Se for o último vídeo, volta para o anterior
      setPreviewModalIndex(updated.length - 1);
    } else {
      // Pula para o próximo vídeo (que assume a posição 'index')
      setPreviewModalIndex(index);
    }
  };

  const handleUpdateScheduleTime = (index, newIso) => {
    const updated = [...previewSchedule];
    const item = { ...updated[index] };
    item.scheduled_time = newIso;
    
    try {
      const [dPart] = newIso.split('T');
      const [y, m, d] = dPart.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayOfWeek = dt.getDay();
      item.weekday_name = DAYS_MAP.find(dm => dm.id === dayOfWeek)?.full || '';
    } catch {}

    updated[index] = item;
    setPreviewSchedule(updated);
  };

  // Submit Bulk Schedule to Backend (Local or VPS Cloud 24/7)
  const handleSubmitBulk = async () => {
    if (previewSchedule.length === 0) return;
    setSubmitting(true);

    const cloudConfig = getCloudConfig();
    const useCloud = cloudConfig && cloudConfig.enabled && cloudConfig.vpsUrl;

    if (useCloud) {
      // ─── CLOUD MODE (VPS 24/7) ───
      try {
        setUploadProgress({
          isUploading: true,
          current: 0,
          total: previewSchedule.length,
          currentFilename: '',
          percent: 0,
          statusText: 'Sincronizando conta com a VPS...',
        });

        // 1. Sync target account to VPS
        const targetAccount = accounts.find(a => a.username === selectedAccount);
        if (targetAccount) {
          try {
            await syncAccountToCloud(cloudConfig.vpsUrl, cloudConfig.apiKey, targetAccount);
          } catch (e) {
            console.warn('Aviso ao sincronizar conta com a VPS:', e);
          }
        }

        // 2. Upload video files sequentially to VPS
        const cloudPosts = [];
        for (let i = 0; i < previewSchedule.length; i++) {
          const item = previewSchedule[i];
          setUploadProgress({
            isUploading: true,
            current: i + 1,
            total: previewSchedule.length,
            currentFilename: item.video_name,
            percent: 0,
            statusText: `Enviando vídeo ${i + 1} de ${previewSchedule.length}...`,
          });

          const uploadRes = await uploadVideoToCloud(
            cloudConfig.vpsUrl,
            cloudConfig.apiKey,
            item.video_path,
            item.video_name,
            (percent) => {
              setUploadProgress(prev => ({
                ...prev,
                percent,
                statusText: `Enviando vídeo ${i + 1} de ${previewSchedule.length} (${percent}%)...`,
              }));
            }
          );

          cloudPosts.push({
            video_path: uploadRes.video_path,
            caption: item.caption,
            scheduled_time: item.scheduled_time,
            account_username: item.account_username,
            post_type: 'reel',
          });
        }

        // 3. Submit bulk schedule to VPS
        setUploadProgress(prev => ({
          ...prev,
          statusText: 'Registrando agendamentos na nuvem...',
        }));

        await submitCloudBulkSchedule(cloudConfig.vpsUrl, cloudConfig.apiKey, { posts: cloudPosts });

        setUploadProgress({ isUploading: false, current: 0, total: 0, currentFilename: '', percent: 0, statusText: '' });
        triggerToast(`☁️ 🎉 ${previewSchedule.length} vídeos agendados na nuvem! Eles serão publicados mesmo com o PC desligado.`, 'success');
        if (onSuccess) onSuccess();
        onClose();
      } catch (err) {
        setUploadProgress({ isUploading: false, current: 0, total: 0, currentFilename: '', percent: 0, statusText: '' });
        triggerToast(`Erro ao enviar para a nuvem: ${err.message || 'Falha na conexão.'}`, 'error');
      }
      setSubmitting(false);
      return;
    }

    // ─── LOCAL MODE ───
    try {
      const payload = {
        posts: previewSchedule.map(p => ({
          video_path: p.video_path,
          caption: p.caption,
          scheduled_time: p.scheduled_time,
          account_username: p.account_username,
          post_type: 'reel',
        })),
      };

      const res = await fetch(`${API}/api/posts/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        triggerToast(`🎉 ${data.count} vídeos agendados com sucesso!`, 'success');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        triggerToast(`Erro ao agendar: ${data.detail || 'Falha na requisição.'}`, 'error');
      }
    } catch (e) {
      triggerToast('Erro de rede ao agendar em massa.', 'error');
    }
    setSubmitting(false);
  };

  // Select default account
  useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].username);
    }
  }, [accounts]);

  if (!isOpen) return null;

  // Scan folder for videos
  const handleScanFolder = async (path) => {
    if (!path) return;
    setLoadingFolder(true);
    try {
      const res = await fetch(`${API}/api/videos/scan-folder?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setScannedVideos(data);
        if (data.length === 0) {
          triggerToast('Nenhum vídeo (.mp4) encontrado na pasta.', 'info');
        } else {
          triggerToast(`${data.length} vídeo(s) encontrado(s)!`, 'success');
        }
      } else {
        triggerToast('Erro ao ler pasta.', 'error');
      }
    } catch (e) {
      triggerToast('Erro de conexão ao escanear pasta.', 'error');
    }
    setLoadingFolder(false);
  };

  // Toggle Day Selection
  const toggleDay = (dayId) => {
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length === 1) {
        triggerToast('Selecione pelo menos 1 dia da semana.', 'error');
        return;
      }
      setSelectedDays(selectedDays.filter(d => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId].sort());
    }
  };

  // AI Humanized Schedule Generator Algorithm
  const generateAISchedule = async () => {
    if (scannedVideos.length === 0) {
      triggerToast('Nenhum vídeo selecionado na Etapa 1.', 'error');
      setStep(1);
      return;
    }
    if (selectedDays.length === 0) {
      triggerToast('Selecione pelo menos um dia da semana.', 'error');
      return;
    }

    const items = [];
    const [startY, startM, startD] = startDate.split('-').map(Number);
    let currentDate = new Date(startY, startM - 1, startD, 9, 0);

    let videoIndex = 0;

    while (videoIndex < scannedVideos.length) {
      const dayOfWeek = currentDate.getDay();

      if (selectedDays.includes(dayOfWeek)) {
        // Generate post slots for this valid day
        for (let s = 0; s < postsPerDay && videoIndex < scannedVideos.length; s++) {
          const video = scannedVideos[videoIndex];
          const basePeak = BASE_PEAK_HOURS[s % BASE_PEAK_HOURS.length];

          let targetHour = basePeak.hour;
          let targetMin = basePeak.min;

          // Apply AI Humanization Jitter (random variation between -22m and +24m)
          if (humanizeJitter) {
            const jitterMinutes = Math.floor(Math.random() * 47) - 22; // -22 to +24
            let totalMins = targetHour * 60 + targetMin + jitterMinutes;
            totalMins = Math.max(8 * 60, Math.min(23 * 60, totalMins)); // Clamp between 08:00 and 23:00
            targetHour = Math.floor(totalMins / 60);
            targetMin = totalMins % 60;
          }

          const scheduledDt = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
            targetHour,
            targetMin,
            Math.floor(Math.random() * 59)
          );

          const isoStr = scheduledDt.toISOString();

          let initialCaption = '';
          const cleanName = video.name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ');
          if (captionMode === 'fixed') {
            initialCaption = fixedCaption || cleanName;
          } else {
            initialCaption = cleanName;
          }

          items.push({
            id: `${video.name}-${videoIndex}`,
            video_path: video.path,
            video_name: video.name,
            scheduled_time: isoStr,
            caption: initialCaption,
            account_username: selectedAccount,
            weekday_name: DAYS_MAP.find(dm => dm.id === dayOfWeek)?.full || '',
          });

          videoIndex++;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    setPreviewSchedule(items);
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#E8E8ED] shadow-[0_24px_60px_rgba(0,0,0,0.22)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#F5F5F7] flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center shadow-md shadow-[#0071E3]/20 shrink-0">
              <span className="material-symbols-outlined text-[22px] text-white">rocket_launch</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1D1D1F] tracking-[-0.01em]">Agendamento em Massa IA</h2>
              <p className="text-xs text-[#86868B]">Programe pastas inteiras de vídeos com distribuição antirobô.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#1D1D1F] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Wizard Step Indicator */}
        <div className="px-6 py-3.5 bg-[#F5F5F7] border-b border-[#E8E8ED] flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${step >= 1 ? 'bg-[#0071E3] text-white shadow-xs' : 'bg-gray-200 text-gray-600'}`}>
              {step > 1 ? '✓' : '1'}
            </span>
            <span>1. Pasta & Perfil</span>
          </div>

          <div className="flex-1 h-[2px] bg-[#E8E8ED] mx-4" />

          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${step >= 2 ? 'bg-[#0071E3] text-white shadow-xs' : 'bg-gray-200 text-gray-600'}`}>
              {step > 2 ? '✓' : '2'}
            </span>
            <span>2. Regras & IA</span>
          </div>

          <div className="flex-1 h-[2px] bg-[#E8E8ED] mx-4" />

          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${step >= 3 ? 'bg-[#0071E3] text-white shadow-xs' : 'bg-gray-200 text-gray-600'}`}>
              3
            </span>
            <span>3. Cronograma</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className={`p-6 flex-1 flex flex-col gap-6 ${step === 3 ? 'overflow-y-auto' : 'overflow-visible'}`}>

          {/* STEP 1: Pasta & Perfil */}
          {step === 1 && (
            <div className="flex flex-col gap-6">
              {/* Account Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#1D1D1F]">Perfil de Destino (Instagram)</label>
                <CustomSelect
                  value={selectedAccount}
                  onChange={setSelectedAccount}
                  options={accounts.map(acc => {
                    const isOfficial = acc.has_official_token || acc.auth_mode === 'official';
                    const isRevoked = Boolean(acc.revoked);
                    const name = acc.display_name || acc.username;
                    let label = `@${name}`;
                    if (isRevoked) label = `@${name} (⚠️ Desautorizada na Meta)`;
                    else if (isOfficial) label = `@${name} (✓ Meta Oficial)`;
                    return {
                      value: acc.username,
                      label: label,
                      avatar: acc.avatar_url ? (acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`) : null,
                      username: acc.username
                    };
                  })}
                  placeholder="Selecione uma conta"
                />
                {(() => {
                  const currentAcc = accounts.find(a => a.username === selectedAccount);
                  if (!currentAcc) return null;
                  const isOfficial = currentAcc.has_official_token || currentAcc.auth_mode === 'official';
                  if (currentAcc.revoked) {
                    return (
                      <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        Esta conta foi desautorizada na Meta. Por favor, reconecte na aba Perfis.
                      </p>
                    );
                  }
                  if (isOfficial) {
                    return (
                      <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        Conta Oficial da Meta pronta para publicação via API.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Folder Selector / Dropzone */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#1D1D1F]">Pasta de Origem dos Vídeos (.mp4)</label>
                
                <div
                  onClick={async () => {
                    if (isElectron) {
                      const path = await window.electronAPI.selectDirectory();
                      if (path) {
                        setFolderPath(path);
                        handleScanFolder(path);
                      }
                    }
                  }}
                  className="p-6 border-2 border-dashed border-[#0071E3]/30 hover:border-[#0071E3] bg-[#0071E3]/5 hover:bg-[#0071E3]/10 rounded-2xl transition-all flex flex-col items-center justify-center gap-2.5 text-center group cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-2xl bg-white text-[#0071E3] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[22px]">
                      {folderPath ? 'folder_open' : 'upload'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1 max-w-md">
                    <p className="text-xs font-bold text-[#1D1D1F]">
                      {folderPath ? 'Pasta Selecionada' : 'Arraste ou clique para vídeos'}
                    </p>
                    <p className="text-[11px] text-[#86868B] font-mono truncate max-w-full px-2">
                      {folderPath ? folderPath : 'Lote (.mp4, .mov, .webm)'}
                    </p>
                  </div>

                  {folderPath ? (
                    <div className="mt-1 px-3 py-1 rounded-xl bg-white border border-[#E8E8ED] text-[11px] font-bold text-[#0071E3] flex items-center gap-1.5 shadow-xs">
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      Trocar pasta
                    </div>
                  ) : !isElectron ? (
                    <div className="flex w-full max-w-md gap-2 mt-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Caminho da pasta (ex: C:\Videos\Reels)"
                        value={folderPath}
                        onChange={e => {
                          setFolderPath(e.target.value);
                          handleScanFolder(e.target.value);
                        }}
                        className="flex-1 p-2.5 bg-white border border-[#E8E8ED] rounded-xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] shadow-xs font-medium"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Scanned Videos List */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-[#1D1D1F]">
                    Mídias Encontradas ({scannedVideos.length})
                  </span>
                  {loadingFolder && <span className="text-xs text-[#0071E3] font-bold animate-pulse">Escaneando pasta...</span>}
                </div>

                {scannedVideos.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-[#E8E8ED] rounded-2xl divide-y divide-[#F5F5F7] bg-white">
                    {scannedVideos.map((v, i) => (
                      <div key={v.path} className="px-4 py-2.5 flex items-center justify-between hover:bg-[#F5F5F7] transition-colors">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <span className="text-xs font-bold text-[#86868B] w-5">{i + 1}.</span>
                          <span className="material-symbols-outlined text-[18px] text-[#0071E3]">movie</span>
                          <span className="text-xs font-semibold text-[#1D1D1F] truncate">{v.name}</span>
                        </div>
                        <span className="text-[10px] text-[#86868B] font-mono shrink-0 font-semibold">
                          {(v.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Regras & IA */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              {/* Days of Week Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#1D1D1F]">Dias Permitidos para Publicação</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_MAP.map(d => {
                    const isSel = selectedDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDay(d.id)}
                        className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSel
                            ? 'bg-[#0071E3] text-white shadow-xs'
                            : 'bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED] hover:text-[#1D1D1F] border border-transparent'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grid 2 Column: Posts per Day & Start Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[#1D1D1F]">Frequência Diária</label>
                  <div className="p-2 bg-white border border-[#E8E8ED] rounded-xl flex items-center justify-between shadow-xs h-[42px]">
                    <div className="flex items-center gap-2 pl-1.5">
                      <span className="text-xs font-semibold text-[#86868B]">Posts/dia</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={postsPerDay}
                        onChange={e => setPostsPerDay(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                        className="w-8 text-center text-xs font-extrabold text-[#1D1D1F] bg-transparent outline-none border-none p-0 focus:outline-none focus:ring-0 focus:border-none shadow-none ring-0 focus:ring-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{ outline: 'none', border: 'none', boxShadow: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                      />
                      <div className="flex flex-col border-l border-[#E8E8ED] pl-1 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPostsPerDay(prev => Math.min(20, prev + 1))}
                          className="w-4 h-3.5 hover:bg-[#F5F5F7] rounded flex items-center justify-center text-[#1D1D1F] transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPostsPerDay(prev => Math.max(1, prev - 1))}
                          className="w-4 h-3.5 hover:bg-[#F5F5F7] rounded flex items-center justify-center text-[#1D1D1F] transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-[#1D1D1F]">Data de Início</label>
                  <CustomDateTimePicker
                    mode="date"
                    value={`${startDate}T09:00`}
                    onChange={(val) => setStartDate(val.split('T')[0])}
                  />
                </div>
              </div>


              {/* Caption Mode Cards */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#1D1D1F]">Estilo da Legenda</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCaptionMode('filename')}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      captionMode === 'filename'
                        ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3] shadow-xs font-extrabold ring-1 ring-[#0071E3]'
                        : 'border-[#E8E8ED] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] font-semibold'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${captionMode === 'filename' ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>description</span>
                    Nome do Arquivo
                  </button>

                  <button
                    type="button"
                    onClick={() => setCaptionMode('fixed')}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      captionMode === 'fixed'
                        ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3] shadow-xs font-extrabold ring-1 ring-[#0071E3]'
                        : 'border-[#E8E8ED] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] font-semibold'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${captionMode === 'fixed' ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>edit_note</span>
                    Legenda Única Fixa
                  </button>

                  <button
                    type="button"
                    onClick={() => setCaptionMode('ai')}
                    className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      captionMode === 'ai'
                        ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3] shadow-xs font-extrabold ring-1 ring-[#0071E3]'
                        : 'border-[#E8E8ED] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] font-semibold'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${captionMode === 'ai' ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>auto_awesome</span>
                    Legenda IA
                  </button>
                </div>

                {captionMode === 'fixed' && (
                  <div className="flex flex-col gap-2 mt-1">
                    <textarea
                      rows={4}
                      placeholder="Digite a legenda padrão para todos os vídeos..."
                      value={fixedCaption}
                      onChange={e => setFixedCaption(e.target.value)}
                      className="p-3.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-2xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-y min-h-[110px] leading-relaxed placeholder:text-[#86868B] font-medium shadow-xs"
                    />

                    {/* Presets */}
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {[
                        { type: 'hashtags', label: 'Hashtags', icon: null, iconText: '#' },
                        { type: 'assinatura', label: 'Assinatura', icon: 'edit_note', iconText: null },
                        { type: 'legenda', label: 'Legenda', icon: 'description', iconText: null },
                      ].map(preset => (
                        <div key={preset.type} className="relative">
                          <button
                            type="button"
                            onClick={(e) => handleOpenPresetDropdown(preset.type, e)}
                            className={`preset-trigger-btn px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 active:scale-98 border cursor-pointer ${
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
                        </div>
                      ))}
                    </div>

                    {/* Presets Portal Dropdown (Renders outside modal boundaries to prevent clipping) */}
                    {presetsDropdownOpen && presetType && createPortal(
                      <div
                        id="bulk-preset-portal"
                        style={{
                          position: 'fixed',
                          ...(presetCoords.top !== null && presetCoords.top !== undefined ? { top: `${presetCoords.top}px` } : {}),
                          ...(presetCoords.bottom !== null && presetCoords.bottom !== undefined ? { bottom: `${presetCoords.bottom}px` } : {}),
                          left: `${presetCoords.left}px`,
                          width: `${presetCoords.width}px`,
                          zIndex: 999999,
                        }}
                        className="bg-white border border-[#E8E8ED] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] py-2 flex flex-col animate-in fade-in zoom-in-95 duration-150"
                      >
                        <div className="px-3.5 py-1.5 border-b border-[#F5F5F7] mb-1.5 flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-[#86868B] uppercase tracking-wider">
                            Presets de {presetType === 'hashtags' ? 'Hashtags' : presetType === 'assinatura' ? 'Assinatura' : 'Legenda'}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => { setPresetsDropdownOpen(false); setPresetType(null); }}
                            className="text-[#86868B] hover:text-[#1D1D1F] p-0.5 rounded-md hover:bg-[#F5F5F7] transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                        
                        <div className="max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5 px-1">
                          {(savedPresets[presetType] || []).length === 0 ? (
                            <div className="px-3 py-4 text-center">
                              <span className="material-symbols-outlined text-[18px] text-[#86868B]/30">bookmark_border</span>
                              <p className="text-[10px] text-[#86868B] mt-1">Nenhum preset salvo</p>
                            </div>
                          ) : (
                            (savedPresets[presetType] || []).map((p, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#0071E3]/5 hover:text-[#0071E3] rounded-lg transition-colors group/preset mx-1">
                                <button 
                                  type="button" 
                                  onClick={() => handleLoadPreset(presetType, p)} 
                                  className="flex-1 text-left text-[11px] font-semibold truncate hover:text-[#0071E3] transition-colors cursor-pointer" 
                                  title={p.content}
                                >
                                  {p.name}
                                </button>
                                <button 
                                  type="button" 
                                  onClick={(e) => { e.stopPropagation(); handleDeletePreset(presetType, idx); }} 
                                  className="opacity-0 group-hover/preset:opacity-100 text-[#86868B] hover:text-rose-500 transition-all flex items-center justify-center cursor-pointer"
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
                                  placeholder={presetType === 'hashtags' ? "Ex: #marketing #vendas" : "Digite o texto..."} 
                                  rows={2}
                                  className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white resize-none leading-relaxed transition-all" 
                                />
                              </div>
                              <div className="flex gap-1.5 justify-end mt-1">
                                <button 
                                  type="button" 
                                  onClick={() => { setShowSavePresetInput(false); setNewPresetName(''); setNewPresetContent(''); }} 
                                  className="px-2 py-1 text-[10px] font-bold text-[#86868B] hover:bg-[#F5F5F7] rounded-lg transition-colors cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => handleSavePreset(presetType)} 
                                  className="px-2.5 py-1 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
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
                                if (fixedCaption && presetType === 'legenda') {
                                  setNewPresetContent(fixedCaption);
                                } else {
                                  setNewPresetContent('');
                                }
                              }} 
                              className="w-full py-1.5 bg-[#F5F5F7] hover:bg-[#0071E3]/10 hover:text-[#0071E3] text-[#1D1D1F] text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">add</span>
                              Salvar Novo Preset
                            </button>
                          )}
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Pré-visualização & Confirmação */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              {/* Summary Stats Banner */}
              <div className="p-4 bg-[#F5F5F7] rounded-2xl border border-[#E8E8ED] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#86868B] uppercase">Total de Vídeos</span>
                    <span className="text-sm font-extrabold text-[#1D1D1F]">{previewSchedule.length} Reels</span>
                  </div>
                  <div className="w-[1px] h-7 bg-[#E8E8ED]" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#86868B] uppercase">Frequência</span>
                    <span className="text-sm font-extrabold text-[#1D1D1F]">{postsPerDay} post(s)/dia</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generateAISchedule}
                  className="px-3 py-2 rounded-xl bg-white border border-[#E8E8ED] hover:bg-[#F5F5F7] text-xs font-bold text-[#0071E3] flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Regerar Horários IA
                </button>
              </div>

              {/* Timeline Cards */}
              {previewSchedule.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#E8E8ED] rounded-2xl flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-4xl text-[#86868B]">video_library</span>
                  <p className="text-xs font-bold text-[#1D1D1F]">Nenhum vídeo no cronograma</p>
                  <p className="text-[11px] text-[#86868B]">Volte e selecione vídeos ou regere os horários.</p>
                  <button
                    type="button"
                    onClick={generateAISchedule}
                    className="mt-2 px-4 py-2 rounded-xl bg-[#0071E3] text-white text-xs font-bold hover:bg-[#005cbb] transition-all cursor-pointer shadow-sm"
                  >
                    Regerar Cronograma
                  </button>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-[#E8E8ED] rounded-2xl divide-y divide-[#F5F5F7] bg-white custom-scrollbar">
                  {previewSchedule.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-[#F5F5F7]/60 transition-colors">
                      {/* Left: Index, Video Play Thumbnail, Name */}
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                        <span className="text-xs font-bold text-[#86868B] w-5 shrink-0">{idx + 1}.</span>
                        
                        {/* Play Video Trigger Button */}
                        <button
                          type="button"
                          onClick={() => setPreviewModalIndex(idx)}
                          className="w-8 h-8 rounded-xl bg-[#0071E3]/10 hover:bg-[#0071E3] text-[#0071E3] hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer group shadow-2xs"
                          title="Assistir prévia do vídeo"
                        >
                          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        </button>

                        <div className="flex flex-col overflow-hidden min-w-0 flex-1 justify-center">
                          <span className="text-xs font-bold text-[#1D1D1F] truncate" title={item.video_name}>
                            {item.video_name}
                          </span>
                        </div>
                      </div>

                      {/* Right: Date/Time Badge (Read-only) */}
                      <div className="flex items-center shrink-0">
                        <div className="px-2.5 py-1.5 rounded-xl bg-[#0071E3]/10 text-[#0071E3] text-[11px] font-extrabold flex items-center gap-1.5 border border-[#0071E3]/20 select-none shadow-2xs">
                          <span className="material-symbols-outlined text-[15px]">event</span>
                          <span>{formatScheduleBadge(item.scheduled_time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Navigation Actions */}
        <div className="px-6 py-4 border-t border-[#F5F5F7] bg-[#F5F5F7] flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-5 py-2.5 rounded-2xl bg-white border border-[#E8E8ED] hover:bg-[#F5F5F7] text-xs font-bold text-[#1D1D1F] transition-all shadow-xs cursor-pointer"
            >
              Voltar
            </button>
          ) : <div />}

          {step === 1 && (
            <button
              type="button"
              disabled={scannedVideos.length === 0 || !selectedAccount}
              onClick={() => setStep(2)}
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                scannedVideos.length === 0 || !selectedAccount
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-[#0071E3] hover:bg-[#005cbb] text-white shadow-md shadow-[#0071E3]/20 active:scale-98 cursor-pointer'
              }`}
            >
              Continuar
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={generateAISchedule}
              className="px-6 py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#005cbb] active:scale-98 text-white font-bold text-xs shadow-md shadow-[#0071E3]/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Gerar Cronograma IA
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              disabled={submitting || previewSchedule.length === 0}
              onClick={handleSubmitBulk}
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                submitting || previewSchedule.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-[#0071E3] hover:bg-[#005cbb] text-white shadow-md shadow-[#0071E3]/20 active:scale-98 cursor-pointer'
              }`}
            >
              {submitting ? 'Agendando...' : `Confirmar e Agendar (${previewSchedule.length}) 🚀`}
            </button>
          )}
        </div>

      </div>

      {/* Video Preview Modal */}
      {previewModalIndex !== null && previewSchedule[previewModalIndex] && (
        <VideoPreviewModal
          isOpen={previewModalIndex !== null}
          onClose={() => setPreviewModalIndex(null)}
          video={previewSchedule[previewModalIndex]}
          videos={previewSchedule}
          accounts={accounts}
          currentIndex={previewModalIndex}
          onNavigate={(newIdx) => setPreviewModalIndex(newIdx)}
          onUpdateCaption={handleUpdateCaptionFromModal}
          onUpdateScheduleTime={handleUpdateScheduleTime}
          onDeleteVideo={handleDeleteVideoFromModal}
        />
      )}

      {/* Upload to Cloud Progress Overlay */}
      {uploadProgress.isUploading && (
        <div className="fixed inset-0 z-[9999999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E8E8ED] flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-[36px] animate-bounce">cloud_upload</span>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold text-[#1D1D1F]">Enviando para a Nuvem 24/7</h3>
              <p className="text-xs text-[#86868B]">
                {uploadProgress.statusText || 'Processando envio dos vídeos para a VPS...'}
              </p>
            </div>

            {uploadProgress.total > 0 && (
              <div className="w-full flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                  <span className="truncate max-w-[220px]" title={uploadProgress.currentFilename}>
                    {uploadProgress.currentFilename || `Vídeo ${uploadProgress.current}`}
                  </span>
                  <span className="text-[#0071E3] font-bold">
                    {uploadProgress.current} / {uploadProgress.total} ({uploadProgress.percent}%)
                  </span>
                </div>

                <div className="w-full h-3 bg-[#F5F5F7] rounded-full overflow-hidden border border-[#E8E8ED]">
                  <div
                    className="h-full bg-[#0071E3] rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#86868B] italic">
              Não feche esta janela enquanto os arquivos são transferidos para a VPS.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
