import React, { useEffect, useState, useRef } from 'react';
import CustomSelect from './CustomSelect';
import CustomDateRangePicker from './CustomDateRangePicker';

const API = 'http://localhost:8000';

export default function Analytics({ triggerToast }) {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [period, setPeriod] = useState(1);
  const [isCustomPeriod, setIsCustomPeriod] = useState(false);
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState('24 horas');
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const datePickerRef = useRef(null);

  const [overview, setOverview] = useState(null);
  const [followers, setFollowers] = useState(null);
  const [bestTimes, setBestTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [chartMetric, setChartMetric] = useState('followers'); // 'followers' | 'reach' | 'views'

  // Post Performance Table filters & sort
  const [postStatusFilter, setPostStatusFilter] = useState('all'); // 'all' | 'posted' | 'pending'
  const [postFormatFilter, setPostFormatFilter] = useState('all'); // 'all' | 'reels' | 'carousel'
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postSortKey, setPostSortKey] = useState('views'); // 'views' | 'engagement' | 'likes' | 'recent'
  const [postSortOrder, setPostSortOrder] = useState('desc'); // 'desc' | 'asc'

  // Click outside to close custom range popover
  useEffect(() => {
    function handleClickOutside(event) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setCustomRangeOpen(false);
      }
    }
    if (customRangeOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [customRangeOpen]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        // Analytics é estritamente baseado nas contas oficiais conectadas
        const official = (Array.isArray(data) ? data : []).filter(
          a => a.auth_mode === 'official_api' || a.has_official_token || a.fb_ig_account_id
        );
        const listToUse = official;
        setAccounts(listToUse);

        // Se a conta selecionada foi renomeada, migrar suavemente para o novo nome
        if (selectedAccountRef.current) {
          const currentUsername = selectedAccountRef.current;
          const stillExists = listToUse.some(a => a.username === currentUsername);
          if (!stillExists) {
            const matchedByName = listToUse.find(a => a.display_name === currentUsername);
            if (matchedByName) {
              setSelectedAccount(matchedByName.username);
            } else if (listToUse.length > 0) {
              setSelectedAccount(listToUse[0].username);
            } else {
              setSelectedAccount('');
            }
          }
        } else if (listToUse.length > 0) {
          setSelectedAccount(listToUse[0].username);
        } else {
          setSelectedAccount('');
        }
      }
    } catch (e) {
      console.error("Error fetching accounts:", e);
    }
  };

  const periodRef = React.useRef(period);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  const selectedAccountRef = React.useRef(selectedAccount);
  useEffect(() => {
    selectedAccountRef.current = selectedAccount;
  }, [selectedAccount]);

  const isFirstMount = React.useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    fetchAll(false);

    // Silently refresh metrics from Instagram for the selected account in the background
    const refreshAccountAnalytics = async () => {
      try {
        const accParam = selectedAccount ? `?account_username=${encodeURIComponent(selectedAccount)}` : '';
        const res = await fetch(`${API}/api/analytics/collect${accParam}`, { method: 'POST' });
        if (res.ok) {
          fetchAll(true);
        }
      } catch (e) {
        console.error("Error refreshing analytics for account:", e);
      }
    };
    refreshAccountAnalytics();
  }, [period, isCustomPeriod, customStartDate, customEndDate, selectedAccount]);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const accParam = selectedAccountRef.current ? `&account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const btParam = selectedAccountRef.current ? `?account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      
      let overviewUrl = `${API}/api/analytics/overview?period=${periodRef.current}${accParam}`;
      if (isCustomPeriod && customStartDate && customEndDate) {
        overviewUrl = `${API}/api/analytics/overview?start_date=${encodeURIComponent(customStartDate)}&end_date=${encodeURIComponent(customEndDate)}${accParam}`;
      }

      const [ovRes, flRes, btRes] = await Promise.all([
        fetch(overviewUrl),
        fetch(`${API}/api/analytics/followers?period=90${accParam}`),
        fetch(`${API}/api/analytics/best-times${btParam}`)
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (flRes.ok) setFollowers(await flRes.json());
      if (btRes.ok) setBestTimes(await btRes.json());
    } catch (e) { console.error(e); }
    if (!silent) setLoading(false);
  };



  const syncAnalyticsSilently = async () => {
    try {
      const accParam = selectedAccountRef.current ? `?account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const res = await fetch(`${API}/api/analytics/collect${accParam}`, { method: 'POST' });
      if (res.ok) {
        await fetchAll(true);
      }
    } catch (e) {
      console.error("Error auto-syncing analytics:", e);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const accParam = selectedAccountRef.current ? `?account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const res = await fetch(`${API}/api/analytics/collect${accParam}`, { method: 'POST' });
      if (res.ok) {
        await fetchAll(true);
        triggerToast?.('Métricas do Instagram sincronizadas com sucesso! 🚀', 'success');
      } else {
        triggerToast?.('Não foi possível sincronizar no momento.', 'warning');
      }
    } catch (e) {
      console.error(e);
      triggerToast?.('Erro de conexão ao sincronizar métricas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchAccounts();

    let lastSync = 0;
    const handleSync = () => {
      const now = Date.now();
      if (now - lastSync < 3000) return;
      lastSync = now;
      fetchAccounts();
    };

    window.addEventListener('focus', handleSync);
    window.addEventListener('viraldog:accounts-updated', handleSync);

    // Auto-sync a cada 10 minutos (600.000 ms)
    const metricsSyncInterval = setInterval(() => {
      syncAnalyticsSilently();
    }, 10 * 60 * 1000);

    const initializeAndCollect = async () => {
      // 1. Carrega dados em cache primeiro
      await fetchAll(false);
      // 2. Dispara coleta em background silenciosamente
      await syncAnalyticsSilently();
    };
    initializeAndCollect();

    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('viraldog:accounts-updated', handleSync);
      clearInterval(metricsSyncInterval);
    };
  }, []);


  const formatNum = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n?.toString() || '0';
  };

  // Simple bar chart renderer using pure CSS
  const renderBarChart = (data, valueKey, labelKey, maxBars = 10) => {
    if (!data || data.length === 0) {
      return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0', fontSize: '13px' }}>Sem dados disponíveis para o período selecionado.</p>;
    }
    const sliced = data.slice(0, maxBars);
    const maxVal = Math.max(...sliced.map(d => d[valueKey] || 0), 1);
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sliced.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', width: '80px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {item[labelKey] || `#${i + 1}`}
            </span>
            <div style={{ flex: 1, height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.max((item[valueKey] / maxVal) * 100, 2)}%`,
                background: 'linear-gradient(90deg, #0071E3 0%, #4da3ff 100%)',
                boxShadow: '0 0 10px rgba(0, 113, 227, 0.15)',
                borderRadius: '8px',
                transition: 'width 0.6s ease',
                display: 'flex', alignItems: 'center', paddingLeft: '8px'
              }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: '#fff' }}>
                  {item[valueKey]?.toFixed?.(1) || item[valueKey]}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // State for chart hover tooltip
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Multi-metric Trend Chart (Followers, Daily Reach, Video Views)
  const renderTrendChart = () => {
    let rawData = [];
    let metricLabel = 'Seguidores';
    let metricUnit = 'seguidores';
    let currentValue = 0;
    let growthBadge = null;

    if (chartMetric === 'followers') {
      rawData = followers?.snapshots || [];
      metricLabel = 'Seguidores';
      metricUnit = 'seguidores';
      currentValue = hoveredPoint ? hoveredPoint.raw.value : (followers?.current_followers || 0);
      if (followers?.growth !== undefined) {
        growthBadge = (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
            followers.growth >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
          }`}>
            <span className="material-symbols-outlined text-[12px]">
              {followers.growth >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            {followers.growth >= 0 ? '+' : ''}{Math.abs(followers.growth)} ({followers.growth_percent}%)
          </span>
        );
      }
    } else if (chartMetric === 'reach') {
      metricLabel = 'Alcance Diário';
      metricUnit = 'contas';
      const mapByDate = {};
      (overview?.posts || []).forEach(p => {
        const d = p.scheduled_time ? new Date(p.scheduled_time).toISOString().split('T')[0] : 'Hoje';
        mapByDate[d] = (mapByDate[d] || 0) + (Number(p.reach) || 0);
      });
      rawData = Object.keys(mapByDate).sort().map(d => ({ date: d, value: mapByDate[d] }));
      currentValue = hoveredPoint ? hoveredPoint.raw.value : (overview?.total_reach || 0);
    } else if (chartMetric === 'views') {
      metricLabel = 'Visualizações';
      metricUnit = 'views';
      const mapByDate = {};
      (overview?.posts || []).forEach(p => {
        const d = p.scheduled_time ? new Date(p.scheduled_time).toISOString().split('T')[0] : 'Hoje';
        mapByDate[d] = (mapByDate[d] || 0) + (Number(p.plays) || Number(p.reach) || 0);
      });
      rawData = Object.keys(mapByDate).sort().map(d => ({ date: d, value: mapByDate[d] }));
      currentValue = hoveredPoint ? hoveredPoint.raw.value : (overview?.total_plays || 0);
    }

    const dataNormalized = rawData.map(d => ({
      date: d.date,
      value: d.value !== undefined ? d.value : (d.followers || 0)
    }));

    if (!dataNormalized.length) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#E8E8ED] rounded-2xl bg-[#F5F5F7]/30 text-center gap-3 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-[#0071E3]/5 flex items-center justify-center text-[#0071E3]">
            <span className="material-symbols-outlined text-[22px]">query_stats</span>
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-bold text-[#1D1D1F]">Sem dados para {metricLabel}</h4>
            <p className="text-[10px] text-[#86868B] max-w-[260px] leading-relaxed">
              Publique novos posts ou force a sincronização para exibir a curva de desempenho.
            </p>
          </div>
        </div>
      );
    }

    const data = dataNormalized.length === 1 
      ? [{ ...dataNormalized[0], date: new Date(new Date(dataNormalized[0].date).getTime() - 86400000).toISOString() }, dataNormalized[0]]
      : dataNormalized;

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const minVal = Math.min(...data.map(d => d.value));
    const range = (maxVal - minVal) || Math.max(1, Math.round(maxVal * 0.1));
    const paddedMin = Math.max(0, minVal - Math.round(range * 0.05));
    const paddedMax = maxVal + Math.round(range * 0.05);
    const effectiveRange = (paddedMax - paddedMin) || 1;

    const svgWidth = 540;
    const svgHeight = 110;
    const paddingX = 16;
    const paddingY = 14;
    const chartW = svgWidth - paddingX * 2;
    const chartH = svgHeight - paddingY * 2;

    const points = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * chartW;
      const y = paddingY + chartH - ((d.value - paddedMin) / effectiveRange) * chartH;
      return { x, y, raw: d };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) * 0.45;
      const cpY1 = p0.y;
      const cpX2 = p1.x - (p1.x - p0.x) * 0.45;
      const cpY2 = p1.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${svgHeight} L ${points[0].x} ${svgHeight} Z`;
    const activePoint = hoveredPoint || points[points.length - 1];

    return (
      <div className="flex flex-col gap-1 relative select-none">
        <div className="flex justify-between items-baseline mb-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-extrabold text-[#1D1D1F] tracking-tight">
              {formatNum(currentValue)}
            </span>
            {growthBadge}
          </div>

          <div className="text-[10px] font-bold text-[#86868B]">
            {hoveredPoint ? new Date(hoveredPoint.raw.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Total no período'}
          </div>
        </div>

        {/* SVG Chart Container */}
        <div className="relative w-full overflow-visible">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-[95px] overflow-visible"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0071E3" stopOpacity="0.32" />
                <stop offset="60%" stopColor="#0071E3" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0071E3" stopOpacity="0.00" />
              </linearGradient>
              <filter id="glowTrend" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#E8E8ED" strokeDasharray="3 3" opacity="0.6" />
            <line x1={paddingX} y1={paddingY + chartH / 2} x2={svgWidth - paddingX} y2={paddingY + chartH / 2} stroke="#E8E8ED" strokeDasharray="3 3" opacity="0.6" />
            <line x1={paddingX} y1={paddingY + chartH} x2={svgWidth - paddingX} y2={paddingY + chartH} stroke="#E8E8ED" strokeWidth="1" opacity="0.8" />

            <path d={areaD} fill="url(#trendGradient)" />

            <path
              d={pathD}
              fill="none"
              stroke="#0071E3"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glowTrend)"
            />

            {activePoint && (
              <line
                x1={activePoint.x}
                y1={paddingY}
                x2={activePoint.x}
                y2={svgHeight}
                stroke="#0071E3"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.4"
              />
            )}

            {points.map((p, idx) => (
              <g key={idx} className="cursor-pointer">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(p)}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoveredPoint === p ? 4.5 : 3}
                  fill="#FFFFFF"
                  stroke="#0071E3"
                  strokeWidth={hoveredPoint === p ? 2.5 : 2}
                  className="transition-all duration-150"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 113, 227, 0.35))' }}
                />
              </g>
            ))}
          </svg>
        </div>

        <div className="flex justify-between items-center text-[9px] font-semibold text-[#86868B] px-1 mt-0.5">
          <span>{data.length > 0 ? new Date(data[0].date).toLocaleDateString('pt-BR') : ''}</span>
          <span className="text-[#0071E3] font-bold">● {formatNum(currentValue)} {metricUnit}</span>
          <span>{data.length > 0 ? new Date(data[data.length - 1].date).toLocaleDateString('pt-BR') : ''}</span>
        </div>
      </div>
    );
  };

  // Filtered and sorted posts for table
  const filteredAndSortedPosts = React.useMemo(() => {
    let list = overview?.posts || [];

    if (postStatusFilter === 'posted') {
      list = list.filter(p => p.status === 'posted');
    } else if (postStatusFilter === 'pending') {
      list = list.filter(p => p.status === 'pending');
    }

    if (postFormatFilter === 'reels') {
      list = list.filter(p => p.post_type !== 'carousel');
    } else if (postFormatFilter === 'carousel') {
      list = list.filter(p => p.post_type === 'carousel');
    }

    if (postSearchQuery.trim()) {
      const q = postSearchQuery.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.caption || '').toLowerCase().includes(q) ||
        String(p.post_id || '').includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (postSortKey === 'views') {
        valA = a.reach || 0;
        valB = b.reach || 0;
      } else if (postSortKey === 'plays') {
        valA = a.plays || 0;
        valB = b.plays || 0;
      } else if (postSortKey === 'engagement') {
        valA = a.engagement || 0;
        valB = b.engagement || 0;
      } else if (postSortKey === 'rate') {
        valA = a.engagement_rate || 0;
        valB = b.engagement_rate || 0;
      } else if (postSortKey === 'likes') {
        valA = a.likes || 0;
        valB = b.likes || 0;
      } else if (postSortKey === 'shares') {
        valA = a.shares || 0;
        valB = b.shares || 0;
      } else if (postSortKey === 'saves') {
        valA = a.saves || 0;
        valB = b.saves || 0;
      } else if (postSortKey === 'reposts') {
        valA = a.reposts || 0;
        valB = b.reposts || 0;
      } else if (postSortKey === 'recent') {
        valA = new Date(a.scheduled_time || 0).getTime();
        valB = new Date(b.scheduled_time || 0).getTime();
      }
      return postSortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [overview?.posts, postStatusFilter, postFormatFilter, postSearchQuery, postSortKey, postSortOrder]);

  const handleSort = (key) => {
    if (postSortKey === key) {
      setPostSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setPostSortKey(key);
      setPostSortOrder('desc');
    }
  };

  const getSortIcon = (key) => {
    if (postSortKey !== key) {
      return <span className="material-symbols-outlined text-[13px] text-[#C7C7CC] group-hover:text-[#86868B] transition-colors">unfold_more</span>;
    }
    return (
      <span className="material-symbols-outlined text-[13px] text-[#0071E3] transition-colors">
        {postSortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
      </span>
    );
  };

  const handleDateRangeApply = (s, e, shortcutLabel, periodDays) => {
    if (shortcutLabel) {
      setSelectedPeriodLabel(shortcutLabel);
      if (periodDays) {
        setPeriod(periodDays);
        setIsCustomPeriod(false);
        setCustomStartDate('');
        setCustomEndDate('');
      } else {
        setCustomStartDate(s);
        setCustomEndDate(e);
        setIsCustomPeriod(true);
      }
    } else {
      // Data selecionada manualmente no calendário: mostra as datas
      setCustomStartDate(s);
      setCustomEndDate(e);
      setIsCustomPeriod(true);
      const formatPt = (iso) => {
        if (!iso) return '';
        const parts = iso.split('-');
        if (parts.length < 3) return iso;
        return `${parts[2]}/${parts[1]}`;
      };
      setSelectedPeriodLabel(`${formatPt(s)} até ${formatPt(e)}`);
    }
    setCustomRangeOpen(false);
  };

  if (loading) {
    return (
      <div className="w-full h-[calc(100vh-120px)] flex flex-col items-center justify-center gap-3">
        <div className="spinner"></div>
        <span className="text-xs text-[#86868B] font-medium">Carregando métricas da API Oficial...</span>
      </div>
    );
  }

  // Pre-calculate likes, shares, saves, reposts summary totals
  const totalPostsCount = overview?.total_posts || 0;
  const totalLikesCount = overview?.total_likes !== undefined
    ? overview.total_likes
    : (overview?.posts || []).reduce((acc, p) => acc + (p.likes || 0), 0);
  const totalRepostsCount = overview?.total_reposts !== undefined
    ? overview.total_reposts
    : (overview?.posts || []).reduce((acc, p) => acc + (p.reposts || 0), 0);
  const avgLikesVal = totalPostsCount > 0 ? (totalLikesCount / totalPostsCount).toFixed(1) : '0';
  const avgSharesVal = totalPostsCount > 0 ? ((overview?.total_shares || 0) / totalPostsCount).toFixed(1) : '0';
  const avgSavesVal = totalPostsCount > 0 ? ((overview?.total_saves || 0) / totalPostsCount).toFixed(1) : '0';
  const avgRepostsVal = totalPostsCount > 0 ? (totalRepostsCount / totalPostsCount).toFixed(1) : '0';

  return (
    <div className="w-full h-[calc(100vh-80px)] flex flex-col gap-3.5 fade-in overflow-hidden">

      {/* 1. Header Toolbar (Apple Minimalist) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Custom Date Calendar Dropdown */}
          <div className="relative" ref={datePickerRef}>
            <button
              type="button"
              onClick={() => setCustomRangeOpen(!customRangeOpen)}
              className={`h-9 px-3.5 text-xs font-bold rounded-xl border transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-2xs ${
                customRangeOpen
                  ? 'bg-white border-[#0071E3] text-[#0071E3] ring-2 ring-[#0071E3]/20 shadow-sm'
                  : 'bg-[#F5F5F7] border-[#E8E8ED] hover:bg-white hover:border-[#D1D1D6] text-[#1D1D1F]'
              }`}
              title="Filtrar por período"
            >
              <span className="material-symbols-outlined text-[17px] text-[#0071E3]">calendar_month</span>
              <span>{selectedPeriodLabel}</span>
              <span className="material-symbols-outlined text-[15px] text-[#86868B]">expand_more</span>
            </button>

            {/* Popover Custom Date Range Picker */}
            {customRangeOpen && (
              <div className="absolute top-full left-0 mt-2 z-50">
                <CustomDateRangePicker
                  startDate={customStartDate}
                  endDate={customEndDate}
                  activeShortcut={selectedPeriodLabel}
                  onApply={handleDateRangeApply}
                  onClose={() => setCustomRangeOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Account Filter Dropdown */}
          <CustomSelect
            options={[
              { value: '', label: 'Todas as contas', icon: 'groups' },
              ...accounts.map(acc => ({
                value: acc.username,
                label: `@${acc.display_name || acc.username}`,
                avatar: acc.avatar_url ? (acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`) : null,
                username: acc.username,
              }))
            ]}
            value={selectedAccount}
            onChange={setSelectedAccount}
            size="filter"
            align="left"
            className="min-w-[210px]"
          />
        </div>

        {/* Sync Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className={`px-3.5 py-1.5 rounded-xl border border-[#E8E8ED] bg-white hover:bg-[#F5F5F7] active:scale-[0.98] text-[#1D1D1F] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
            isSyncing ? 'opacity-70 cursor-not-allowed' : ''
          }`}
          title="Sincronizar métricas mais recentes do Instagram Graph API"
        >
          <span className={`material-symbols-outlined text-[16px] text-[#0071E3] ${isSyncing ? 'animate-spin' : ''}`}>
            {isSyncing ? 'progress_activity' : 'sync'}
          </span>
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
        </button>
      </div>

      {/* 2. Top Executive KPI Cards (Grid 5 columns: Engajamento, Curtidas, Compartilhamentos, Salvos, Republicados) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 flex-shrink-0">
        {/* Card 1: Engajamento Médio */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 flex items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] xl:text-[11px] font-bold text-[#86868B] uppercase tracking-[0.06em] truncate">Engajamento Médio</span>
            <div className="text-xl xl:text-2xl font-extrabold text-[#30D158] tracking-tight leading-none">
              {overview?.avg_engagement_rate || 0}%
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
              {formatNum(overview?.total_engagement || 0)} interações
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0 border border-green-500/15">
            <span className="material-symbols-outlined text-[18px]">favorite</span>
          </div>
        </div>

        {/* Card 2: Total de Curtidas */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 flex items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] xl:text-[11px] font-bold text-[#86868B] uppercase tracking-[0.06em] truncate">Total de Curtidas</span>
            <div className="text-xl xl:text-2xl font-extrabold text-[#FF2D55] tracking-tight leading-none">
              {formatNum(totalLikesCount)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
              {avgLikesVal} média por post
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-[#FF2D55] flex items-center justify-center shrink-0 border border-rose-500/15">
            <span className="material-symbols-outlined text-[18px]">thumb_up</span>
          </div>
        </div>

        {/* Card 3: Compartilhamentos de Vídeos */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 flex items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] xl:text-[11px] font-bold text-[#86868B] uppercase tracking-[0.06em] truncate">Compartilhamentos</span>
            <div className="text-xl xl:text-2xl font-extrabold text-[#AF52DE] tracking-tight leading-none">
              {formatNum(overview?.total_shares || 0)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
              {avgSharesVal} média por vídeo
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-[#AF52DE] flex items-center justify-center shrink-0 border border-purple-500/15">
            <span className="material-symbols-outlined text-[18px]">share</span>
          </div>
        </div>

        {/* Card 4: Salvos em Posts */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 flex items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] xl:text-[11px] font-bold text-[#86868B] uppercase tracking-[0.06em] truncate">Salvos em Posts</span>
            <div className="text-xl xl:text-2xl font-extrabold text-[#FF9500] tracking-tight leading-none">
              {formatNum(overview?.total_saves || 0)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
              {avgSavesVal} média por post
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-[#FF9500] flex items-center justify-center shrink-0 border border-amber-500/15">
            <span className="material-symbols-outlined text-[18px]">bookmark</span>
          </div>
        </div>

        {/* Card 5: Republicados */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-3.5 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 flex items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] xl:text-[11px] font-bold text-[#86868B] uppercase tracking-[0.06em] truncate">Republicados</span>
            <div className="text-xl xl:text-2xl font-extrabold text-[#00C7BE] tracking-tight leading-none">
              {formatNum(totalRepostsCount)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
              {avgRepostsVal} média por post
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#00C7BE]/10 text-[#00C7BE] flex items-center justify-center shrink-0 border border-[#00C7BE]/15">
            <span className="material-symbols-outlined text-[18px]">repeat</span>
          </div>
        </div>
      </div>

      {/* 3. Mid Section: Tendência & Evolução (Chart) + Melhores Horários */}
      <div className="grid grid-cols-12 gap-3.5 flex-shrink-0">
        {/* Trend Chart (Col 8) */}
        <div className="col-span-8 bg-white border border-[#E8E8ED] rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#0071E3]">trending_up</span>
              <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Tendência & Evolução</span>
            </div>
            {/* Apple Segmented Metric Toggle */}
            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-lg border border-[#E8E8ED]">
              {[
                { id: 'followers', label: 'Seguidores' },
                { id: 'reach', label: 'Alcance' },
                { id: 'views', label: 'Visualizações' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setChartMetric(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 ${
                    chartMetric === m.id
                      ? 'bg-white text-[#1D1D1F] shadow-xs'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-[160px]">
            {renderTrendChart()}
          </div>
        </div>

        {/* Melhores Horários (Col 4) */}
        <div className="col-span-4 bg-white border border-[#E8E8ED] rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-500">schedule</span>
              <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Melhores Horários</span>
            </div>
            <span className="text-[10px] text-[#86868B] font-medium">por engajamento</span>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            {bestTimes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-5 px-3 border border-dashed border-[#E8E8ED] rounded-xl bg-[#F5F5F7]/30 text-center gap-2 animate-fadeIn">
                <span className="material-symbols-outlined text-[20px] text-[#86868B]">hourglass_empty</span>
                <p className="text-[10px] text-[#86868B] max-w-[190px] leading-relaxed">Sem dados suficientes no período para identificar picos de audiência.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bestTimes.map((bt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-[#F5F5F7]/60 hover:bg-[#F5F5F7] transition-all border border-[#E8E8ED]/50">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-bold flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-[#1D1D1F]">{bt.day}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#0071E3]">{String(bt.hour).padStart(2, '0')}:00h</span>
                      {bt.avg_engagement > 0 && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          {bt.avg_engagement}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: Desempenho por Post (Executive Toolbar + Interactive Table) */}
      <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Toolbar Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#E8E8ED] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Desempenho por Post</span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#F5F5F7] text-[#86868B] border border-[#E8E8ED]">
              {filteredAndSortedPosts.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Status Filter Pills (Todos | Postados | Pendentes) */}
            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-lg border border-[#E8E8ED]">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'posted', label: 'Postados' },
                { id: 'pending', label: 'Pendentes' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setPostStatusFilter(s.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 cursor-pointer ${
                    postStatusFilter === s.id
                      ? 'bg-white text-[#1D1D1F] shadow-xs'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Format Filter Pills */}
            <div className="flex items-center bg-[#F5F5F7] p-0.5 rounded-lg border border-[#E8E8ED]">
              {[
                { id: 'all', label: 'Todos Formatos' },
                { id: 'reels', label: 'Reels' },
                { id: 'carousel', label: 'Feed' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setPostFormatFilter(f.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 cursor-pointer ${
                    postFormatFilter === f.id
                      ? 'bg-white text-[#1D1D1F] shadow-xs'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Keyword Search Input */}
            <div className="relative w-44 flex items-center">
              <span className="material-symbols-outlined text-[16px] text-[#86868B] absolute left-2.5 top-0 bottom-0 flex items-center justify-center pointer-events-none select-none">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar post..."
                value={postSearchQuery}
                onChange={(e) => setPostSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-7 text-xs bg-[#F5F5F7] border border-[#E8E8ED] rounded-lg text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:border-[#0071E3] focus:bg-white transition-all flex items-center"
              />
              {postSearchQuery && (
                <button
                  type="button"
                  onClick={() => setPostSearchQuery('')}
                  className="absolute right-2 top-0 bottom-0 flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] p-0.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <span className="material-symbols-outlined text-[14px] leading-none block">close</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        {filteredAndSortedPosts.length > 0 ? (
          <div className="custom-scrollbar overflow-y-auto flex-1 min-h-0 pt-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8E8ED] sticky top-0 bg-white z-10">
                  <th 
                    onClick={() => handleSort('recent')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none pl-2 pr-3 text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span>Post</span>
                      {getSortIcon('recent')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('views')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Alcance</span>
                      {getSortIcon('views')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('engagement')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Engajamento</span>
                      {getSortIcon('engagement')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('likes')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Curtidas</span>
                      {getSortIcon('likes')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('shares')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Compartilhamentos</span>
                      {getSortIcon('shares')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('saves')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Salvos</span>
                      {getSortIcon('saves')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('reposts')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Republicados</span>
                      {getSortIcon('reposts')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('plays')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Views</span>
                      {getSortIcon('plays')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('rate')}
                    className="pb-2.5 pt-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider cursor-pointer hover:text-[#1D1D1F] group select-none px-2.5 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Taxa</span>
                      {getSortIcon('rate')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8ED]/60">
                {filteredAndSortedPosts.map((p, i) => {
                  const isPending = p.status === 'pending';
                  return (
                    <tr key={p.post_id || i} className="hover:bg-[#F5F5F7]/50 transition-colors group">
                      <td className="py-2.5 pl-2 pr-3">
                        <div className="flex items-center gap-2.5 min-w-0 max-w-[280px]">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isPending
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              : 'bg-[#0071E3]/8 text-[#0071E3] border-[#0071E3]/15'
                          }`}>
                            <span className="material-symbols-outlined text-[16px]">
                              {isPending ? 'schedule' : p.post_type === 'carousel' ? 'photo_library' : 'movie'}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[11px] font-bold text-[#1D1D1F] truncate hover:text-[#0071E3] transition-colors" title={p.caption || p.title}>
                                {p.title || (p.caption ? p.caption.slice(0, 32) + '...' : `Post #${p.post_id}`)}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${
                                isPending
                                  ? 'bg-amber-500/15 text-amber-700 border border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                              }`}>
                                {isPending ? 'Pendente' : 'Postado'}
                              </span>
                            </div>
                            <span className="text-[9px] text-[#86868B] flex items-center gap-1 mt-0.5 truncate">
                              <span className="capitalize font-semibold text-[#0071E3]">{p.post_type === 'carousel' ? 'Feed' : 'Reels'}</span>
                              {p.scheduled_time && (
                                <span>• {new Date(p.scheduled_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.reach)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.engagement)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.likes)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.shares)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.saves)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : (p.reposts || 0)}</td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] font-medium text-[#1D1D1F]">{isPending ? '-' : formatNum(p.plays)}</td>
                      <td className="py-2.5 px-2.5 text-center">
                        {isPending ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Aguardando
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            p.engagement_rate >= 5 
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                              : p.engagement_rate >= 2 
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' 
                                : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          }`}>
                            {p.engagement_rate}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : overview?.posts?.length > 0 ? (
          /* Filter returned no results */
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#E8E8ED] rounded-xl bg-[#F5F5F7]/30 text-center gap-2.5 my-2">
            <span className="material-symbols-outlined text-[24px] text-[#86868B]">filter_list_off</span>
            <div className="flex flex-col gap-0.5">
              <h4 className="text-xs font-bold text-[#1D1D1F]">Nenhum post encontrado</h4>
              <p className="text-[10px] text-[#86868B]">Tente alterar os filtros ou o termo de busca pesquisado.</p>
            </div>
            <button
              onClick={() => { setPostStatusFilter('all'); setPostFormatFilter('all'); setPostSearchQuery(''); }}
              className="text-[11px] font-semibold text-[#0071E3] hover:underline mt-1 cursor-pointer"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          /* Empty posts */
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#E8E8ED] rounded-xl bg-[#F5F5F7]/30 text-center gap-3 my-2">
            <div className="w-12 h-12 rounded-xl bg-[#0071E3]/5 flex items-center justify-center text-[#0071E3]">
              <span className="material-symbols-outlined text-[24px]">bar_chart</span>
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold text-[#1D1D1F]">Sem dados de desempenho</h4>
              <p className="text-[10px] text-[#86868B] max-w-[280px] leading-relaxed">
                Nenhum post encontrado no período. Publique posts ou clique em Sincronizar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
