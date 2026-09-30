import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CustomSelect from '../CustomSelect';
import CustomDateTimePicker from '../CustomDateTimePicker';
import VideoPreviewModal from './VideoPreviewModal';
import { CaptionText } from './PublisherParts';
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

export default function BulkScheduleModal({ isOpen, onClose, accounts, triggerToast, onSuccess, initialDate }) {
  const isElectron = !!(window.electronAPI);
  const [step, setStep] = useState(1);

  // Step 1 State
  const [postType, setPostType] = useState('reel'); // 'reel' | 'image' | 'carousel'
  const [carouselPreviewIndex, setCarouselPreviewIndex] = useState(0);
  const [folderPath, setFolderPath] = useState('');
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [scannedVideos, setScannedVideos] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'reels' | 'images'
  const [isDragging, setIsDragging] = useState(false);

  // Single Post Mode State (quando há 1 mídia selecionada)
  const [singlePostTime, setSinglePostTime] = useState(() => {
    const tom = new Date();
    tom.setMinutes(tom.getMinutes() + 15);
    return tom.toISOString().slice(0, 16);
  });

  // Step 2 State (Lote)
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return tom.toISOString().slice(0, 10);
  });
  const [humanizeJitter, setHumanizeJitter] = useState(true);
  const [captionMode, setCaptionMode] = useState('filename'); // 'filename' | 'fixed'
  const [fixedCaption, setFixedCaption] = useState('');

  // Video Player & Preview States (para post único na página 2)
  const singleVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [imgAspect, setImgAspect] = useState('1/1'); // '1/1' | '4/5'

  // Carrossel Multi-Grupos & Drag-and-Drop States
  const [photosPerCarousel, setPhotosPerCarousel] = useState(4);
  const [carouselGroups, setCarouselGroups] = useState([]); // [{ id, images: [], caption: '', scheduled_time: '' }]
  const [activeGroupPresetIndex, setActiveGroupPresetIndex] = useState(null);
  const [draggedPhotoInfo, setDraggedPhotoInfo] = useState(null); // { groupIndex, photoIndex }
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState(null);
  const [selectedCarouselPreviewTab, setSelectedCarouselPreviewTab] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null); // { url, name, index, total }

  const resetModalState = () => {
    setStep(1);
    setPostType('reel');
    setCarouselPreviewIndex(0);
    setFolderPath('');
    setLoadingFolder(false);
    setScannedVideos([]);
    setSelectedAccount('');
    setMediaFilter('all');
    setCaptionMode('filename');
    setFixedCaption('');
    setPhotosPerCarousel(4);
    setCarouselGroups([]);
    setActiveGroupPresetIndex(null);
    setDraggedPhotoInfo(null);
    setDragOverGroupIndex(null);
    setSelectedCarouselPreviewTab(0);
    setPreviewSchedule([]);
    setPreviewModalIndex(null);
    setLightboxImage(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetModalState();
    if (onClose) onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      resetModalState();
    } else if (initialDate) {
      const d = initialDate instanceof Date ? initialDate : new Date(initialDate);
      if (!isNaN(d.getTime())) {
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISODate = new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
        setStartDate(localISODate);
        setSinglePostTime(`${localISODate}T12:00`);
        const dayOfWeek = d.getDay();
        setSelectedDays(prev => (prev.includes(dayOfWeek) ? prev : [...prev, dayOfWeek]));
      }
    }
  }, [isOpen, initialDate]);

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      const ratio = naturalHeight / naturalWidth;
      if (ratio >= 1.1) {
        setImgAspect('4/5');
      } else {
        setImgAspect('1/1');
      }
    }
  };

  const toggleSinglePlay = () => {
    if (!singleVideoRef.current) return;
    if (singleVideoRef.current.paused) {
      singleVideoRef.current.play();
      setIsPlaying(true);
    } else {
      singleVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleSingleMute = () => {
    if (!singleVideoRef.current) return;
    singleVideoRef.current.muted = !singleVideoRef.current.muted;
    setIsMuted(singleVideoRef.current.muted);
  };

  const formatVideoTime = (secs) => {
    if (isNaN(secs) || secs === 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getVideoSrc = (v) => {
    if (!v) return '';
    const path = v.path || v.video_path;
    if (!path) return '';
    if (isElectron) {
      return `file:///${path.replace(/\\/g, '/')}`;
    }
    return `${API}/api/videos/file?path=${encodeURIComponent(path)}`;
  };

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

  const handleOpenPresetDropdown = (type, e, groupIdx = null) => {
    setActiveGroupPresetIndex(groupIdx);
    if (presetType === type && presetsDropdownOpen && activeGroupPresetIndex === groupIdx) {
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
    if (activeGroupPresetIndex !== null && carouselGroups[activeGroupPresetIndex]) {
      const currentCap = carouselGroups[activeGroupPresetIndex].caption || '';
      let newCap = '';
      if (type === 'hashtags') newCap = currentCap ? currentCap + ' ' + preset.content : preset.content;
      else if (type === 'assinatura') newCap = currentCap ? currentCap + '\n\n' + preset.content : preset.content;
      else if (type === 'legenda') newCap = preset.content;

      setCarouselGroups(prev => {
        const copy = [...prev];
        if (copy[activeGroupPresetIndex]) {
          copy[activeGroupPresetIndex] = { ...copy[activeGroupPresetIndex], caption: newCap };
        }
        return copy;
      });
    } else {
      let newCap = '';
      if (type === 'hashtags') newCap = fixedCaption ? fixedCaption + ' ' + preset.content : preset.content;
      else if (type === 'assinatura') newCap = fixedCaption ? fixedCaption + '\n\n' + preset.content : preset.content;
      else if (type === 'legenda') newCap = preset.content;
      setFixedCaption(newCap);
      if (previewSchedule.length > 0) {
        const updated = [...previewSchedule];
        updated[0] = { ...updated[0], caption: newCap };
        setPreviewSchedule(updated);
      }
    }
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
    triggerToast?.('Mídia removida do agendamento', 'info');
  };

  const handleDeleteVideoFromModal = (index) => {
    const updated = previewSchedule.filter((_, i) => i !== index);
    setPreviewSchedule(updated);
    triggerToast?.('Mídia removida do agendamento', 'info');

    if (updated.length === 0) {
      setPreviewModalIndex(null);
    } else if (index >= updated.length) {
      // Se for o último item, volta para o anterior
      setPreviewModalIndex(updated.length - 1);
    } else {
      // Pula para a próxima mídia (que assume a posição 'index')
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

        // 2. Upload media files sequentially to VPS
        const cloudPosts = [];
        for (let i = 0; i < previewSchedule.length; i++) {
          const item = previewSchedule[i];
          const isImg = item.post_type === 'image' || item.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(item.video_name || item.video_path);
          const postType = item.post_type || (isImg ? 'image' : 'reel');

          setUploadProgress({
            isUploading: true,
            current: i + 1,
            total: previewSchedule.length,
            currentFilename: item.video_name,
            percent: 0,
            statusText: `Enviando mídia ${i + 1} de ${previewSchedule.length}...`,
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
                statusText: `Enviando ${isImg ? 'imagem' : 'vídeo'} ${i + 1} de ${previewSchedule.length} (${percent}%)...`,
              }));
            }
          );

          cloudPosts.push({
            video_path: uploadRes.video_path,
            caption: item.caption,
            scheduled_time: item.scheduled_time,
            account_username: item.account_username,
            post_type: postType,
          });
        }

        // 3. Submit bulk schedule to VPS
        setUploadProgress(prev => ({
          ...prev,
          statusText: 'Registrando agendamentos na nuvem...',
        }));

        await submitCloudBulkSchedule(cloudConfig.vpsUrl, cloudConfig.apiKey, { posts: cloudPosts });

        setUploadProgress({ isUploading: false, current: 0, total: 0, currentFilename: '', percent: 0, statusText: '' });
        triggerToast(`☁️ 🎉 ${previewSchedule.length} publicações agendadas na nuvem! Elas serão publicadas automaticamente.`, 'success');
        if (onSuccess) onSuccess();
        handleClose();
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
        posts: previewSchedule.map(p => {
          const isImg = p.post_type === 'image' || p.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(p.video_name || p.video_path);
          return {
            video_path: p.video_path,
            caption: p.caption,
            scheduled_time: p.scheduled_time,
            account_username: p.account_username,
            post_type: p.post_type || (isImg ? 'image' : 'reel'),
            carousel_image_paths: p.carousel_images || null,
          };
        }),
      };

      const res = await fetch(`${API}/api/posts/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        triggerToast(`🎉 ${data.count} publicações agendadas com sucesso!`, 'success');
        if (onSuccess) onSuccess();
        handleClose();
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

  // Scan folder for videos and images
  const handleScanFolder = async (path) => {
    if (!path || !path.trim()) return;
    setLoadingFolder(true);
    try {
      const res = await fetch(`${API}/api/videos/scan-folder?path=${encodeURIComponent(path.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        setScannedVideos(items);
        if (items.length === 0) {
          triggerToast('Nenhuma mídia (vídeo ou imagem) encontrada na pasta.', 'info');
        } else {
          const imgs = items.filter(f => f.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(f.name || f.path)).length;
          const vids = items.length - imgs;
          if (vids > 0 && imgs > 0) {
            triggerToast(`${items.length} mídias encontradas (${vids} Reels • ${imgs} Fotos)!`, 'success');
          } else if (imgs > 0) {
            triggerToast(`${imgs} foto(s) de Feed encontrada(s)!`, 'success');
          } else {
            triggerToast(`${vids} vídeo(s) Reels encontrado(s)!`, 'success');
          }
        }
      } else {
        triggerToast('Erro ao ler pasta.', 'error');
      }
    } catch (e) {
      triggerToast('Erro de conexão ao escanear pasta.', 'error');
    }
    setLoadingFolder(false);
  };

  // Select individual files
  const handleSelectFiles = async () => {
    if (isElectron && window.electronAPI?.selectFiles) {
      try {
        let filters = [
          { name: 'Mídias (Vídeos e Fotos)', extensions: ['mp4', 'mov', 'avi', 'jpg', 'jpeg', 'png', 'webp'] },
          { name: 'Vídeos (Reels)', extensions: ['mp4', 'mov', 'avi'] },
          { name: 'Fotos (Feed)', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
        ];
        if (postType === 'reel') {
          filters = [
            { name: 'Vídeos (Reels)', extensions: ['mp4', 'mov', 'avi'] },
            { name: 'Todas as Mídias', extensions: ['mp4', 'mov', 'avi', 'jpg', 'jpeg', 'png', 'webp'] }
          ];
        } else if (postType === 'image' || postType === 'carousel') {
          filters = [
            { name: 'Fotos (Feed)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
            { name: 'Todas as Mídias', extensions: ['mp4', 'mov', 'avi', 'jpg', 'jpeg', 'png', 'webp'] }
          ];
        }

        const paths = await window.electronAPI.selectFiles({
          multiple: true,
          filters
        });
        if (paths && paths.length > 0) {
          const items = paths.map(p => {
            const name = p.replace(/\\/g, '/').split('/').pop();
            const isImg = /\.(jpe?g|png|webp)$/i.test(name);
            return {
              name,
              path: p,
              size: 1024 * 1024,
              media_type: isImg ? 'image' : 'video',
              post_type: isImg ? 'image' : 'reel'
            };
          });
          setScannedVideos(items);
          setFolderPath('');
          triggerToast(`${items.length} arquivo(s) selecionado(s)!`, 'success');
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      document.getElementById('bulk-file-input')?.click();
    }
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const items = files.map(f => {
      const isImg = /\.(jpe?g|png|webp)$/i.test(f.name);
      return {
        name: f.name,
        path: f.path || f.name,
        size: f.size,
        media_type: isImg ? 'image' : 'video',
        post_type: isImg ? 'image' : 'reel',
      };
    });
    setScannedVideos(items);
    setFolderPath('');
    triggerToast(`${items.length} arquivo(s) carregado(s)!`, 'success');
  };

  const handleDropFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    // Se for 1 pasta no Electron
    if (files.length === 1 && files[0].path && !files[0].type && !files[0].name.includes('.')) {
      setFolderPath(files[0].path);
      handleScanFolder(files[0].path);
      return;
    }

    const items = files
      .filter(f => /\.(mp4|mov|avi|jpe?g|png|webp)$/i.test(f.name))
      .map(f => {
        const isImg = /\.(jpe?g|png|webp)$/i.test(f.name);
        return {
          name: f.name,
          path: f.path || f.name,
          size: f.size,
          media_type: isImg ? 'image' : 'video',
          post_type: isImg ? 'image' : 'reel',
        };
      });

    if (items.length === 0) {
      triggerToast('Nenhum arquivo de vídeo ou imagem suportado foi solto.', 'error');
      return;
    }

    setScannedVideos(items);
    setFolderPath('');
    triggerToast(`${items.length} mídia(s) carregada(s)!`, 'success');
  };

  // Carousel multi-group reordering & drag-and-drop helpers
  const handlePhotoDragStart = (e, groupIndex, photoIndex) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ groupIndex, photoIndex }));
    setDraggedPhotoInfo({ groupIndex, photoIndex });
  };

  const handlePhotoDrop = (e, targetGroupIndex, targetPhotoIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupIndex(null);
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const { groupIndex: srcGroup, photoIndex: srcPhoto } = JSON.parse(dataStr);
      if (srcGroup === undefined || srcPhoto === undefined) return;

      setCarouselGroups(prev => {
        const nextGroups = prev.map(g => ({ ...g, images: [...g.images] }));
        const [movedPhoto] = nextGroups[srcGroup].images.splice(srcPhoto, 1);
        if (!movedPhoto) return prev;

        if (srcGroup === targetGroupIndex) {
          nextGroups[targetGroupIndex].images.splice(targetPhotoIndex, 0, movedPhoto);
        } else {
          if (nextGroups[targetGroupIndex].images.length >= 10) {
            triggerToast('O carrossel de destino já atingiu o limite de 10 fotos.', 'error');
            return prev;
          }
          nextGroups[targetGroupIndex].images.splice(targetPhotoIndex, 0, movedPhoto);
        }
        return nextGroups;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setDraggedPhotoInfo(null);
    }
  };

  const handleAddPhotosToGroup = (files, targetGroupIndex) => {
    const validImages = Array.from(files)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f.name))
      .map(f => ({
        name: f.name,
        path: f.path || f.name,
        size: f.size,
        media_type: 'image',
        post_type: 'image',
        fileObj: f
      }));

    if (validImages.length === 0) {
      triggerToast('Selecione arquivos de imagem válidos (JPG, PNG, WEBP).', 'error');
      return;
    }

    setCarouselGroups(prev => {
      const copy = prev.map(g => ({ ...g, images: [...g.images] }));
      if (!copy[targetGroupIndex]) return prev;
      const currentImages = copy[targetGroupIndex].images || [];
      const remainingSlots = 10 - currentImages.length;
      if (remainingSlots <= 0) {
        triggerToast('Este carrossel já atingiu o limite de 10 fotos.', 'error');
        return prev;
      }
      const toAdd = validImages.slice(0, remainingSlots);
      copy[targetGroupIndex].images.push(...toAdd);
      triggerToast(`${toAdd.length} foto(s) adicionada(s) ao Carrossel #${targetGroupIndex + 1}!`, 'success');
      return copy;
    });
  };

  const handleGroupDrop = (e, targetGroupIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupIndex(null);

    // 1. Arquivos arrastados diretamente do sistema operacional
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddPhotosToGroup(e.dataTransfer.files, targetGroupIndex);
      return;
    }

    // 2. Reordenação interna entre carrosséis
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const { groupIndex: srcGroup, photoIndex: srcPhoto } = JSON.parse(dataStr);
      if (srcGroup === undefined || srcPhoto === undefined) return;
      if (srcGroup === targetGroupIndex) return;

      setCarouselGroups(prev => {
        const nextGroups = prev.map(g => ({ ...g, images: [...g.images] }));
        if (nextGroups[targetGroupIndex].images.length >= 10) {
          triggerToast('O carrossel de destino já atingiu o limite de 10 fotos.', 'error');
          return prev;
        }
        const [movedPhoto] = nextGroups[srcGroup].images.splice(srcPhoto, 1);
        if (movedPhoto) {
          nextGroups[targetGroupIndex].images.push(movedPhoto);
        }
        return nextGroups;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setDraggedPhotoInfo(null);
    }
  };

  const removePhotoFromGroup = (groupIndex, photoIndex) => {
    setCarouselGroups(prev => {
      const nextGroups = prev.map(g => ({ ...g, images: [...g.images] }));
      nextGroups[groupIndex].images.splice(photoIndex, 1);
      return nextGroups;
    });
  };

  const removeCarouselGroup = (groupIndex) => {
    setCarouselGroups(prev => prev.filter((_, i) => i !== groupIndex));
  };

  const addCarouselGroup = () => {
    setCarouselGroups(prev => [
      ...prev,
      {
        id: `carousel-group-${Date.now()}-${prev.length}`,
        images: [],
        caption: '',
        scheduled_time: new Date(Date.now() + (15 + prev.length * 60) * 60 * 1000).toISOString().slice(0, 16),
      }
    ]);
  };

  // Mídias filtradas pelo Tipo de Publicação selecionado
  const filteredVideos = scannedVideos.filter(v => {
    const isImg = v.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(v.name || v.path);
    if (postType === 'reel') return !isImg;
    if (postType === 'image' || postType === 'carousel') return isImg;
    return true;
  });

  const totalVids = scannedVideos.filter(v => !(v.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(v.name || v.path))).length;
  const totalImgs = scannedVideos.length - totalVids;

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

  const handleProceedStep1 = () => {
    if (filteredVideos.length === 0) {
      triggerToast('Selecione pelo menos uma mídia para prosseguir.', 'error');
      return;
    }

    // Modo Carrossel
    if (postType === 'carousel') {
      if (filteredVideos.length < 2) {
        triggerToast('Carrossel requer no mínimo 2 fotos.', 'error');
        return;
      }

      const groups = [];
      const perCar = Math.max(2, Math.min(10, Number(photosPerCarousel) || 4));

      for (let i = 0; i < filteredVideos.length; i += perCar) {
        const slice = filteredVideos.slice(i, i + perCar);
        const autoCap = slice[0]?.name ? slice[0].name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ') : '';
        const dt = new Date(Date.now() + (15 + groups.length * 60) * 60 * 1000);
        groups.push({
          id: `carousel-group-${Date.now()}-${groups.length}`,
          images: slice,
          caption: fixedCaption || autoCap,
          scheduled_time: dt.toISOString().slice(0, 16),
        });
      }

      setCarouselGroups(groups);
      setStep(2);
      return;
    }

    // Modo Post Único (1 Reels ou 1 Imagem)
    if (filteredVideos.length === 1) {
      const media = filteredVideos[0];
      const isImg = media.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(media.name || media.path);
      const cleanName = media.name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ');
      const cap = fixedCaption || cleanName;
      if (!fixedCaption) setFixedCaption(cleanName);

      let isoStr = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      if (singlePostTime) {
        try {
          const dt = new Date(singlePostTime);
          if (!isNaN(dt.getTime())) isoStr = dt.toISOString();
        } catch {}
      }

      const dtObj = new Date(isoStr);
      setPreviewSchedule([{
        id: `${media.name}-single`,
        video_path: media.path,
        video_name: media.name,
        media_type: isImg ? 'image' : 'video',
        post_type: isImg ? 'image' : 'reel',
        scheduled_time: isoStr,
        caption: cap,
        account_username: selectedAccount,
        weekday_name: DAYS_MAP.find(dm => dm.id === dtObj.getDay())?.full || '',
      }]);
      setStep(2);
    } else {
      setStep(2);
    }
  };

  // Transição do Step 2 para o Step 3 no Modo Carrossel
  const handleProceedCarouselStep2 = () => {
    const validGroups = carouselGroups.filter(g => g.images && g.images.length > 0);
    if (validGroups.length === 0) {
      triggerToast('Nenhum carrossel com fotos foi configurado.', 'error');
      return;
    }

    const invalid = validGroups.find(g => g.images.length < 2 || g.images.length > 10);
    if (invalid) {
      triggerToast('Cada carrossel deve conter entre 2 e 10 fotos. Ajuste as fotos antes de continuar.', 'error');
      return;
    }

    const items = validGroups.map((g, idx) => {
      let isoStr = new Date(Date.now() + (15 + idx * 60) * 60 * 1000).toISOString();
      if (g.scheduled_time) {
        try {
          const dt = new Date(g.scheduled_time);
          if (!isNaN(dt.getTime())) isoStr = dt.toISOString();
        } catch {}
      }
      const dtObj = new Date(isoStr);
      return {
        id: g.id || `carousel-${Date.now()}-${idx}`,
        video_path: g.images[0].path,
        video_name: `Carrossel #${idx + 1} (${g.images.length} fotos)`,
        media_type: 'carousel',
        post_type: 'carousel',
        carousel_images: g.images.map(img => img.path),
        carousel_urls: g.images.map(img => getVideoSrc(img)),
        scheduled_time: isoStr,
        caption: g.caption || '',
        account_username: selectedAccount,
        weekday_name: DAYS_MAP.find(dm => dm.id === dtObj.getDay())?.full || '',
      };
    });

    setPreviewSchedule(items);
    setSelectedCarouselPreviewTab(0);
    setCarouselPreviewIndex(0);
    setStep(3);
  };

  // AI Humanized Schedule Generator Algorithm (Modo Lote)
  const generateAISchedule = async () => {
    const activeMedia = filteredVideos;
    if (activeMedia.length === 0) {
      triggerToast('Nenhuma mídia selecionada ou correspondente ao filtro.', 'error');
      setStep(1);
      return;
    }

    // ─── MODO LOTE ───
    if (selectedDays.length === 0) {
      triggerToast('Selecione pelo menos um dia da semana.', 'error');
      return;
    }

    const items = [];
    const [startY, startM, startD] = startDate.split('-').map(Number);
    let currentDate = new Date(startY, startM - 1, startD, 9, 0);

    const mediaQueue = [...activeMedia];
    let videoIndex = 0;

    while (videoIndex < mediaQueue.length) {
      const dayOfWeek = currentDate.getDay();

      if (selectedDays.includes(dayOfWeek)) {
        for (let s = 0; s < postsPerDay && videoIndex < mediaQueue.length; s++) {
          const video = mediaQueue[videoIndex];
          const isImg = video.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(video.name || video.path);
          const postType = video.post_type || (isImg ? 'image' : 'reel');
          const mediaType = isImg ? 'image' : 'video';

          const basePeak = BASE_PEAK_HOURS[s % BASE_PEAK_HOURS.length];

          let targetHour = basePeak.hour;
          let targetMin = basePeak.min;

          if (humanizeJitter) {
            const jitterMinutes = Math.floor(Math.random() * 47) - 22;
            let totalMins = targetHour * 60 + targetMin + jitterMinutes;
            totalMins = Math.max(8 * 60, Math.min(23 * 60, totalMins));
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
            media_type: mediaType,
            post_type: postType,
            carousel_images: video.carousel_images || null,
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

  const isWideModal = (step === 2 && postType === 'carousel') || (step === 2 && filteredVideos.length === 1) || (step === 3 && postType === 'carousel');
  const stepsList = (filteredVideos.length === 1 && postType !== 'carousel')
    ? [
        { num: 1, label: 'Formato' },
        { num: 2, label: 'Agendar' },
      ]
    : [
        { num: 1, label: 'Formato' },
        { num: 2, label: 'Conteúdo' },
        { num: 3, label: 'Agendar' },
      ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className={`bg-white rounded-3xl border border-[#E8E8ED] shadow-[0_24px_60px_rgba(0,0,0,0.22)] w-full ${isWideModal ? 'max-w-4xl max-h-[92vh]' : 'max-w-2xl max-h-[90vh]'} overflow-hidden flex flex-col transition-all duration-200`}>
        
        {/* Wizard Step Indicator & Close Button */}
        <div className="relative px-6 py-5 bg-[#FAFAFC] border-b border-[#E8E8ED] flex items-center justify-center select-none">
          {/* Centralized Stepper Pills */}
          <div className="flex items-center">
            {stepsList.map((s, idx) => {
              const isCompleted = step > s.num;
              const isCurrent = step === s.num;

              return (
                <React.Fragment key={s.num}>
                  <div
                    className={`px-4 py-1.5 rounded-full flex items-center gap-2 transition-all duration-200 ${
                      isCurrent
                        ? 'bg-[#0071E3] text-white shadow-xs ring-4 ring-[#0071E3]/20'
                        : isCompleted
                        ? 'bg-[#0071E3]/10 text-[#0071E3]'
                        : 'bg-[#F5F5F7] text-[#86868B]'
                    }`}
                  >
                    <span className={`text-xs ${isCurrent ? 'font-extrabold text-white' : isCompleted ? 'font-extrabold text-[#0071E3]' : 'font-bold text-[#86868B]'}`}>
                      {isCompleted ? '✓' : s.num}
                    </span>
                    <span
                      className={`text-xs ${
                        isCurrent
                          ? 'font-bold text-white tracking-tight'
                          : isCompleted
                          ? 'font-bold text-[#0071E3]'
                          : 'font-semibold text-[#52525B]'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>

                  {idx < stepsList.length - 1 && (
                    <div className="w-5 sm:w-6 h-[1.5px] bg-[#E8E8ED] mx-2 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Absolute Positioned Close Button on Right */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] hover:scale-105 active:scale-95 flex items-center justify-center text-[#1D1D1F] transition-all cursor-pointer shrink-0"
            title="Fechar modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-6">

          {/* STEP 1: Tipo de Publicação, Perfil & Origem */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              {/* 1. Format cards: Tipo de Publicação */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">
                  Tipo de Publicação
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Reels */}
                  <button
                    type="button"
                    onClick={() => {
                      setPostType('reel');
                      setScannedVideos([]);
                    }}
                    className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col gap-2.5 group cursor-pointer ${
                      postType === 'reel'
                        ? 'bg-white border-[#0071E3] shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
                        : 'bg-white border-[#E8E8ED] hover:border-[#0071E3]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      postType === 'reel' ? 'bg-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.3)]' : 'bg-[#F5F5F7] group-hover:bg-[#0071E3]/10'
                    }`}>
                      <span className={`material-symbols-outlined text-[18px] ${postType === 'reel' ? 'text-white' : 'text-[#86868B]'}`}>smart_display</span>
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${postType === 'reel' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>Reels</div>
                      <div className="text-[10px] text-[#86868B] mt-0.5 leading-tight">Vídeos verticais curtos</div>
                    </div>
                    {postType === 'reel' && (
                      <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-[#0071E3] flex items-center justify-center shadow-xs">
                        <span className="material-symbols-outlined text-white text-[11px]">check</span>
                      </div>
                    )}
                  </button>

                  {/* Imagem Única */}
                  <button
                    type="button"
                    onClick={() => {
                      setPostType('image');
                      setScannedVideos([]);
                    }}
                    className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col gap-2.5 group cursor-pointer ${
                      postType === 'image'
                        ? 'bg-white border-[#0071E3] shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
                        : 'bg-white border-[#E8E8ED] hover:border-[#0071E3]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      postType === 'image' ? 'bg-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.3)]' : 'bg-[#F5F5F7] group-hover:bg-[#0071E3]/10'
                    }`}>
                      <span className={`material-symbols-outlined text-[18px] ${postType === 'image' ? 'text-white' : 'text-[#86868B]'}`}>image</span>
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${postType === 'image' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>Imagem Única</div>
                      <div className="text-[10px] text-[#86868B] mt-0.5 leading-tight">1 foto para o Feed</div>
                    </div>
                    {postType === 'image' && (
                      <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-[#0071E3] flex items-center justify-center shadow-xs">
                        <span className="material-symbols-outlined text-white text-[11px]">check</span>
                      </div>
                    )}
                  </button>

                  {/* Carrossel */}
                  <button
                    type="button"
                    onClick={() => {
                      setPostType('carousel');
                      setScannedVideos([]);
                    }}
                    className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col gap-2.5 group cursor-pointer ${
                      postType === 'carousel'
                        ? 'bg-white border-[#0071E3] shadow-[0_8px_32px_rgba(0,113,227,0.12)]'
                        : 'bg-white border-[#E8E8ED] hover:border-[#0071E3]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      postType === 'carousel' ? 'bg-[#0071E3] shadow-[0_4px_12px_rgba(0,113,227,0.3)]' : 'bg-[#F5F5F7] group-hover:bg-[#0071E3]/10'
                    }`}>
                      <span className={`material-symbols-outlined text-[18px] ${postType === 'carousel' ? 'text-white' : 'text-[#86868B]'}`}>photo_library</span>
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${postType === 'carousel' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>Carrossel</div>
                      <div className="text-[10px] text-[#86868B] mt-0.5 leading-tight">2 a 10 fotos no Feed</div>
                    </div>
                    {postType === 'carousel' && (
                      <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-[#0071E3] flex items-center justify-center shadow-xs">
                        <span className="material-symbols-outlined text-white text-[11px]">check</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Seletor: Fotos por Carrossel (Exibido apenas no Modo Carrossel) */}
              {postType === 'carousel' && (
                <div className="p-4 bg-[#F5F5F7] rounded-2xl border border-[#E8E8ED] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#1D1D1F] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#0071E3]">view_carousel</span>
                      Fotos por Carrossel
                    </span>
                    <span className="text-[11px] text-[#86868B]">
                      Selecione a quantidade de fotos que irá compor cada carrossel (2 a 10 fotos).
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center bg-white border border-[#E8E8ED] rounded-xl p-1 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setPhotosPerCarousel(prev => Math.max(2, prev - 1))}
                        className="w-7 h-7 rounded-lg hover:bg-[#F5F5F7] text-[#1D1D1F] flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-extrabold text-[#0071E3]">
                        {photosPerCarousel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhotosPerCarousel(prev => Math.min(10, prev + 1))}
                        className="w-7 h-7 rounded-lg hover:bg-[#F5F5F7] text-[#1D1D1F] flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
                      >
                        +
                      </button>
                    </div>

                    {filteredVideos.length > 0 && (
                      <div className="px-3 py-1.5 rounded-xl bg-[#0071E3]/10 border border-[#0071E3]/20 text-[11px] font-bold text-[#0071E3]">
                        {Math.ceil(filteredVideos.length / photosPerCarousel)} carrossel(is) estimado(s)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Account Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Perfil de Destino</label>
                <CustomSelect
                  value={selectedAccount}
                  onChange={setSelectedAccount}
                  options={accounts.map(acc => {
                    const isRevoked = Boolean(acc.revoked);
                    const name = acc.display_name || acc.username;
                    let label = `@${name}`;
                    if (isRevoked) label = `@${name} (⚠️ Desautorizada na Meta)`;
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
                  if (currentAcc.revoked) {
                    return (
                      <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        Esta conta foi desautorizada na Meta. Por favor, reconecte na aba Perfis.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 3. Folder / Files Selector & Dropzone */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">
                    {postType === 'reel' ? 'Arquivo de Vídeo (Reels)' : postType === 'carousel' ? 'Arquivos de Fotos (Múltiplas Fotos)' : 'Arquivo de Foto (Feed)'}
                  </label>
                  {scannedVideos.length > 0 && (
                    <span className="text-[11px] font-bold text-[#0071E3]">
                      ✓ {filteredVideos.length} {filteredVideos.length === 1 ? 'mídia selecionada' : 'mídias selecionadas'}
                    </span>
                  )}
                </div>
                
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDropFiles}
                  className={`p-6 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-3 text-center ${
                    isDragging
                      ? 'border-[#0071E3] bg-[#0071E3]/15 scale-[1.01]'
                      : 'border-[#0071E3]/30 hover:border-[#0071E3] bg-[#0071E3]/5 hover:bg-[#0071E3]/10'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white text-[#0071E3] flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[24px]">
                      {postType === 'reel' ? 'smart_display' : postType === 'carousel' ? 'photo_library' : 'image'}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1 max-w-md">
                    <p className="text-xs font-bold text-[#1D1D1F]">
                      {folderPath
                        ? 'Pasta de Origem Conectada'
                        : filteredVideos.length > 0
                        ? `${filteredVideos.length} ${filteredVideos.length === 1 ? 'mídia carregada' : 'mídias carregadas'}`
                        : postType === 'reel'
                        ? 'Arraste um vídeo Reels (.mp4, .mov) ou pasta de vídeos'
                        : postType === 'carousel'
                        ? 'Arraste as fotos (.jpg, .png, .webp) para gerar os carrosséis'
                        : 'Arraste uma foto (.jpg, .png, .webp) ou pasta de fotos'}
                    </p>
                    <p className="text-[11px] text-[#86868B] font-mono truncate max-w-full px-2">
                      {folderPath
                        ? folderPath
                        : filteredVideos.length > 0
                        ? filteredVideos.map(f => f.name).join(', ')
                        : postType === 'reel'
                        ? 'Formato vertical 9:16 recomendado'
                        : postType === 'carousel'
                        ? `Fotos serão agrupadas em lotes de ${photosPerCarousel}`
                        : 'Proporção 1:1 ou 4:5 recomendada'}
                    </p>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (isElectron && window.electronAPI?.selectDirectory) {
                          const path = await window.electronAPI.selectDirectory();
                          if (path) {
                            setFolderPath(path);
                            handleScanFolder(path);
                          }
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 text-xs font-bold text-[#1D1D1F] hover:text-[#0071E3] flex items-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#0071E3]">folder_open</span>
                      {folderPath ? 'Trocar pasta' : 'Selecionar Pasta'}
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectFiles}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-[#E8E8ED] hover:border-[#0071E3]/40 text-xs font-bold text-[#1D1D1F] hover:text-[#0071E3] flex items-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#0071E3]">add_photo_alternate</span>
                      {postType === 'carousel' ? 'Escolher Fotos' : 'Escolher Arquivo(s)'}
                    </button>
                  </div>

                  {!isElectron && (
                    <div className="flex w-full max-w-md gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Caminho da pasta (ex: C:\Midias\Instagram)"
                        value={folderPath}
                        onChange={e => {
                          setFolderPath(e.target.value);
                          handleScanFolder(e.target.value);
                        }}
                        className="flex-1 p-2 bg-white border border-[#E8E8ED] rounded-xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] shadow-xs font-medium"
                      />
                    </div>
                  )}

                  <input
                    id="bulk-file-input"
                    type="file"
                    accept={postType === 'reel' ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"}
                    multiple={postType === 'carousel' || postType === 'reel'}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}          {/* STEP 2: Regras & Legenda ou Montagem dos Carrosséis ou Prévia do Post Único */}
          {step === 2 && (
            (filteredVideos.length === 1 && postType !== 'carousel') ? (() => {
              const singleItem = previewSchedule[0] || filteredVideos[0];
              const isImg = postType === 'image' || singleItem?.media_type === 'image' || singleItem?.post_type === 'image' || /\.(jpe?g|png|webp)$/i.test(singleItem?.name || singleItem?.video_name || singleItem?.path || singleItem?.video_path || '');
              const matchedAcc = accounts.find(a => a.username === selectedAccount);
              const avatarSrc = matchedAcc?.avatar_url ? (matchedAcc.avatar_url.startsWith('http') ? matchedAcc.avatar_url : `${API}${matchedAcc.avatar_url}`) : null;

              return (
                <div className="flex flex-col md:flex-row gap-5 items-start">
                  {/* LEFT: Media Player / Image Viewer */}
                  <div className="w-full md:w-[44%] bg-[#F2F2F7] rounded-2xl flex flex-col items-center justify-center p-3 relative border border-[#E8E8ED] select-none overflow-hidden min-h-[380px]">
                    {isImg ? (
                      /* Instagram Feed Mockup Card (Imagem Única) */
                      <div className="w-full max-w-[340px] bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.06)] border border-[#E8E8ED] overflow-hidden flex flex-col mx-auto select-none transition-all">
                        {/* Card Header */}
                        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-black/[0.04]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px] shrink-0">
                              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                                {avatarSrc ? (
                                  <img src={avatarSrc} alt={selectedAccount} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-tr from-[#0071E3] to-[#4da3ff] flex items-center justify-center text-white text-[10px] font-bold">
                                    {selectedAccount ? selectedAccount.charAt(0).toUpperCase() : 'A'}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[12px] font-semibold text-[#1D1D1F] leading-tight">
                                {selectedAccount || "usuario_ig"}
                              </span>
                              <span className="text-[10px] text-[#86868B] font-medium leading-none mt-0.5">
                                Feed de Fotos
                              </span>
                            </div>
                          </div>
                          <div className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[#86868B] text-[10px] font-semibold flex items-center gap-1 border border-[#E8E8ED]">
                            <span className="material-symbols-outlined text-[13px] text-amber-500">
                              {imgAspect === '4/5' ? 'stay_current_portrait' : 'crop_square'}
                            </span>
                            {imgAspect === '4/5' ? '4:5 Retrato' : '1:1 Quadrado'}
                          </div>
                        </div>

                        {/* Card Image */}
                        <div className={`w-full bg-[#EFEFEF] relative overflow-hidden flex items-center justify-center transition-all duration-300 ${
                          imgAspect === '4/5' ? 'aspect-[4/5] max-h-[440px]' : 'aspect-square max-h-[380px]'
                        }`}>
                          <img
                            src={getVideoSrc(singleItem)}
                            alt={singleItem.name || 'image_post'}
                            onLoad={handleImageLoad}
                            className="w-full h-full object-cover select-none animate-fadeIn"
                          />
                        </div>

                        {/* Card Action Icons */}
                        <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-3.5">
                            <button
                              type="button"
                              onClick={() => setIsLiked(!isLiked)}
                              className="flex items-center justify-center transition-transform active:scale-80 cursor-pointer"
                              title={isLiked ? "Descurtir" : "Curtir"}
                            >
                              <span className={`material-symbols-outlined text-[23px] transition-colors ${isLiked ? 'text-rose-500 fill-1' : 'text-[#1D1D1F]'}`}>
                                {isLiked ? 'favorite' : 'favorite_border'}
                              </span>
                            </button>
                            <button type="button" className="flex items-center justify-center text-[#1D1D1F] hover:text-[#0071E3] transition-colors cursor-pointer">
                              <span className="material-symbols-outlined text-[22px]">chat_bubble_outline</span>
                            </button>
                            <button type="button" className="flex items-center justify-center text-[#1D1D1F] hover:text-[#0071E3] transition-colors cursor-pointer">
                              <span className="material-symbols-outlined text-[22px]">send</span>
                            </button>
                          </div>
                          <button type="button" className="flex items-center justify-center text-[#1D1D1F] hover:text-[#0071E3] transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-[22px]">bookmark_border</span>
                          </button>
                        </div>

                        {/* Card Caption Snippet */}
                        <div className="px-3.5 pb-3 flex flex-col gap-1 text-left">
                          <div className="text-[11px] leading-[16px] text-[#1D1D1F] break-words line-clamp-3">
                            <span className="font-semibold mr-1.5">{selectedAccount || "usuario_ig"}</span>
                            <CaptionText text={fixedCaption || singleItem.caption || singleItem.name} hashtagClass="text-[#00376B] font-semibold" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Reels Video Player */
                      <div
                        className="relative w-full h-full max-h-[480px] aspect-[9/16] rounded-xl bg-black shadow-lg overflow-hidden flex flex-col group/video border border-black/10 mx-auto"
                        onMouseEnter={() => setShowControls(true)}
                        onMouseLeave={() => setShowControls(false)}
                      >
                        <div
                          className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer overflow-hidden"
                          onClick={toggleSinglePlay}
                        >
                          <video
                            ref={singleVideoRef}
                            src={getVideoSrc(singleItem)}
                            autoPlay
                            loop
                            muted={isMuted}
                            playsInline
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onTimeUpdate={() => singleVideoRef.current && setCurrentTime(singleVideoRef.current.currentTime)}
                            onLoadedMetadata={() => singleVideoRef.current && setDuration(singleVideoRef.current.duration || 0)}
                            className="w-full h-full object-cover"
                          />

                          {!isPlaying && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-30 transition-all">
                              <div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-xl scale-100 hover:scale-105 active:scale-95 transition-transform">
                                <span className="material-symbols-outlined text-[32px] text-white ml-0.5">play_arrow</span>
                              </div>
                            </div>
                          )}

                          <div
                            className={`absolute bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 flex flex-col gap-1.5 ${
                              showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="range"
                              min="0"
                              max={duration || 100}
                              step="0.05"
                              value={currentTime}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (singleVideoRef.current) singleVideoRef.current.currentTime = val;
                                setCurrentTime(val);
                              }}
                              className="w-full h-1 bg-white/30 hover:bg-white/50 rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                            />
                            <div className="flex items-center justify-between text-white text-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={toggleSinglePlay}
                                  className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    {isPlaying ? 'pause' : 'play_arrow'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={toggleSingleMute}
                                  className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px]">
                                    {isMuted ? 'volume_off' : 'volume_up'}
                                  </span>
                                </button>
                              </div>
                              <span className="text-[10px] font-mono font-bold text-white/90">
                                {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Post Metadata & Caption Editor */}
                  <div className="w-full md:w-[56%] flex flex-col gap-3.5 text-left">
                    {/* Header Info */}
                    <div className="flex items-center justify-between pb-2 border-b border-[#E8E8ED]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
                          isImg ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/20'
                        }`}>
                          <span className="material-symbols-outlined text-[18px]">
                            {isImg ? 'image' : 'smart_display'}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-[9px] font-extrabold uppercase tracking-wider ${isImg ? 'text-amber-600' : 'text-[#0071E3]'}`}>
                            Prévia do Post ({isImg ? 'Feed' : 'Reels'})
                          </span>
                          <h4 className="text-xs font-bold text-[#1D1D1F] truncate max-w-[260px]" title={singleItem.name || singleItem.video_name}>
                            {singleItem.name || singleItem.video_name}
                          </h4>
                        </div>
                      </div>
                    </div>

                    {/* Target Account Card */}
                    <div className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-2xl p-3 flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shrink-0">
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                          {avatarSrc ? (
                            <img src={avatarSrc} alt={selectedAccount} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[#1D1D1F] text-[10px] font-extrabold">
                              {(selectedAccount || 'U')[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Conta Alvo</span>
                        <span className="text-xs font-bold text-[#1D1D1F] truncate">@{selectedAccount || 'perfil'}</span>
                        <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {isImg ? 'Instagram Feed' : 'Instagram Reel'}
                        </span>
                      </div>
                    </div>

                    {/* Data e Horário (Direct Picker) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#1D1D1F]">Data e Horário</label>
                      <CustomDateTimePicker
                        value={singlePostTime}
                        onChange={(val) => {
                          setSinglePostTime(val);
                          if (previewSchedule.length > 0) {
                            const updated = [...previewSchedule];
                            updated[0] = { ...updated[0], scheduled_time: new Date(val).toISOString() };
                            setPreviewSchedule(updated);
                          }
                        }}
                      />
                    </div>

                    {/* Caption Textarea & Presets */}
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1D1D1F] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-[#0071E3]">description</span>
                          Legenda do Post
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const clean = (singleItem.name || singleItem.video_name || '')?.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ') || '';
                            setFixedCaption(clean);
                            if (previewSchedule.length > 0) {
                              const updated = [...previewSchedule];
                              updated[0] = { ...updated[0], caption: clean };
                              setPreviewSchedule(updated);
                            }
                          }}
                          className="text-[10px] text-[#0071E3] font-bold hover:underline cursor-pointer"
                        >
                          Usar nome do arquivo
                        </button>
                      </div>

                      <textarea
                        rows={4}
                        placeholder="Digite a legenda desta publicação..."
                        value={fixedCaption}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFixedCaption(val);
                          if (previewSchedule.length > 0) {
                            const updated = [...previewSchedule];
                            updated[0] = { ...updated[0], caption: val };
                            setPreviewSchedule(updated);
                          }
                        }}
                        className="p-3 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-2xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-y min-h-[95px] leading-relaxed placeholder:text-[#86868B] font-medium shadow-xs"
                      />

                      {/* Presets Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                          {[
                            { type: 'hashtags', label: 'Hashtags', icon: null, iconText: '#' },
                            { type: 'assinatura', label: 'Assinatura', icon: 'edit_note', iconText: null },
                            { type: 'legenda', label: 'Legenda', icon: 'description', iconText: null },
                          ].map(preset => (
                            <div key={preset.type} className="relative">
                              <button
                                type="button"
                                onClick={(e) => handleOpenPresetDropdown(preset.type, e)}
                                className={`preset-trigger-btn px-2.5 py-1 rounded-xl flex items-center gap-1 transition-all duration-200 border cursor-pointer text-[11px] ${
                                  presetType === preset.type && presetsDropdownOpen 
                                    ? 'bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/35 shadow-xs' 
                                    : 'bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] border-[#E8E8ED]'
                                }`}
                              >
                                {preset.iconText && <span className="text-[#0071E3] font-bold text-xs">{preset.iconText}</span>}
                                {preset.icon && <span className="material-symbols-outlined text-[13px]">{preset.icon}</span>}
                                <span>{preset.label}</span>
                                <span className="material-symbols-outlined text-[11px] ml-0.5 opacity-70">expand_more</span>
                              </button>
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="px-2 py-0.5 rounded-full bg-[#F5F5F7] border border-[#E8E8ED] text-[#86868B] font-medium">
                            {fixedCaption.length} caracteres
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] font-bold">
                            {(fixedCaption.match(/#[a-zA-Z0-9_À-ÿ]+/g) || []).length} hashtags
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : postType === 'carousel' ? (
              /* Modo Carrossel: Multi-Grids Reordenáveis e Legendas */
              <div className="flex flex-col gap-5">
                {/* Header informativo */}
                <div className="flex items-center justify-between p-3.5 bg-[#F5F5F7] rounded-2xl border border-[#E8E8ED]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">photo_library</span>
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[#1D1D1F]">
                        {carouselGroups.length} {carouselGroups.length === 1 ? 'Carrossel Configurado' : 'Carrosséis Configurados'}
                      </span>
                      <span className="text-[10px] text-[#86868B]">
                        Total de {carouselGroups.reduce((acc, g) => acc + g.images.length, 0)} fotos distribuídas
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addCarouselGroup}
                    className="px-3 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#005cbb] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-98"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Novo Carrossel
                  </button>
                </div>

                {/* Lista de Grupos de Carrosséis */}
                <div className="flex flex-col gap-5">
                  {carouselGroups.map((group, gIdx) => (
                    <div
                      key={group.id || gIdx}
                      className="p-4 sm:p-5 bg-white rounded-3xl border border-[#E8E8ED] shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col gap-4 transition-all"
                    >
                      {/* Cabeçalho do Card de Carrossel */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F5F5F7]">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-xl bg-[#0071E3]/10 text-[#0071E3] text-xs font-extrabold">
                            Carrossel #{gIdx + 1}
                          </span>
                          <span className="text-xs font-bold text-[#86868B] uppercase tracking-wider">
                            MÍDIAS ({group.images.length}/10)
                          </span>
                          {group.images.length < 2 && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                              Mínimo 2 fotos
                            </span>
                          )}

                          {/* Seletor de Data e Horário ao lado da contagem de mídias */}
                          <div className="w-56 sm:w-64">
                            <CustomDateTimePicker
                              value={group.scheduled_time}
                              onChange={(val) => {
                                setCarouselGroups(prev => {
                                  const copy = [...prev];
                                  copy[gIdx] = { ...copy[gIdx], scheduled_time: val };
                                  return copy;
                                });
                              }}
                            />
                          </div>
                        </div>

                        {carouselGroups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCarouselGroup(gIdx)}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                            Remover Carrossel
                          </button>
                        )}
                      </div>

                      {/* Grid de Fotos Reordenável (com clique para expandir lightbox) */}
                      <div className="flex flex-col gap-1.5">
                        <div
                          onDragOver={(e) => { e.preventDefault(); setDragOverGroupIndex(gIdx); }}
                          onDragLeave={() => setDragOverGroupIndex(null)}
                          onDrop={(e) => handleGroupDrop(e, gIdx)}
                          className={`flex items-center gap-3 overflow-x-auto p-3.5 rounded-2xl border transition-all min-h-[140px] custom-scrollbar ${
                            dragOverGroupIndex === gIdx
                              ? 'border-[#0071E3] bg-[#0071E3]/10 scale-[1.005]'
                              : 'border-[#E8E8ED] bg-[#F5F5F7]/80'
                          }`}
                        >
                          {group.images.map((img, imgIdx) => (
                            <div
                              key={`${img.name}-${imgIdx}`}
                              draggable
                              onDragStart={(e) => handlePhotoDragStart(e, gIdx, imgIdx)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => handlePhotoDrop(e, gIdx, imgIdx)}
                              onClick={() => setLightboxImage({
                                url: getVideoSrc(img),
                                name: img.name,
                                index: imgIdx + 1,
                                total: group.images.length
                              })}
                              className={`relative w-28 h-28 rounded-2xl overflow-hidden shadow-xs shrink-0 cursor-pointer border-2 select-none group transition-all duration-150 ${
                                draggedPhotoInfo?.groupIndex === gIdx && draggedPhotoInfo?.photoIndex === imgIdx
                                  ? 'opacity-30 border-[#0071E3] scale-95'
                                  : 'border-white hover:border-[#0071E3] hover:shadow-md'
                              }`}
                              title="Clique para expandir a imagem • Arraste para reordenar"
                            >
                              {/* Top-left Order Badge */}
                              <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/75 backdrop-blur-xs text-white text-[11px] font-black flex items-center justify-center shadow-md select-none pointer-events-none z-10">
                                {imgIdx + 1}
                              </div>

                              {/* Top-right Close/Remove Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePhotoFromGroup(gIdx, imgIdx);
                                }}
                                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition-colors shadow-md cursor-pointer z-10"
                                title="Remover foto"
                              >
                                <span className="material-symbols-outlined text-[13px] font-bold">close</span>
                              </button>

                              {/* Zoom Hover Icon Indicator */}
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-5 pointer-events-none">
                                <span className="material-symbols-outlined text-white text-[24px] drop-shadow-md">zoom_in</span>
                              </div>

                              {/* Photo Thumbnail */}
                              <img
                                src={getVideoSrc(img)}
                                alt={img.name || 'slide'}
                                className="w-full h-full object-cover select-none pointer-events-none"
                              />
                            </div>
                          ))}

                          {/* Drop Target / Add Photo Placeholder */}
                          {group.images.length < 10 && (
                            <label
                              onDragOver={(e) => { e.preventDefault(); setDragOverGroupIndex(gIdx); }}
                              onDragLeave={() => setDragOverGroupIndex(null)}
                              onDrop={(e) => handleGroupDrop(e, gIdx)}
                              className="w-28 h-28 rounded-2xl border-2 border-dashed border-[#0071E3]/40 hover:border-[#0071E3] bg-white hover:bg-[#0071E3]/5 flex flex-col items-center justify-center text-[#0071E3] p-2 text-center shrink-0 transition-all select-none cursor-pointer group shadow-2xs hover:shadow-xs"
                              title="Clique para carregar imagens ou arraste fotos aqui"
                            >
                              <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handleAddPhotosToGroup(e.target.files, gIdx);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              <div className="w-8 h-8 rounded-full bg-[#0071E3]/10 group-hover:bg-[#0071E3]/20 flex items-center justify-center mb-1 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                              </div>
                              <span className="text-[10px] font-bold leading-tight">Solte ou clique</span>
                              <span className="text-[9px] text-[#86868B] group-hover:text-[#0071E3] leading-tight mt-0.5">para carregar</span>
                            </label>
                          )}
                        </div>

                        <p className="text-[11px] text-[#86868B] flex items-center gap-1 pl-1">
                          <span>💡</span> Arraste os cards para reordenar a sequência ou mover entre carrosséis. Clique em uma foto para ampliar.
                        </p>
                      </div>

                      {/* Legenda & Presets (Largura total para maior conforto e espaço para texto) */}
                      <div className="flex flex-col gap-1.5 pt-1 w-full">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#1D1D1F] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-[#0071E3]">description</span>
                            Legenda do Carrossel #{gIdx + 1}
                          </label>
                          {group.images[0] && (
                            <button
                              type="button"
                              onClick={() => {
                                const clean = group.images[0].name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ');
                                setCarouselGroups(prev => {
                                  const copy = [...prev];
                                  copy[gIdx] = { ...copy[gIdx], caption: clean };
                                  return copy;
                                });
                              }}
                              className="text-[10px] text-[#0071E3] font-bold hover:underline cursor-pointer"
                            >
                              Usar nome da 1ª foto
                            </button>
                          )}
                        </div>

                        <textarea
                          rows={4}
                          placeholder="Digite a legenda deste carrossel..."
                          value={group.caption || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCarouselGroups(prev => {
                              const copy = [...prev];
                              copy[gIdx] = { ...copy[gIdx], caption: val };
                              return copy;
                            });
                          }}
                          className="w-full p-3.5 bg-white border border-[#E8E8ED] hover:border-[#86868B]/40 rounded-2xl text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-y min-h-[95px] leading-relaxed placeholder:text-[#86868B] font-medium shadow-xs"
                        />

                        {/* Presets Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                            {[
                              { type: 'hashtags', label: 'Hashtags', icon: null, iconText: '#' },
                              { type: 'assinatura', label: 'Assinatura', icon: 'edit_note', iconText: null },
                              { type: 'legenda', label: 'Legenda', icon: 'description', iconText: null },
                            ].map(preset => (
                              <div key={preset.type} className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenPresetDropdown(preset.type, e, gIdx)}
                                  className={`preset-trigger-btn px-2.5 py-1 rounded-xl flex items-center gap-1 transition-all duration-200 border cursor-pointer text-[11px] ${
                                    presetType === preset.type && presetsDropdownOpen && activeGroupPresetIndex === gIdx
                                      ? 'bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/35 shadow-xs' 
                                      : 'bg-white hover:bg-[#F5F5F7] text-[#1D1D1F] border-[#E8E8ED]'
                                  }`}
                                >
                                  {preset.iconText && <span className="text-[#0071E3] font-bold text-xs">{preset.iconText}</span>}
                                  {preset.icon && <span className="material-symbols-outlined text-[13px]">{preset.icon}</span>}
                                  <span>{preset.label}</span>
                                  <span className="material-symbols-outlined text-[11px] ml-0.5 opacity-70">expand_more</span>
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-[#F5F5F7] border border-[#E8E8ED] text-[#86868B] font-medium">
                              {(group.caption || '').length} caracteres
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] font-bold">
                              {((group.caption || '').match(/#[a-zA-Z0-9_À-ÿ]+/g) || []).length} hashtags
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Modo Lote de Vídeos (Reels) */
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCaptionMode('filename')}
                      className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        captionMode === 'filename'
                          ? 'border-[#0071E3] bg-[#0071E3]/5 text-[#1D1D1F] ring-1 ring-[#0071E3] shadow-xs'
                          : 'border-[#E8E8ED] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] hover:border-[#86868B]/30'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        captionMode === 'filename' ? 'bg-[#0071E3] text-white' : 'bg-[#F5F5F7] text-[#86868B]'
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">description</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-bold ${captionMode === 'filename' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                          Nome do Arquivo
                        </span>
                        <span className="text-[11px] text-[#86868B] mt-0.5 leading-tight">
                          Usa o título limpo do vídeo como legenda
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCaptionMode('fixed')}
                      className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        captionMode === 'fixed'
                          ? 'border-[#0071E3] bg-[#0071E3]/5 text-[#1D1D1F] ring-1 ring-[#0071E3] shadow-xs'
                          : 'border-[#E8E8ED] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] hover:border-[#86868B]/30'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        captionMode === 'fixed' ? 'bg-[#0071E3] text-white' : 'bg-[#F5F5F7] text-[#86868B]'
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">edit_note</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-bold ${captionMode === 'fixed' ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                          Legenda Fixa
                        </span>
                        <span className="text-[11px] text-[#86868B] mt-0.5 leading-tight">
                          Define um texto e presets padrão para o lote
                        </span>
                      </div>
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
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* Presets Portal Dropdown (Compartilhado para Post Único, Carrossel e Lote) */}
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
                  className="w-5 h-5 rounded-full hover:bg-[#F5F5F7] text-[#86868B] flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto px-1.5 py-1 flex flex-col gap-1 custom-scrollbar">
                {(!savedPresets[presetType] || savedPresets[presetType].length === 0) ? (
                  <span className="text-[11px] text-[#86868B] text-center py-3 italic">
                    Nenhum preset salvo
                  </span>
                ) : (
                  savedPresets[presetType].map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between group/preset p-1.5 rounded-xl hover:bg-[#F5F5F7] transition-colors">
                      <button
                        type="button"
                        onClick={() => handleLoadPreset(presetType, p)}
                        className="flex-1 text-left text-xs font-semibold text-[#1D1D1F] hover:text-[#0071E3] truncate cursor-pointer"
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
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">Conteúdo</span>
                      <textarea 
                        rows={2} 
                        value={newPresetContent} 
                        onChange={e => setNewPresetContent(e.target.value)} 
                        placeholder="Texto do preset..." 
                        className="px-2.5 py-1.5 bg-[#F5F5F7] border border-transparent rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0071E3] focus:bg-white resize-none transition-all" 
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <button 
                        type="button" 
                        onClick={() => setShowSavePresetInput(false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#86868B] hover:bg-[#F5F5F7] cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleSavePreset(presetType)}
                        className="px-3 py-1 bg-[#0071E3] text-white rounded-lg text-[11px] font-bold shadow-xs hover:bg-[#005cbb] cursor-pointer"
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
                      if (activeGroupPresetIndex !== null && carouselGroups[activeGroupPresetIndex] && presetType === 'legenda') {
                        setNewPresetContent(carouselGroups[activeGroupPresetIndex].caption || '');
                      } else if (fixedCaption && presetType === 'legenda') {
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

          {/* STEP 3: Pré-visualização & Confirmação */}
          {step === 3 && (() => {
            if (postType === 'carousel') {
              const activeCarousel = previewSchedule[selectedCarouselPreviewTab] || previewSchedule[0];
              const matchedAcc = accounts.find(a => a.username === selectedAccount);
              const avatarSrc = matchedAcc?.avatar_url ? (matchedAcc.avatar_url.startsWith('http') ? matchedAcc.avatar_url : `${API}${matchedAcc.avatar_url}`) : null;

              return (
                <div className="flex flex-col gap-5">
                  {/* Seletor de Carrosséis se houver múltiplos */}
                  {previewSchedule.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {previewSchedule.map((item, idx) => (
                        <button
                          key={item.id || idx}
                          type="button"
                          onClick={() => {
                            setSelectedCarouselPreviewTab(idx);
                            setCarouselPreviewIndex(0);
                          }}
                          className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                            selectedCarouselPreviewTab === idx
                              ? 'bg-[#0071E3] text-white shadow-sm'
                              : 'bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED] hover:text-[#1D1D1F]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">photo_library</span>
                          Carrossel #{idx + 1} ({item.carousel_images?.length || 0} fotos)
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row gap-5 items-start">
                    {/* LEFT: Instagram Feed Mockup Card com Navegação de Slides */}
                    <div className="w-full md:w-[46%] bg-[#F2F2F7] rounded-2xl flex flex-col items-center justify-center p-3 relative border border-[#E8E8ED] select-none overflow-hidden min-h-[400px]">
                      <div className="w-full max-w-[340px] bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.06)] border border-[#E8E8ED] overflow-hidden flex flex-col mx-auto select-none transition-all">
                        {/* Header */}
                        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-black/[0.04]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px] shrink-0">
                              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                                {avatarSrc ? (
                                  <img src={avatarSrc} alt={selectedAccount} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-tr from-[#0071E3] to-[#4da3ff] flex items-center justify-center text-white text-[10px] font-bold">
                                    {selectedAccount ? selectedAccount.charAt(0).toUpperCase() : 'A'}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[12px] font-semibold text-[#1D1D1F] leading-tight">
                                {selectedAccount || "usuario_ig"}
                              </span>
                              <span className="text-[10px] text-[#86868B] font-medium leading-none mt-0.5">
                                Carrossel de Fotos
                              </span>
                            </div>
                          </div>
                          <div className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[#86868B] text-[10px] font-semibold flex items-center gap-1 border border-[#E8E8ED]">
                            <span className="material-symbols-outlined text-[13px] text-amber-500">photo_library</span>
                            {activeCarousel?.carousel_urls?.length || 0} fotos
                          </div>
                        </div>

                        {/* Image Slide Area */}
                        <div className={`w-full bg-[#EFEFEF] relative overflow-hidden flex items-center justify-center transition-all duration-300 ${
                          imgAspect === '4/5' ? 'aspect-[4/5] max-h-[440px]' : 'aspect-square max-h-[380px]'
                        }`}>
                          <img
                            src={activeCarousel?.carousel_urls ? activeCarousel.carousel_urls[carouselPreviewIndex] : ''}
                            alt="slide"
                            onLoad={handleImageLoad}
                            className="w-full h-full object-cover select-none animate-fadeIn"
                          />

                          {activeCarousel?.carousel_urls && activeCarousel.carousel_urls.length > 1 && (
                            <>
                              <div className="absolute top-3 right-3 bg-[#1D1D1F]/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-20">
                                {carouselPreviewIndex + 1}/{activeCarousel.carousel_urls.length}
                              </div>

                              {carouselPreviewIndex > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCarouselPreviewIndex(prev => Math.max(0, prev - 1))}
                                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-[#1D1D1F] flex items-center justify-center shadow-md transition-all z-20 cursor-pointer hover:scale-105 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-[14px] font-bold">chevron_left</span>
                                </button>
                              )}

                              {carouselPreviewIndex < activeCarousel.carousel_urls.length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => setCarouselPreviewIndex(prev => Math.min(activeCarousel.carousel_urls.length - 1, prev + 1))}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-[#1D1D1F] flex items-center justify-center shadow-md transition-all z-20 cursor-pointer hover:scale-105 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-[14px] font-bold">chevron_right</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Action Icons & Pagination Dots */}
                        <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-3.5">
                            <span className="material-symbols-outlined text-[23px] text-[#1D1D1F]">favorite_border</span>
                            <span className="material-symbols-outlined text-[22px] text-[#1D1D1F]">chat_bubble_outline</span>
                            <span className="material-symbols-outlined text-[22px] text-[#1D1D1F]">send</span>
                          </div>

                          {activeCarousel?.carousel_urls && activeCarousel.carousel_urls.length > 1 && (
                            <div className="flex-1 flex justify-center gap-1.5 pr-3">
                              {activeCarousel.carousel_urls.map((_, i) => (
                                <div
                                  key={i}
                                  className={`rounded-full transition-all duration-200 ${
                                    i === carouselPreviewIndex
                                      ? 'w-1.5 h-1.5 bg-[#0071E3]'
                                      : 'w-1.2 h-1.2 bg-[#D9D9D9]'
                                  }`}
                                />
                              ))}
                            </div>
                          )}

                          <span className="material-symbols-outlined text-[22px] text-[#1D1D1F]">bookmark_border</span>
                        </div>

                        {/* Caption Snippet */}
                        <div className="px-3.5 pb-3 flex flex-col gap-1 text-left">
                          <div className="text-[11px] leading-[16px] text-[#1D1D1F] break-words line-clamp-3">
                            <span className="font-semibold mr-1.5">{selectedAccount || "usuario_ig"}</span>
                            <CaptionText text={activeCarousel?.caption || 'Sem legenda'} hashtagClass="text-[#00376B] font-semibold" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT: Resumo e Cronograma dos Carrosséis */}
                    <div className="w-full md:w-[54%] flex flex-col gap-4 text-left">
                      {/* Banner do Carrossel Ativo */}
                      <div className="p-4 bg-[#F5F5F7] rounded-2xl border border-[#E8E8ED] flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-[#1D1D1F]">
                            Carrossel #{selectedCarouselPreviewTab + 1}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-bold">
                            {formatScheduleBadge(activeCarousel?.scheduled_time)}
                          </span>
                        </div>
                        <p className="text-xs text-[#1D1D1F] leading-relaxed line-clamp-2">
                          <span className="text-[#86868B] font-bold">Legenda: </span>
                          {activeCarousel?.caption || '(Sem legenda configurada)'}
                        </p>
                      </div>

                      {/* Lista de Todos os Carrosséis Agendados */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                          Cronograma dos Carrosséis ({previewSchedule.length})
                        </span>
                        <div className="max-h-60 overflow-y-auto border border-[#E8E8ED] rounded-2xl divide-y divide-[#F5F5F7] bg-white custom-scrollbar">
                          {previewSchedule.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              onClick={() => {
                                setSelectedCarouselPreviewTab(idx);
                                setCarouselPreviewIndex(0);
                              }}
                              className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                selectedCarouselPreviewTab === idx ? 'bg-[#0071E3]/5' : 'hover:bg-[#F5F5F7]/60'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`text-xs font-bold ${selectedCarouselPreviewTab === idx ? 'text-[#0071E3]' : 'text-[#86868B]'}`}>
                                  #{idx + 1}
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-bold text-[#1D1D1F] truncate">
                                    {item.video_name}
                                  </span>
                                  <span className="text-[10px] text-[#86868B] truncate">
                                    {item.caption || 'Sem legenda'}
                                  </span>
                                </div>
                              </div>

                              <div className="px-2.5 py-1 rounded-xl bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-extrabold shrink-0">
                                {formatScheduleBadge(item.scheduled_time)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Modo Lote Normal (Reels)
            const reelsCount = previewSchedule.filter(p => p.post_type === 'reel' || p.media_type === 'video' || !/\.(jpe?g|png|webp)$/i.test(p.video_name || p.video_path)).length;
            const imagesCount = previewSchedule.length - reelsCount;

            return (
              <div className="flex flex-col gap-4">
                {/* Summary Stats Banner */}
                <div className="p-4 bg-[#F5F5F7] rounded-2xl border border-[#E8E8ED] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#86868B] uppercase">Total de Mídias</span>
                      <span className="text-sm font-extrabold text-[#1D1D1F] flex items-center gap-1.5">
                        {previewSchedule.length === 1 ? '1 Publicação' : `${previewSchedule.length} Mídias`}
                        <span className="text-xs font-semibold text-[#86868B]">
                          ({reelsCount > 0 ? `${reelsCount} Reel${reelsCount > 1 ? 's' : ''}` : ''}{reelsCount > 0 && imagesCount > 0 ? ' • ' : ''}{imagesCount > 0 ? `${imagesCount} Feed (Foto)` : ''})
                        </span>
                      </span>
                    </div>
                    <div className="w-[1px] h-7 bg-[#E8E8ED]" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#86868B] uppercase">Frequência</span>
                      <span className="text-sm font-extrabold text-[#1D1D1F]">
                        {previewSchedule.length === 1 ? 'Horário Definido' : `${postsPerDay} post(s)/dia`}
                      </span>
                    </div>
                  </div>

                  {previewSchedule.length > 1 && (
                    <button
                      type="button"
                      onClick={generateAISchedule}
                      className="px-3 py-2 rounded-xl bg-white border border-[#E8E8ED] hover:bg-[#F5F5F7] text-xs font-bold text-[#0071E3] flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                      Regerar Horários IA
                    </button>
                  )}
                </div>

                {/* Timeline Cards */}
                {previewSchedule.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-[#E8E8ED] rounded-2xl flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-[#86868B]">perm_media</span>
                    <p className="text-xs font-bold text-[#1D1D1F]">Nenhuma mídia no cronograma</p>
                    <p className="text-[11px] text-[#86868B]">Volte e selecione mídias ou regere os horários.</p>
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
                    {previewSchedule.map((item, idx) => {
                      const isImg = item.post_type === 'image' || item.media_type === 'image' || /\.(jpe?g|png|webp)$/i.test(item.video_name || item.video_path);

                      return (
                        <div key={item.id || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-[#F5F5F7]/60 transition-colors">
                          {/* Left: Index, Media Play/View Thumbnail, Name & Badge */}
                          <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                            <span className="text-xs font-bold text-[#86868B] w-5 shrink-0">{idx + 1}.</span>
                            
                            {/* Play Video / View Photo Trigger Button */}
                            <button
                              type="button"
                              onClick={() => setPreviewModalIndex(idx)}
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer group shadow-2xs ${
                                isImg 
                                  ? 'bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white' 
                                  : 'bg-[#0071E3]/10 hover:bg-[#0071E3] text-[#0071E3] hover:text-white'
                              }`}
                              title={isImg ? "Ver prévia da foto" : "Assistir prévia do vídeo"}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {isImg ? 'image' : 'play_arrow'}
                              </span>
                            </button>

                            <div className="flex flex-col overflow-hidden min-w-0 flex-1 justify-center">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-[#1D1D1F] truncate" title={item.video_name}>
                                  {item.video_name}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                                  isImg 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                    : 'bg-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/20'
                                }}`}>
                                  {isImg ? 'Feed 🖼️' : 'Reel 🎬'}
                                </span>
                              </div>
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
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

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
              disabled={filteredVideos.length === 0 || !selectedAccount}
              onClick={handleProceedStep1}
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                filteredVideos.length === 0 || !selectedAccount
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
              disabled={submitting || (filteredVideos.length === 1 && postType !== 'carousel' && previewSchedule.length === 0)}
              onClick={
                filteredVideos.length === 1 && postType !== 'carousel'
                  ? handleSubmitBulk
                  : postType === 'carousel'
                  ? handleProceedCarouselStep2
                  : generateAISchedule
              }
              className={`px-6 py-2.5 rounded-2xl font-bold text-xs shadow-md shadow-[#0071E3]/20 transition-all flex items-center gap-1.5 ${
                submitting
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-[#0071E3] hover:bg-[#005cbb] active:scale-98 text-white cursor-pointer'
              }`}
            >
              {submitting
                ? 'Agendando...'
                : filteredVideos.length === 1 && postType !== 'carousel'
                ? 'Confirmar e Agendar Publicação'
                : postType === 'carousel'
                ? 'Continuar para Prévia'
                : 'Gerar Cronograma IA'}
              <span className="material-symbols-outlined text-[18px]">
                {filteredVideos.length === 1 && postType !== 'carousel' ? 'send' : postType === 'carousel' ? 'arrow_forward' : 'auto_awesome'}
              </span>
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
              {submitting
                ? 'Agendando...'
                : postType === 'carousel'
                ? `Confirmar e Agendar Carrossel${previewSchedule.length > 1 ? `s (${previewSchedule.length})` : ''}`
                : previewSchedule.length === 1
                ? 'Confirmar e Agendar Publicação'
                : `Confirmar e Agendar (${previewSchedule.length})`}
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

      {/* Lightbox Modal para Visualização Expandida da Foto */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[99999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-[#1D1D1F] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col items-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="w-full px-5 py-3.5 bg-black/40 backdrop-blur-sm border-b border-white/10 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-[#0071E3]">image</span>
                <span className="text-xs font-bold truncate max-w-xs sm:max-w-md" title={lightboxImage.name}>
                  {lightboxImage.name || 'Visualização da Imagem'}
                </span>
                {lightboxImage.index && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-white/80">
                    {lightboxImage.index} de {lightboxImage.total}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Lightbox Image Content */}
            <div className="p-3 sm:p-6 flex items-center justify-center max-h-[calc(90vh-60px)] overflow-hidden">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name || 'preview'}
                className="max-h-[78vh] max-w-full object-contain rounded-xl shadow-lg select-none"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
