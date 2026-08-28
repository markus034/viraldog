import { useState, useEffect, useCallback, useRef } from 'react';
import { getCloudConfig, syncAccountToCloud, uploadVideoToCloud, submitCloudPost } from '../../utils/cloudSync';

const API = 'http://localhost:8000';

export default function usePublisher(triggerToast) {
  // Data States
  const [videos, setVideos] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [repostEligible, setRepostEligible] = useState([]);

  // Filters & Tabs
  const [activeSubTab, setActiveSubTab] = useState('calendar'); // calendar, my-posts, approvals, dashboard
  const [calendarView, setCalendarView] = useState('semanal'); // semanal, mensal
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedFilterAccount, setSelectedFilterAccount] = useState('all');
  const [selectedFilterFormat, setSelectedFilterFormat] = useState('all');

  // UI States
  const [creationWizardOpen, setCreationWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [deleteModalPost, setDeleteModalPost] = useState(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [presetsDropdownOpen, setPresetsDropdownOpen] = useState(false);
  const [presetType, setPresetType] = useState(null);
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('viraldog_presets') || '{}';
      return JSON.parse(saved);
    } catch { return {}; }
  });
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  // Form State
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [caption, setCaption] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [postType, setPostType] = useState('reel');
  const [carouselImages, setCarouselImages] = useState([]);
  const [carouselPreviewUrls, setCarouselPreviewUrls] = useState([]);
  const [customFolderPath, setCustomFolderPath] = useState('');

  // Loading States
  const [generatingAI, setGeneratingAI] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [suggestingTime, setSuggestingTime] = useState(false);
  const [loadingFolder, setLoadingFolder] = useState(false);

  // Video Player
  const videoRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsVideoMuted(videoRef.current.muted);
  }, []);

  // Fetching Data
  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/videos`);
      if (res.ok) {
        const data = await res.json();
        const sorted = [...data].sort((a, b) => {
          if (a.category === 'edited' && b.category !== 'edited') return -1;
          if (a.category !== 'edited' && b.category === 'edited') return 1;
          return 0;
        });
        setVideos(sorted);
        if (sorted.length > 0) setSelectedVideo(sorted[0].path);
        else setSelectedVideo('');
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0) {
          setSelectedAccount(prev => {
            if (!prev) return data[0].username;
            const exists = data.some(a => a.username === prev);
            if (exists) return prev;
            const matchedByName = data.find(a => a.display_name === prev);
            return matchedByName ? matchedByName.username : data[0].username;
          });
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchScheduledPosts = useCallback(async () => {
    try {
      const cloudConfig = getCloudConfig();
      let res;
      if (cloudConfig && cloudConfig.enabled && cloudConfig.vpsUrl) {
        const cleanUrl = cloudConfig.vpsUrl.replace(/\/+$/, '');
        const headers = {};
        if (cloudConfig.apiKey) headers['X-ViralDog-Key'] = cloudConfig.apiKey.trim();
        try {
          res = await fetch(`${cleanUrl}/api/posts`, { headers });
        } catch {
          res = await fetch(`${API}/api/posts`);
        }
      } else {
        res = await fetch(`${API}/api/posts`);
      }
      if (res && res.ok) setScheduledPosts(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchRepostEligible = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/posts/repost-eligible`);
      if (res.ok) setRepostEligible(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchAccounts();
    fetchScheduledPosts();
    fetchRepostEligible();
  }, [fetchVideos, fetchAccounts, fetchScheduledPosts, fetchRepostEligible]);

  useEffect(() => {
    if (creationWizardOpen) {
      fetchAccounts();
    }
  }, [creationWizardOpen, fetchAccounts]);

  useEffect(() => {
    const handleSync = () => {
      fetchAccounts();
      fetchScheduledPosts();
    };

    window.addEventListener('focus', handleSync);
    window.addEventListener('viraldog:accounts-updated', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('viraldog:accounts-updated', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [fetchAccounts, fetchScheduledPosts]);

  // Polling automático leve enquanto estiver no wizard com conta sem sessão
  useEffect(() => {
    if (!creationWizardOpen || !selectedAccount) return;
    const currentAcc = accounts.find(a => a.username === selectedAccount);
    if (!currentAcc || currentAcc.has_session || currentAcc.has_official_token) return;

    const interval = setInterval(() => {
      fetchAccounts();
    }, 2500);

    return () => clearInterval(interval);
  }, [creationWizardOpen, selectedAccount, accounts, fetchAccounts]);

  const scanFolderVideos = async (path) => {
    if (!path) {
      fetchVideos();
      return;
    }
    setLoadingFolder(true);
    try {
      const res = await fetch(`${API}/api/videos/scan-folder?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(v => ({
          name: v.name, path: v.path, size: v.size,
          category: 'folder', created_at: v.created_at
        }));
        setVideos(formatted);
        if (formatted.length > 0) {
          setSelectedVideo(formatted[0].path);
        } else {
          setSelectedVideo('');
          triggerToast('Nenhum vídeo (.mp4) encontrado na pasta.', 'info');
        }
      } else {
        triggerToast('Erro ao ler a pasta.', 'error');
      }
    } catch (e) {
      triggerToast('Erro de rede ao escanear pasta.', 'error');
    }
    setLoadingFolder(false);
  };

  const handleGenerateCaption = async () => {
    if (postType === 'reel' && !selectedVideo) {
      triggerToast("Selecione um vídeo primeiro.", "error");
      return;
    }
    setGeneratingAI(true);
    triggerToast("IA gerando legenda...", "info");
    const videoName = postType === 'reel' ? selectedVideo.split(/[\\/]/).pop() : 'Novo post de Feed';
    try {
      const res = await fetch(`${API}/api/ai/caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_title: videoName })
      });
      const data = await res.json();
      if (res.ok) {
        setCaption(data.caption);
        triggerToast("Legenda gerada!", "success");
      } else {
        triggerToast(`Erro: ${data.detail || "Verifique as chaves"}`, "error");
      }
    } catch (err) { triggerToast("Erro de conexão.", "error"); }
    setGeneratingAI(false);
  };

  const handleSuggestTime = async () => {
    setSuggestingTime(true);
    try {
      const res = await fetch(`${API}/api/posts/suggest-time?account_username=${selectedAccount || ''}`);
      const data = await res.json();
      if (res.ok && data.suggested_time) {
        const dt = new Date(data.suggested_time);
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
        setScheduledTime(local.toISOString().slice(0, 16));
        triggerToast(`Sugestão: ${data.reason}`, "success");
      }
    } catch (e) { triggerToast("Erro ao buscar sugestão.", "error"); }
    setSuggestingTime(false);
  };

  const handleScheduleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!scheduledTime) {
      triggerToast("Selecione o horário.", "error");
      return;
    }
    const targetAcc = accounts.find(a => a.username === selectedAccount);
    if (targetAcc && !targetAcc.has_session) {
      triggerToast(`A conta @${selectedAccount} não possui sessão ativa. Acesse a aba Perfis para conectar.`, "error");
      return;
    }

    setScheduling(true);

    const cloudConfig = getCloudConfig();

    let finalScheduledTime = scheduledTime;
    if (scheduledTime) {
      try {
        const dt = new Date(scheduledTime);
        if (!isNaN(dt.getTime())) {
          finalScheduledTime = dt.toISOString();
        }
      } catch (e) {}
    }

    // ─── CLOUD MODE (VPS 24/7) ───
    if (cloudConfig.enabled && cloudConfig.vpsUrl) {
      try {
        // 1. Sync account to VPS if selected
        if (targetAcc) {
          try {
            await syncAccountToCloud(cloudConfig.vpsUrl, cloudConfig.apiKey, targetAcc);
          } catch (syncErr) {
            console.warn('Could not auto-sync account to VPS:', syncErr);
          }
        }

        // 2. Upload video file to VPS if reel
        let vpsVideoPath = null;
        if (postType === 'reel' && selectedVideo) {
          triggerToast('☁️ Enviando vídeo para a nuvem VPS...', 'info');
          const videoName = selectedVideo.split(/[\\/]/).pop() || 'video.mp4';
          const uploadRes = await uploadVideoToCloud(
            cloudConfig.vpsUrl,
            cloudConfig.apiKey,
            selectedVideo,
            videoName
          );
          vpsVideoPath = uploadRes.video_path;
        }

        // 3. Submit post to VPS
        const payload = {
          video_path: vpsVideoPath,
          caption,
          scheduled_time: finalScheduledTime,
          account_username: selectedAccount || null,
          post_type: postType,
          hashtag_group_id: null,
          carousel_image_paths: postType === 'carousel' ? carouselImages : null,
        };

        await submitCloudPost(cloudConfig.vpsUrl, cloudConfig.apiKey, payload);

        triggerToast('☁️ 🎉 Post agendado na nuvem! Será publicado mesmo com o PC desligado.', 'success');
        setCaption('');
        setScheduledTime('');
        setCarouselImages([]);
        setCreationWizardOpen(false);
        setWizardStep(1);
        fetchScheduledPosts();
      } catch (err) {
        triggerToast(`Erro ao agendar na nuvem: ${err.message || 'Falha na conexão.'}`, 'error');
      }
      setScheduling(false);
      return;
    }

    // ─── LOCAL MODE ───
    try {
      const res = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: postType === 'reel' ? selectedVideo : null,
          caption,
          scheduled_time: finalScheduledTime,
          account_username: selectedAccount || null,
          post_type: postType,
          hashtag_group_id: null,
          carousel_image_paths: postType === 'carousel' ? carouselImages : null
        })
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast("Post agendado com sucesso!", "success");
        setCaption('');
        setScheduledTime('');
        setCarouselImages([]);
        setCreationWizardOpen(false);
        setWizardStep(1);
        fetchScheduledPosts();
      } else {
        triggerToast(`Erro: ${data.detail || "Erro ao agendar post"}`, "error");
      }
    } catch (err) { triggerToast("Erro de conexão.", "error"); }
    setScheduling(false);
  };

  const openDeleteModal = useCallback((postOrId, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (typeof postOrId === 'object' && postOrId !== null) {
      setDeleteModalPost(postOrId);
    } else {
      const found = scheduledPosts.find(p => p.id === postOrId);
      setDeleteModalPost(found || { id: postOrId });
    }
  }, [scheduledPosts]);

  const closeDeleteModal = useCallback(() => {
    if (isDeletingSchedule) return;
    setDeleteModalPost(null);
  }, [isDeletingSchedule]);

  const confirmDeleteSchedule = useCallback(async () => {
    if (!deleteModalPost || !deleteModalPost.id) return;
    setIsDeletingSchedule(true);
    try {
      const res = await fetch(`${API}/api/posts/${deleteModalPost.id}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast("Agendamento cancelado com sucesso.", "success");
        setDeleteModalPost(null);
        fetchScheduledPosts();
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(`Erro: ${errData.detail || "Não foi possível cancelar o agendamento."}`, "error");
      }
    } catch (e) {
      triggerToast("Erro de conexão ao cancelar agendamento.", "error");
    } finally {
      setIsDeletingSchedule(false);
    }
  }, [deleteModalPost, fetchScheduledPosts, triggerToast]);

  const handleDeleteSchedule = useCallback((postOrId, e) => {
    openDeleteModal(postOrId, e);
  }, [openDeleteModal]);

  const handleRetrySchedule = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API}/api/posts/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        triggerToast("Agendamento reiniciado para envio!", "success");
        fetchScheduledPosts();
      } else {
        triggerToast(`Erro: ${data.detail || "Erro ao tentar novamente"}`, "error");
      }
    } catch (e) { triggerToast("Erro de conexão.", "error"); }
  };

  const handleRepost = async (postId) => {
    try {
      const res = await fetch(`${API}/api/posts/repost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_post_id: postId })
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast("Repost agendado com nova legenda!", "success");
        fetchScheduledPosts();
        fetchRepostEligible();
      } else {
        triggerToast(`Erro: ${data.detail || "Erro"}`, "error");
      }
    } catch (e) { triggerToast("Erro de conexão.", "error"); }
  };

  // Calendar Controls
  const handlePrevDate = () => {
    if (calendarView === 'semanal') {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(prev.getDate() - 7);
        return next;
      });
    } else {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setMonth(prev.getMonth() - 1);
        return next;
      });
    }
  };

  const handleNextDate = () => {
    if (calendarView === 'semanal') {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(prev.getDate() + 7);
        return next;
      });
    } else {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setMonth(prev.getMonth() + 1);
        return next;
      });
    }
  };

  const handleTodayDate = () => setCurrentDate(new Date());

  const handleDayClick = (date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 10);
    setScheduledTime(`${localISOTime}T12:00`);
    setCreationWizardOpen(true);
    setWizardStep(1);
  };

  const getPostsForDay = (date) => {
    const targetYear = date.getFullYear();
    const targetMonth = date.getMonth();
    const targetDate = date.getDate();

    return scheduledPosts.filter(post => {
      if (!post.scheduled_time) return false;
      const postDate = new Date(post.scheduled_time);
      if (postDate.getFullYear() !== targetYear || postDate.getMonth() !== targetMonth || postDate.getDate() !== targetDate) {
        return false;
      }
      if (selectedFilterAccount !== 'all') {
        const matchedAcc = accounts.find(a => a.username === selectedFilterAccount || a.display_name === selectedFilterAccount);
        const validValues = [selectedFilterAccount];
        if (matchedAcc) {
          if (matchedAcc.username) validValues.push(matchedAcc.username);
          if (matchedAcc.display_name) validValues.push(matchedAcc.display_name);
        }
        if (!validValues.includes(post.account_username) && !validValues.includes(post.account_raw_username)) {
          return false;
        }
      }
      if (selectedFilterFormat !== 'all' && post.post_type !== selectedFilterFormat) return false;
      return true;
    });
  };

  const persistPresets = (updated) => {
    setSavedPresets(updated);
    localStorage.setItem('viraldog_presets', JSON.stringify(updated));
  };

  return {
    videos, accounts, scheduledPosts, repostEligible,
    activeSubTab, setActiveSubTab, calendarView, setCalendarView,
    currentDate, selectedFilterAccount, setSelectedFilterAccount,
    selectedFilterFormat, setSelectedFilterFormat,
    creationWizardOpen, setCreationWizardOpen, wizardStep, setWizardStep,
    bulkModalOpen, setBulkModalOpen,
    presetsDropdownOpen, setPresetsDropdownOpen, presetType, setPresetType,
    showSavePresetInput, setShowSavePresetInput, newPresetName, setNewPresetName,
    savedPresets, formatDropdownOpen, setFormatDropdownOpen,
    accountDropdownOpen, setAccountDropdownOpen,
    selectedVideo, setSelectedVideo, selectedAccount, setSelectedAccount,
    caption, setCaption, scheduledTime, setScheduledTime,
    postType, setPostType, carouselImages, setCarouselImages,
    generatingAI, scheduling, suggestingTime, loadingFolder,
    videoRef, isVideoPlaying, isVideoMuted, togglePlay, toggleMute,
    handleGenerateCaption, handleSuggestTime, handleScheduleSubmit,
    deleteModalPost, setDeleteModalPost, isDeletingSchedule,
    openDeleteModal, closeDeleteModal, confirmDeleteSchedule,
    handleDeleteSchedule, handleRetrySchedule, handleRepost, scanFolderVideos,
    handlePrevDate, handleNextDate, handleTodayDate, handleDayClick,
    getPostsForDay, persistPresets, fetchAccounts, fetchScheduledPosts
  };
}
