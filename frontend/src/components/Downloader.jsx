import { useState, useEffect, useRef, useCallback } from 'react';

export default function Downloader({ triggerToast, isVisible = true }) {
  const isElectron = !!(window.electronAPI);
  const containerRef = useRef(null);
  const favoritesButtonRef = useRef(null);
  const hasShown = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [addressBarVal, setAddressBarVal] = useState('https://www.instagram.com/');
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);

  useEffect(() => {
    if (!isElectron) return;

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

    if (window.electronAPI.onIgFavoritesMenuClosed) {
      window.electronAPI.onIgFavoritesMenuClosed(() => {
        setIsFavoritesOpen(false);
      });
    }

    return () => {
      if (window.electronAPI.removeIgBrowserNavigated) {
        window.electronAPI.removeIgBrowserNavigated();
      }
      if (window.electronAPI.removeDownloadStatus) {
        window.electronAPI.removeDownloadStatus();
      }
      if (window.electronAPI.removeIgFavoritesMenuClosed) {
        window.electronAPI.removeIgFavoritesMenuClosed();
      }
    };
  }, [isElectron, triggerToast]);

  useEffect(() => {
    if (!isFavoritesOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!favoritesButtonRef.current?.contains(event.target)) {
        setIsFavoritesOpen(false);
        window.electronAPI.setIgFavoritesMenu?.({ open: false, anchorX: 0 });
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFavoritesOpen(false);
        window.electronAPI.setIgFavoritesMenu?.({ open: false, anchorX: 0 });
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFavoritesOpen]);

  const isUnmounted = useRef(false);
  const hasInitialized = useRef(false);

  // Show/hide the Electron BrowserView based on tab visibility
  useEffect(() => {
    if (!isElectron) return;
    if (!hasInitialized.current) return;

    if (isVisible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        window.electronAPI.showIgBrowser({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
        hasShown.current = true;
      }
    } else {
      window.electronAPI.setIgFavoritesMenu?.({ open: false, anchorX: 0 });
      window.electronAPI.hideIgBrowser();
      hasShown.current = false;
    }
  }, [isVisible, isElectron]);

  useEffect(() => {
    if (!isElectron || !containerRef.current) return;
    isUnmounted.current = false;
    hasInitialized.current = true;

    let animationFrameId = null;
    const updateBounds = (forceShow = false) => {
      if (isUnmounted.current || !containerRef.current || !isVisible) return;

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        if (isUnmounted.current || !containerRef.current || !isVisible) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (forceShow || !hasShown.current) {
            window.electronAPI.showIgBrowser({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            });
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

  const handleHome = useCallback(() => {
    if (isElectron) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoHome();
    }
  }, [isElectron]);

  const handleFavoritesToggle = useCallback(() => {
    if (!isElectron || !favoritesButtonRef.current || !containerRef.current) return;
    const nextOpen = !isFavoritesOpen;
    const buttonRect = favoritesButtonRef.current.getBoundingClientRect();
    const browserRect = containerRef.current.getBoundingClientRect();
    const anchorX = Math.max(0, buttonRect.left - browserRect.left);
    setIsFavoritesOpen(nextOpen);
    window.electronAPI.setIgFavoritesMenu?.({ open: nextOpen, anchorX });
  }, [isElectron, isFavoritesOpen]);

  const handleAddressBarSubmit = useCallback((e) => {
    e.preventDefault();
    if (isElectron && addressBarVal.trim()) {
      setIsLoading(true);
      window.electronAPI.igBrowserGoToUrl(addressBarVal);
    }
  }, [isElectron, addressBarVal]);

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
    <div className="w-full h-[calc(100vh-80px)] flex flex-col fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[#1D1D1F]">Baixar vídeos</h1>
          <p className="text-[11px] text-[#86868B] mt-0.5">Navegue pelo Instagram e salve conteúdos na pasta configurada.</p>
        </div>
      </div>

      {/* Browser Card Container */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-[#E8E8ED] flex flex-col overflow-hidden"
           style={{ willChange: 'transform' }}>
        {/* Browser Header / URL bar */}
        <div className="h-14 border-b border-[#E8E8ED] bg-[#F5F5F7]/80 backdrop-blur-xs flex items-center px-4 gap-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[#86868B] disabled:opacity-30 transition-all active:scale-95"
              onClick={handleBack}
              disabled={!canGoBack}
              title="Voltar"
            >
              <span className="material-symbols-outlined text-[15px] font-bold">arrow_back_ios_new</span>
            </button>
            <button
              className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[#86868B] disabled:opacity-30 transition-all active:scale-95"
              onClick={handleForward}
              disabled={!canGoForward}
              title="Avançar"
            >
              <span className="material-symbols-outlined text-[15px] font-bold">arrow_forward_ios</span>
            </button>
            <button
              className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[#86868B] transition-all active:scale-95"
              onClick={handleReload}
              title="Recarregar"
            >
              {isLoading ? <div className="spinner !w-3.5 !h-3.5" /> : <span className="material-symbols-outlined text-[17px]">refresh</span>}
            </button>
            <button
              className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[#86868B] transition-all active:scale-95"
              onClick={handleHome}
              title="Instagram Home"
            >
              <span className="material-symbols-outlined text-[17px]">home</span>
            </button>
            <div className="relative">
              <button
                ref={favoritesButtonRef}
                className={`w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center transition-all active:scale-95 ${
                  isFavoritesOpen ? 'bg-black/5 text-[#F5B301]' : 'text-[#86868B]'
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
            </div>
          </div>

          <form onSubmit={handleAddressBarSubmit} className="flex-1 relative flex items-center max-w-xl mx-auto">
            <span className="material-symbols-outlined absolute left-3.5 text-[#86868B] text-xs z-10">lock</span>
            <input
              type="text"
              className="w-full bg-white border border-[#E8E8ED] rounded-lg py-1.5 pl-9 pr-4 text-[11px] text-center text-text-primary focus:outline-none focus:border-[#0071E3] focus:ring-4 focus:ring-[#0071E3]/15 transition-all shadow-2xs"
              value={addressBarVal}
              onChange={(e) => setAddressBarVal(e.target.value)}
              placeholder="Digite o usuário do Instagram ou cole uma URL..."
            />
          </form>

          <div className="flex items-center gap-1.5 px-3 py-1 border border-[#E8E8ED] rounded-lg text-[10px] font-bold tracking-wide uppercase bg-white text-text-primary shadow-2xs">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse"></div>
            <span>IG Saver Active</span>
          </div>
        </div>

        {/* Browser viewport area */}
        <div className="flex-1 relative flex flex-col overflow-hidden bg-[#FAFAFA]" ref={containerRef}>
          {isElectron ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary gap-3 bg-[#FAFAFA] pointer-events-none z-0">
              <span className="spinner" style={{ width: '28px', height: '28px' }} />
              <p className="text-xs font-semibold">Carregando Instagram com IG Saver...</p>
            </div>
          ) : (
            renderMockView()
          )}
        </div>
      </div>
    </div>
  );
}
