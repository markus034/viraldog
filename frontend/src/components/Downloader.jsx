import { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

function getCurrentPageProfile(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (/(^|\.)instagram\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const RESERVED = new Set(['accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories', 'about', 'developer', 'legal', 'privacy', 'web', 'your_activity']);
      if (parts.length >= 1 && !RESERVED.has(parts[0].toLowerCase())) {
        return { platform: 'instagram', username: parts[0].replace(/^@+/, '') };
      }
    } else if (/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 1 && parts[0].startsWith('@')) {
        return { platform: 'tiktok', username: parts[0].replace(/^@+/, '') };
      }
    }
  } catch (e) {}
  return null;
}

export default function Downloader({ triggerToast, isVisible = true }) {
  const isElectron = !!(window.electronAPI);
  const containerRef = useRef(null);
  const favoritesButtonRef = useRef(null);
  const favoritesPopoverRef = useRef(null);
  const hasShown = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [addressBarVal, setAddressBarVal] = useState('https://www.instagram.com/');
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [favoritesPopoverPos, setFavoritesPopoverPos] = useState({ top: 0, left: 0 });
  const [favorites, setFavorites] = useState({ instagram: [], tiktok: [] });
  const [favoritesTab, setFavoritesTab] = useState('instagram');
  const [isCookiePopoverOpen, setIsCookiePopoverOpen] = useState(false);
  const [cookieModalView, setCookieModalView] = useState('import'); // 'import' | 'sessions'
  const [activeSessions, setActiveSessions] = useState({
    instagram: { connected: false, cookieCount: 0, userId: null },
    tiktok: { connected: false, cookieCount: 0 }
  });
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [isImportingCookies, setIsImportingCookies] = useState(false);
  const [cookieMessage, setCookieMessage] = useState(null);
  const cookieButtonRef = useRef(null);
  const cookiePopoverRef = useRef(null);
  const isUnmounted = useRef(false);
  const hasInitialized = useRef(false);

  const currentPageProfile = getCurrentPageProfile(addressBarVal);

  useEffect(() => {
    if (!isElectron) return;

    // Load initial favorites
    if (window.electronAPI.getBrowserFavorites) {
      window.electronAPI.getBrowserFavorites().then((favs) => {
        if (favs && typeof favs === 'object') setFavorites(favs);
      });
    }

    // Listen for favorites updates
    if (window.electronAPI.onBrowserFavoritesUpdated) {
      window.electronAPI.onBrowserFavoritesUpdated((updatedFavs) => {
        if (updatedFavs && typeof updatedFavs === 'object') setFavorites(updatedFavs);
      });
    }

    // Listen for navigation updates from the main process
    window.electronAPI.onIgBrowserNavigated((data) => {
      setAddressBarVal(data.url);
      setCanGoBack(data.canGoBack);
      setCanGoForward(data.canGoForward);
      setIsLoading(false);
      setIsFavoritesOpen(false);
    });

    // Listen to download status updates to show nice toasts
    window.electronAPI.onDownloadStatus((data) => {
      if (data.state === 'completed') {
        triggerToast(`Download concluído: ${data.filename}`, 'success');
      } else if (data.state === 'duplicate') {
        triggerToast(`⚠️ Já baixado anteriormente: ${data.filename}`, 'warning');
      } else if (data.state === 'failed') {
        triggerToast(`Erro no download: ${data.filename}`, 'error');
      }
    });

    return () => {
      if (window.electronAPI.removeIgBrowserNavigated) {
        window.electronAPI.removeIgBrowserNavigated();
      }
      if (window.electronAPI.removeDownloadStatus) {
        window.electronAPI.removeDownloadStatus();
      }
      if (window.electronAPI.removeBrowserFavoritesUpdated) {
        window.electronAPI.removeBrowserFavoritesUpdated();
      }
    };
  }, [isElectron, triggerToast]);

  useEffect(() => {
    if (!isFavoritesOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFavoritesOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFavoritesOpen]);

  useEffect(() => {
    if (!isCookiePopoverOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        !cookieButtonRef.current?.contains(event.target) &&
        !cookiePopoverRef.current?.contains(event.target)
      ) {
        setIsCookiePopoverOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsCookiePopoverOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCookiePopoverOpen]);

  // Show/hide the Electron BrowserView based on tab visibility and cookie modal
  useEffect(() => {
    if (!isElectron) return;
    if (!hasInitialized.current) return;

    if (isVisible && !isCookiePopoverOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.electronAPI.showIgBrowser({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }, 'persist:viraldog_downloader_isolated');
        hasShown.current = true;
      }
    } else {
      window.electronAPI.setIgFavoritesMenu?.({ open: false, anchorX: 0 });
      window.electronAPI.closeFavoritesPopover?.();
      window.electronAPI.hideIgBrowser();
      hasShown.current = false;
    }
  }, [isVisible, isCookiePopoverOpen, isElectron]);

  useEffect(() => {
    if (!isElectron || !containerRef.current) return;
    isUnmounted.current = false;
    hasInitialized.current = true;

    let animationFrameId = null;
    const updateBounds = (forceShow = false) => {
      if (isUnmounted.current || !containerRef.current || !isVisible || isCookiePopoverOpen) return;

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        if (isUnmounted.current || !containerRef.current || !isVisible || isCookiePopoverOpen) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (forceShow || !hasShown.current) {
            window.electronAPI.showIgBrowser({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }, 'persist:viraldog_downloader_isolated');
            hasShown.current = true;
          } else {
            window.electronAPI.updateIgBrowserBounds({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            });
          }
        }
      });
    };

    const timeoutId = setTimeout(() => {
      if (isVisible) updateBounds(true);
      setIsLoading(false);
    }, 200);

    const resizeObserver = new ResizeObserver(() => {
      if (isVisible) updateBounds();
    });
    resizeObserver.observe(containerRef.current);

    // Debounced resize handler — sidebar animation takes ~200ms, so we wait
    // for layout to settle before repositioning the WebContentsView.
    // Without this, the view gets stale/zero bounds mid-animation → black screen.
    let resizeTimer = null;
    const handleWindowResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isVisible) updateBounds();
      }, 120);
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      isUnmounted.current = true;
      clearTimeout(timeoutId);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.electronAPI.hideIgBrowser();
      hasShown.current = false;
    };
  }, [isElectron, isVisible]);

  const handleBack = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoBack();
    }
  }, [isElectron]);

  const handleForward = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoForward();
    }
  }, [isElectron]);

  const handleReload = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserReload();
    }
  }, [isElectron]);

  const handleGoInstagram = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoToUrl('https://www.instagram.com/');
    }
  }, [isElectron]);

  const handleGoTikTok = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoToUrl('https://www.tiktok.com/');
    }
  }, [isElectron]);

  const handleFavoritesToggle = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isElectron && window.electronAPI.toggleFavoritesPopover) {
      const btnRect = favoritesButtonRef.current?.getBoundingClientRect();
      window.electronAPI.toggleFavoritesPopover({
        bounds: btnRect ? {
          x: btnRect.left,
          y: btnRect.top,
          width: btnRect.width,
          height: btnRect.height
        } : { x: 100, y: 50, width: 32, height: 32 },
        currentProfile: currentPageProfile
      });
      return;
    }

    const nextOpen = !isFavoritesOpen;
    if (nextOpen && favoritesButtonRef.current) {
      const rect = favoritesButtonRef.current.getBoundingClientRect();
      setFavoritesPopoverPos({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    setIsFavoritesOpen(nextOpen);
    if (nextOpen && isElectron && window.electronAPI.getBrowserFavorites) {
      window.electronAPI.getBrowserFavorites().then((favs) => {
        if (favs && typeof favs === 'object') setFavorites(favs);
      });
    }
  }, [isElectron, isFavoritesOpen, currentPageProfile]);

  const handleSelectFavorite = useCallback((platform, username) => {
    if (!username) return;
    const targetUrl = platform === 'tiktok'
      ? `https://www.tiktok.com/@${username}`
      : `https://www.instagram.com/${username}/`;
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoToUrl(targetUrl);
    } else {
      setAddressBarVal(targetUrl);
      triggerToast(`Navegando para @${username} (${platform === 'tiktok' ? 'TikTok' : 'Instagram'})...`, 'info');
    }
    setIsFavoritesOpen(false);
  }, [isElectron, triggerToast]);

  const handleRemoveFavorite = useCallback(async (e, platform, username) => {
    e.stopPropagation();
    if (!username) return;
    try {
      if (isElectron && window.electronAPI.removeBrowserFavorite) {
        const res = await window.electronAPI.removeBrowserFavorite({ platform, username });
        if (res.success && res.favorites) {
          setFavorites(res.favorites);
        }
      } else {
        setFavorites((prev) => ({
          ...prev,
          [platform]: (prev[platform] || []).filter((u) => u.toLowerCase() !== username.toLowerCase()),
        }));
      }
      triggerToast(`@${username} removido dos favoritos.`, 'info');
    } catch (err) {
      triggerToast(`Erro ao remover favorito: ${err.message}`, 'error');
    }
  }, [isElectron, triggerToast]);

  const handleAddCurrentFavorite = useCallback(async () => {
    if (!currentPageProfile) return;
    const { platform, username } = currentPageProfile;
    try {
      if (isElectron && window.electronAPI.addBrowserFavorite) {
        const res = await window.electronAPI.addBrowserFavorite({ platform, username });
        if (res.success && res.favorites) {
          setFavorites(res.favorites);
        }
      } else {
        setFavorites((prev) => ({
          ...prev,
          [platform]: [username, ...(prev[platform] || []).filter((u) => u.toLowerCase() !== username.toLowerCase())],
        }));
      }
      triggerToast(`@${username} adicionado aos favoritos do ${platform === 'tiktok' ? 'TikTok' : 'Instagram'}!`, 'success');
    } catch (err) {
      triggerToast(`Erro ao adicionar favorito: ${err.message}`, 'error');
    }
  }, [currentPageProfile, isElectron, triggerToast]);

  const handleAddressBarSubmit = useCallback((e) => {
    e.preventDefault();
    if (isElectron && addressBarVal.trim()) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoToUrl(addressBarVal);
    }
  }, [isElectron, addressBarVal]);

  const handlePasteCookies = async () => {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
      if (!text || !text.trim()) {
        setCookieMessage({ type: 'error', text: 'A área de transferência está vazia ou não contém texto.' });
        return;
      }
      setCookieInput(text.trim());
      setCookieMessage({ type: 'success', text: 'Cookies colados da área de transferência!' });
      triggerToast('Cookies colados com sucesso!', 'info');
    } catch (err) {
      setCookieMessage({ type: 'error', text: 'Não foi possível ler a área de transferência. Cole usando Ctrl+V no campo.' });
    }
  };

  const handleImportCookies = async () => {
    if (!cookieInput.trim()) {
      setCookieMessage({ type: 'error', text: 'Cole os cookies no campo acima.' });
      return;
    }
    setIsImportingCookies(true);
    setCookieMessage(null);
    try {
      if (isElectron && window.electronAPI.importCookies) {
        const res = await window.electronAPI.importCookies(cookieInput, 'persist:viraldog_downloader_isolated');
        if (res.success) {
          const platformLabel = res.platform === 'tiktok' ? 'TikTok' : 'Instagram';
          const platformUrl = res.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/';
          setAddressBarVal(platformUrl);
          setCookieMessage({ type: 'success', text: `✅ ${res.count} cookies importados! Abrindo ${platformLabel}...` });
          triggerToast(`✅ ${res.count} cookies importados! Abrindo ${platformLabel}...`, 'success');
          setCookieInput('');
          setTimeout(() => {
            setIsCookiePopoverOpen(false);
            setCookieMessage(null);
          }, 1200);
        } else {
          setCookieMessage({ type: 'error', text: res.error || 'Erro ao importar cookies.' });
        }
      } else {
        const isTikTok = /tiktok/i.test(cookieInput);
        const targetUrl = isTikTok ? 'https://www.tiktok.com/' : 'https://www.instagram.com/';
        setAddressBarVal(targetUrl);
        triggerToast(`Cookies salvos! Abrindo ${isTikTok ? 'TikTok' : 'Instagram'} (preview)...`, 'info');
        setCookieMessage({ type: 'success', text: `Cookies salvos com sucesso! Abrindo ${isTikTok ? 'TikTok' : 'Instagram'}...` });
        setTimeout(() => {
          setIsCookiePopoverOpen(false);
          setCookieMessage(null);
        }, 1200);
      }
    } catch (err) {
      setCookieMessage({ type: 'error', text: String(err.message || err) });
    } finally {
      setIsImportingCookies(false);
    }
  };

  const handleOpenSessionsView = async () => {
    setCookieModalView('sessions');
    if (isElectron && window.electronAPI.getDownloaderSessions) {
      try {
        const res = await window.electronAPI.getDownloaderSessions();
        if (res && res.success && res.sessions) {
          setActiveSessions(res.sessions);
        }
      } catch (e) {}
    }
  };

  const handleDisconnectSession = async (target) => {
    setIsDisconnecting(true);
    try {
      if (isElectron && window.electronAPI.clearDownloaderSessionTarget) {
        await window.electronAPI.clearDownloaderSessionTarget(target);
      } else if (isElectron && window.electronAPI.clearDownloaderSession) {
        await window.electronAPI.clearDownloaderSession();
      }

      const label = target === 'instagram' ? 'Instagram' : target === 'tiktok' ? 'TikTok' : 'Todas as contas';
      triggerToast(`${label} desconectado com sucesso.`, 'info');

      if (target === 'all') {
        setActiveSessions({
          instagram: { connected: false, cookieCount: 0, userId: null },
          tiktok: { connected: false, cookieCount: 0 }
        });
      } else {
        setActiveSessions((prev) => ({
          ...prev,
          [target]: { connected: false, cookieCount: 0, userId: null }
        }));
      }
    } catch (err) {
      triggerToast(`Erro ao desconectar: ${err.message}`, 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Render mock view if outside Electron (development / preview mode)
  const renderMockView = () => (
    <div className="flex-1 bg-[#FAFAFA] relative flex flex-col items-center justify-center overflow-y-auto min-h-[400px]">
      <div className="flex flex-col items-center justify-center space-y-8 opacity-80">
        {/* Decorative Instagram Placeholder Logo */}
        <div className="w-24 h-24 rounded-[22px] bg-gradient-to-tr from-[#FFDC80] via-[#FD1D1D] to-[#405DE6] p-1 shadow-lg shadow-[#FD1D1D]/20">
          <div className="w-full h-full bg-white rounded-[20px] flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-[3px] border-[#262626] relative">
              <div className="w-2.5 h-2.5 rounded-full bg-[#262626] absolute top-1 right-1"></div>
            </div>
          </div>
        </div>
        <div className="text-center">
          <p className="text-text-secondary text-sm mb-1">from</p>
          <h2 className="text-xl font-semibold text-[#262626] flex items-center gap-1.5 justify-center">
            <svg className="w-5 h-5 text-[#262626]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"></path>
            </svg>
            Meta
          </h2>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button
          onClick={() => triggerToast("Para iniciar downloads reais, use o aplicativo via Electron.", "info")}
          className="bg-[#0071E3] text-white px-6 py-3 rounded-full shadow-lg shadow-[#0071E3]/25 font-semibold flex items-center gap-2 hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          Download Latest
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full h-[calc(100vh-32px)] flex flex-col gap-3 fade-in relative">
      {/* Minimalist Floating Navigation Bar */}
      <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl border border-[#E8E8ED] shadow-[0_4px_24px_rgba(0,0,0,0.04)] px-3 py-2 flex items-center justify-between gap-3 flex-shrink-0 relative">
        {/* Leftmost Cookie Icon & Navigation Group */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Cookie Session Manager Button */}
          <button
            ref={cookieButtonRef}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
              isCookiePopoverOpen
                ? 'bg-[#0071E3]/15 text-[#0071E3] shadow-sm'
                : 'hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]'
            }`}
            onClick={() => setIsCookiePopoverOpen((prev) => !prev)}
            title="Importar Cookies / Gerenciar Sessão"
            aria-label="Importar Cookies e Sessão"
          >
            <span className="material-symbols-outlined text-[19px]">cookie</span>
          </button>

          <div className="w-[1px] h-4 bg-[#E8E8ED] mx-0.5" />

          {/* Navigation Buttons */}
          <button
            className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-[#86868B] transition-all active:scale-95"
            onClick={handleBack}
            disabled={!canGoBack}
            title="Voltar"
          >
            <span className="material-symbols-outlined text-[15px] font-bold">arrow_back_ios_new</span>
          </button>
          <button
            className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-[#86868B] transition-all active:scale-95"
            onClick={handleForward}
            disabled={!canGoForward}
            title="Avançar"
          >
            <span className="material-symbols-outlined text-[15px] font-bold">arrow_forward_ios</span>
          </button>
          <button
            className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-all active:scale-95"
            onClick={handleReload}
            title="Recarregar"
          >
            {isLoading ? <div className="spinner !w-3.5 !h-3.5" /> : <span className="material-symbols-outlined text-[18px]">refresh</span>}
          </button>

          {/* Instagram Button */}
          <button
            className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-all active:scale-95"
            onClick={handleGoInstagram}
            title="Instagram"
            aria-label="Ir para o Instagram"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
          </button>

          {/* TikTok Button */}
          <button
            className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-all active:scale-95"
            onClick={handleGoTikTok}
            title="TikTok"
            aria-label="Ir para o TikTok"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.34 0 .66.06.96.16V9.07a6.3 6.3 0 0 0-.96-.07A6.34 6.34 0 0 0 3 15.34a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.28 8.28 0 0 0 3.91 1.4V6.69z"/>
            </svg>
          </button>

          {/* Favorites Button & Universal Popover */}
          <div className="relative">
            <button
              ref={favoritesButtonRef}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                isFavoritesOpen
                  ? 'bg-[#F5B301]/15 text-[#F5B301] shadow-sm'
                  : 'hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]'
              }`}
              onClick={handleFavoritesToggle}
              title="Perfis favoritos"
              aria-label="Abrir perfis favoritos"
              aria-expanded={isFavoritesOpen}
              aria-haspopup="menu"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
            </button>

            {/* Portal: Web fallback popover */}
            {(!isElectron && isFavoritesOpen) && ReactDOM.createPortal(
              <>
                {/* Backdrop for outside clicks */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFavoritesOpen(false);
                  }}
                />

                {/* Universal Apple-style Favorites Popover */}
                <div
                  ref={favoritesPopoverRef}
                  style={{
                    position: 'fixed',
                    top: favoritesPopoverPos.top,
                    left: favoritesPopoverPos.left,
                    zIndex: 9999,
                  }}
                  className="w-[310px] bg-white/95 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] shadow-[0_12px_40px_rgba(0,0,0,0.14)] p-3 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Popover Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F2]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#F5B301]/15 text-[#F5B301] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          star
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Perfis Favoritos</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFavoritesOpen(false)}
                      className="w-6 h-6 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                      title="Fechar"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>

                  {/* Platform Segmented Control Tabs */}
                  <div className="bg-[#F5F5F7] p-1 rounded-xl flex items-center gap-1 border border-[#E8E8ED]">
                    {/* Instagram Tab */}
                    <button
                      type="button"
                      onClick={() => setFavoritesTab('instagram')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        favoritesTab === 'instagram'
                          ? 'bg-white text-[#1D1D1F] shadow-sm'
                          : 'text-[#86868B] hover:text-[#1D1D1F]'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                      </svg>
                      <span>Instagram</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        favoritesTab === 'instagram' ? 'bg-[#0071E3]/10 text-[#0071E3]' : 'bg-black/5 text-[#86868B]'
                      }`}>
                        {favorites.instagram?.length || 0}
                      </span>
                    </button>

                    {/* TikTok Tab */}
                    <button
                      type="button"
                      onClick={() => setFavoritesTab('tiktok')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        favoritesTab === 'tiktok'
                          ? 'bg-white text-[#1D1D1F] shadow-sm'
                          : 'text-[#86868B] hover:text-[#1D1D1F]'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.34 0 .66.06.96.16V9.07a6.3 6.3 0 0 0-.96-.07A6.34 6.34 0 0 0 3 15.34a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.28 8.28 0 0 0 3.91 1.4V6.69z"/>
                      </svg>
                      <span>TikTok</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        favoritesTab === 'tiktok' ? 'bg-[#0071E3]/10 text-[#0071E3]' : 'bg-black/5 text-[#86868B]'
                      }`}>
                        {favorites.tiktok?.length || 0}
                      </span>
                    </button>
                  </div>

                  {/* Profiles List */}
                  <div className="max-h-[220px] overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                    {(favorites[favoritesTab] || []).length > 0 ? (
                      (favorites[favoritesTab] || []).map((username) => (
                        <div
                          key={username}
                          className="flex items-center justify-between p-1.5 rounded-xl hover:bg-[#F5F5F7] transition-all group cursor-pointer"
                          onClick={() => handleSelectFavorite(favoritesTab, username)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              favoritesTab === 'instagram'
                                ? 'bg-gradient-to-tr from-[#FD1D1D]/15 to-[#405DE6]/15 text-[#E1306C]'
                                : 'bg-black/5 text-[#1D1D1F]'
                            }`}>
                              {username.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold text-[#1D1D1F] truncate group-hover:text-[#0071E3] transition-colors">
                              @{username}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveFavorite(e, favoritesTab, username)}
                            className="w-6 h-6 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#FF3B30]/10 text-[#86868B] hover:text-[#FF3B30] flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
                            title={`Remover @${username} dos favoritos`}
                            aria-label={`Remover @${username}`}
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 flex flex-col items-center justify-center text-center gap-1.5 text-[#86868B]">
                        <div className="w-8 h-8 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#A1A1A6]">
                          <span className="material-symbols-outlined text-[16px]">bookmark_border</span>
                        </div>
                        <p className="text-xs font-medium text-[#1D1D1F]">
                          Nenhum perfil no {favoritesTab === 'instagram' ? 'Instagram' : 'TikTok'}
                        </p>
                        <p className="text-[11px] text-[#86868B] max-w-[200px] leading-tight">
                          Adicione perfis clicando na estrela ao visitar uma página.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quick Add Current Page Profile */}
                  {currentPageProfile && currentPageProfile.platform === favoritesTab && !(favorites[favoritesTab] || []).some(u => u.toLowerCase() === currentPageProfile.username.toLowerCase()) && (
                    <button
                      type="button"
                      onClick={handleAddCurrentFavorite}
                      className="w-full py-1.5 px-3 rounded-xl bg-[#0071E3]/10 hover:bg-[#0071E3]/15 text-[#0071E3] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-[#0071E3]/20"
                    >
                      <span className="material-symbols-outlined text-[15px]">add_circle</span>
                      <span>Favoritar @{currentPageProfile.username}</span>
                    </button>
                  )}
                </div>
              </>,
              document.body
            )}
          </div>
        </div>

        {/* Centered Modern Address Bar */}
        <div className="flex-1 flex justify-center px-2 min-w-0">
          <form onSubmit={handleAddressBarSubmit} className="w-full max-w-xl relative flex items-center">
            <span className="material-symbols-outlined absolute left-3.5 text-[#86868B] text-xs pointer-events-none">lock</span>
            <input
              type="text"
              className="w-full bg-[#F5F5F7] hover:bg-[#EFEFF2] focus:bg-white border border-transparent focus:border-[#0071E3] rounded-xl py-1.5 pl-9 pr-4 text-xs text-center text-[#1D1D1F] focus:outline-none focus:ring-4 focus:ring-[#0071E3]/15 transition-all font-medium placeholder:text-[#86868B]"
              value={addressBarVal}
              onChange={(e) => setAddressBarVal(e.target.value)}
              placeholder="Digite um usuário ou URL (Instagram, TikTok...)"
            />
          </form>
        </div>

        {/* Balanced spacer on right to ensure true visual center */}
        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 pointer-events-none select-none hidden lg:flex" aria-hidden="true">
          <div className="w-[230px]" />
        </div>
      </div>

      {/* Browser Viewport Area */}
      <div
        className="flex-1 min-h-0 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-[#E8E8ED] relative flex flex-col overflow-hidden"
        ref={containerRef}
        style={{ willChange: 'transform' }}
      >
        {isElectron ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-0 bg-[#FAFAFA]">
            <span className="spinner" style={{ width: '28px', height: '28px' }} />
            <p className="text-xs font-semibold text-text-secondary">Carregando navegador com IG Saver...</p>
          </div>
        ) : (
          renderMockView()
        )}
      </div>

      {/* Cookie Manager Modal Overlay */}
      {isCookiePopoverOpen && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={cookiePopoverRef}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8ED] shadow-[0_25px_60px_rgba(0,0,0,0.22)] p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
          >
            {cookieModalView === 'import' ? (
              <>
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#F0F0F2]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0071E3]/10 flex items-center justify-center text-[#0071E3]">
                      <span className="material-symbols-outlined text-[22px]">cookie</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1D1D1F]">Importar Cookies & Sessão</h3>
                      <p className="text-xs text-[#86868B]">Instagram e TikTok (Login persistente)</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCookiePopoverOpen(false);
                      setCookieModalView('import');
                    }}
                    className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                    title="Fechar"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Instructions */}
                <p className="text-xs text-[#515154] leading-relaxed">
                  Cole abaixo os cookies da sua conta (exportados via extensão <b>Cookie-Editor</b> em JSON ou texto <code>chave=valor</code>). A sessão fica salva permanentemente.
                </p>

                {/* Textarea with Quick Paste Button */}
                <div className="relative">
                  <textarea
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    rows={6}
                    placeholder={`[
  { "name": "sessionid", "value": "..." },
  { "name": "ds_user_id", "value": "..." }
]
OU
sessionid=...; ds_user_id=...;`}
                    className="w-full bg-[#F5F5F7] hover:bg-[#EFEFF2] focus:bg-white border border-[#E8E8ED] focus:border-[#0071E3] rounded-xl p-3 pr-24 text-xs font-mono text-[#1D1D1F] placeholder:text-[#A1A1A6] focus:outline-none focus:ring-4 focus:ring-[#0071E3]/15 transition-all resize-none"
                  />
                  <button
                    type="button"
                    onClick={handlePasteCookies}
                    className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#0071E3] bg-[#0071E3]/10 hover:bg-[#0071E3]/20 border border-[#0071E3]/20 transition-all active:scale-95 flex items-center gap-1 shadow-sm"
                    title="Colar cookies da área de transferência (Ctrl+V)"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_paste</span>
                    <span>Colar</span>
                  </button>
                </div>

                {/* Status feedback */}
                {cookieMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      cookieMessage.type === 'success'
                        ? 'bg-[#34C759]/10 text-[#248A3D] border border-[#34C759]/20'
                        : 'bg-[#FF3B30]/10 text-[#D70015] border border-[#FF3B30]/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {cookieMessage.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <span>{cookieMessage.text}</span>
                  </div>
                )}

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0F0F2]">
                  <button
                    type="button"
                    onClick={handleOpenSessionsView}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#FF3B30] bg-[#FF3B30]/8 hover:bg-[#FF3B30]/15 border border-[#FF3B30]/20 transition-all active:scale-95 flex items-center gap-1.5"
                    title="Ver contas conectadas e gerenciar sessões"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    Limpar Sessão
                  </button>

                  <div className="flex items-center gap-2">
                    {cookieInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCookieInput('');
                          setCookieMessage(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-all"
                      >
                        Limpar texto
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleImportCookies}
                      disabled={isImportingCookies || !cookieInput.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-[#0071E3]/25 transition-all flex items-center gap-1.5"
                    >
                      {isImportingCookies ? (
                        <>
                          <div className="spinner !w-3.5 !h-3.5 !border-white !border-t-transparent" />
                          <span>Importando...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">login</span>
                          <span>Salvar Cookies</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Sessions Manager Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#F0F0F2]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCookieModalView('import')}
                      className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                      title="Voltar"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <div>
                      <h3 className="text-sm font-bold text-[#1D1D1F]">Sessões Conectadas</h3>
                      <p className="text-xs text-[#86868B]">Gerencie as contas ativas no navegador integrado</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCookiePopoverOpen(false);
                      setCookieModalView('import');
                    }}
                    className="w-8 h-8 rounded-xl hover:bg-[#F5F5F7] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                    title="Fechar"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Info Text */}
                <p className="text-xs text-[#515154] leading-relaxed">
                  Selecione uma conta específica para desconectar ou limpe todas as sessões ativas do navegador:
                </p>

                {/* Connected Platforms List */}
                <div className="flex flex-col gap-2.5">
                  {/* Instagram Card */}
                  <div className="p-3.5 rounded-2xl bg-[#F5F5F7]/80 border border-[#E8E8ED] flex items-center justify-between gap-3 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FD1D1D]/15 via-[#E1306C]/15 to-[#405DE6]/15 text-[#E1306C] flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1D1D1F]">Instagram</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            activeSessions.instagram?.connected
                              ? 'bg-[#34C759]/15 text-[#248A3D]'
                              : 'bg-black/5 text-[#86868B]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${activeSessions.instagram?.connected ? 'bg-[#34C759]' : 'bg-[#86868B]'}`} />
                            {activeSessions.instagram?.connected ? 'Conectado' : 'Não conectado'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#86868B] truncate mt-0.5">
                          {activeSessions.instagram?.connected
                            ? (activeSessions.instagram.userId ? `ID: ${activeSessions.instagram.userId} (${activeSessions.instagram.cookieCount} cookies)` : `Sessão ativa (${activeSessions.instagram.cookieCount} cookies)`)
                            : 'Nenhuma sessão salva'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnectSession('instagram')}
                      disabled={isDisconnecting || !activeSessions.instagram?.connected}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#FF3B30] bg-[#FF3B30]/10 hover:bg-[#FF3B30]/15 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex-shrink-0"
                    >
                      Desconectar
                    </button>
                  </div>

                  {/* TikTok Card */}
                  <div className="p-3.5 rounded-2xl bg-[#F5F5F7]/80 border border-[#E8E8ED] flex items-center justify-between gap-3 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-black/5 text-[#1D1D1F] flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.34 0 .66.06.96.16V9.07a6.3 6.3 0 0 0-.96-.07A6.34 6.34 0 0 0 3 15.34a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.28 8.28 0 0 0 3.91 1.4V6.69z"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1D1D1F]">TikTok</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            activeSessions.tiktok?.connected
                              ? 'bg-[#34C759]/15 text-[#248A3D]'
                              : 'bg-black/5 text-[#86868B]'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${activeSessions.tiktok?.connected ? 'bg-[#34C759]' : 'bg-[#86868B]'}`} />
                            {activeSessions.tiktok?.connected ? 'Conectado' : 'Não conectado'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#86868B] truncate mt-0.5">
                          {activeSessions.tiktok?.connected
                            ? `Sessão ativa (${activeSessions.tiktok.cookieCount} cookies)`
                            : 'Nenhuma sessão salva'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnectSession('tiktok')}
                      disabled={isDisconnecting || !activeSessions.tiktok?.connected}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#FF3B30] bg-[#FF3B30]/10 hover:bg-[#FF3B30]/15 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex-shrink-0"
                    >
                      Desconectar
                    </button>
                  </div>
                </div>

                {/* Sessions Footer Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0F0F2]">
                  <button
                    type="button"
                    onClick={() => setCookieModalView('import')}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Voltar
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisconnectSession('all')}
                    disabled={isDisconnecting || (!activeSessions.instagram?.connected && !activeSessions.tiktok?.connected)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E02D22] active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-[#FF3B30]/25 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                    <span>Desconectar Todas as Contas</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
