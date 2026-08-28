import React, { useEffect, useState } from 'react';
import CustomSelect from './CustomSelect';

const API = 'http://localhost:8000';

export default function Analytics({ triggerToast }) {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [period, setPeriod] = useState(1);
  const [overview, setOverview] = useState(null);
  const [followers, setFollowers] = useState(null);
  const [bestTimes, setBestTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({
    total_downloads: 0,
    total_accounts: 0,
    pending_posts: 0,
    completed_posts: 0,
    failed_posts: 0
  });

  const handleManualSync = async () => {
    setIsSyncing(true);
    triggerToast?.('Sincronizando métricas em tempo real...', 'info');
    try {
      const accParam = selectedAccountRef.current ? `?account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const res = await fetch(`${API}/api/analytics/collect${accParam}`, { method: 'POST' });
      if (res.ok) {
        await fetchAll(true);
        triggerToast?.('Métricas sincronizadas com sucesso! ✅', 'success');
      } else {
        triggerToast?.('Erro ao coletar dados do Instagram.', 'error');
      }
    } catch (e) {
      console.error(e);
      triggerToast?.('Erro de conexão ao sincronizar métricas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);

        // Se a conta selecionada foi renomeada, migrar suavemente para o novo nome
        if (selectedAccountRef.current) {
          const currentUsername = selectedAccountRef.current;
          const stillExists = data.some(a => a.username === currentUsername);
          if (!stillExists) {
            const matchedByName = data.find(a => a.display_name === currentUsername);
            if (matchedByName) {
              setSelectedAccount(matchedByName.username);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching accounts:", e);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API}/api/dashboard`);
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data);
      }
    } catch (e) {
      console.error("Error fetching dashboard stats:", e);
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
  }, [period, selectedAccount]);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const accParam = selectedAccountRef.current ? `&account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const btParam = selectedAccountRef.current ? `?account_username=${encodeURIComponent(selectedAccountRef.current)}` : '';
      const [ovRes, flRes, btRes] = await Promise.all([
        fetch(`${API}/api/analytics/overview?period=${periodRef.current}${accParam}`),
        fetch(`${API}/api/analytics/followers?period=90${accParam}`),
        fetch(`${API}/api/analytics/best-times${btParam}`)
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (flRes.ok) setFollowers(await flRes.json());
      if (btRes.ok) setBestTimes(await btRes.json());
    } catch (e) { console.error(e); }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
    fetchDashboardStats();

    const handleSync = () => {
      fetchAccounts();
      fetchDashboardStats();
    };

    window.addEventListener('focus', handleSync);
    window.addEventListener('viraldog:accounts-updated', handleSync);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleSync();
    });

    const interval = setInterval(fetchDashboardStats, 60000);

    const initializeAndCollect = async () => {
      // 1. Fetch old/cached data first so it displays instantly
      await fetchAll(false);
      
      // 2. Trigger analytics collection in the background silently
      try {
        const res = await fetch(`${API}/api/analytics/collect`, { method: 'POST' });
        if (res.ok) {
          // 3. Re-fetch all data once collection finishes to update the UI silently
          await fetchAll(true);
        }
      } catch (e) {
        console.error("Error collecting analytics in background:", e);
      }
    };
    initializeAndCollect();

    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('viraldog:accounts-updated', handleSync);
      clearInterval(interval);
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

  // Follower growth chart (Smooth SVG Curved Area Chart in Apple/SaaS style)
  const renderFollowerChart = () => {
    if (!followers?.snapshots?.length) {
      return (
        <div className="flex flex-col items-center justify-center py-6 px-4 border border-dashed border-[#E8E8ED] rounded-2xl bg-[#F5F5F7]/30 text-center gap-3 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-[#0071E3]/5 flex items-center justify-center text-[#0071E3] animate-pulse">
            <span className="material-symbols-outlined text-[22px]">trending_up</span>
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-bold text-[#1D1D1F]">Nenhum snapshot coletado</h4>
            <p className="text-[10px] text-[#86868B] max-w-[260px] leading-relaxed">
              O sistema gera snapshots diários para acompanhar seu crescimento. Aguarde a primeira coleta ou atualize em tempo real.
            </p>
          </div>
        </div>
      );
    }

    const rawData = followers.snapshots;
    // If only 1 data point, synthesize a 2-point line for clean visualization
    const data = rawData.length === 1 
      ? [{ ...rawData[0], date: new Date(new Date(rawData[0].date).getTime() - 86400000).toISOString() }, rawData[0]]
      : rawData;

    const maxFollowers = Math.max(...data.map(d => d.followers), 1);
    const minFollowers = Math.min(...data.map(d => d.followers));
    const range = (maxFollowers - minFollowers) || Math.max(1, Math.round(maxFollowers * 0.1));
    const paddedMin = Math.max(0, minFollowers - Math.round(range * 0.05));
    const paddedMax = maxFollowers + Math.round(range * 0.05);
    const effectiveRange = (paddedMax - paddedMin) || 1;

    const svgWidth = 540;
    const svgHeight = 110;
    const paddingX = 16;
    const paddingY = 14;
    const chartW = svgWidth - paddingX * 2;
    const chartH = svgHeight - paddingY * 2;

    const points = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * chartW;
      const y = paddingY + chartH - ((d.followers - paddedMin) / effectiveRange) * chartH;
      return { x, y, raw: d };
    });

    // Generate smooth cubic bezier SVG path
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
              {formatNum(hoveredPoint ? hoveredPoint.raw.followers : followers.current_followers)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
              followers.growth >= 0 
                ? 'bg-emerald-500/10 text-emerald-600' 
                : 'bg-rose-500/10 text-rose-600'
            }`}>
              <span className="material-symbols-outlined text-[12px]">
                {followers.growth >= 0 ? 'trending_up' : 'trending_down'}
              </span>
              {followers.growth >= 0 ? '+' : ''}{Math.abs(followers.growth)} ({followers.growth_percent}%)
            </span>
          </div>

          <div className="text-[10px] font-bold text-[#86868B]">
            {hoveredPoint ? new Date(hoveredPoint.raw.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Total acumulado'}
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
              <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0071E3" stopOpacity="0.32" />
                <stop offset="60%" stopColor="#0071E3" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0071E3" stopOpacity="0.00" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Subtle background grid lines */}
            <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#E8E8ED" strokeDasharray="3 3" opacity="0.6" />
            <line x1={paddingX} y1={paddingY + chartH / 2} x2={svgWidth - paddingX} y2={paddingY + chartH / 2} stroke="#E8E8ED" strokeDasharray="3 3" opacity="0.6" />
            <line x1={paddingX} y1={paddingY + chartH} x2={svgWidth - paddingX} y2={paddingY + chartH} stroke="#E8E8ED" strokeWidth="1" opacity="0.8" />

            {/* Smooth Area Gradient Fill */}
            <path d={areaD} fill="url(#followerGradient)" />

            {/* Glowing Spline Line */}
            <path
              d={pathD}
              fill="none"
              stroke="#0071E3"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />

            {/* Vertical Guide Line on Hover */}
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

            {/* Interactive Points on Line */}
            {points.map((p, idx) => (
              <g key={idx} className="cursor-pointer">
                {/* Larger transparent target for easy hover */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(p)}
                />
                {/* Visible Data Point Node */}
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
          <span className="text-[#0071E3] font-bold">● {formatNum(followers.current_followers)} seguidores</span>
          <span>{data.length > 0 ? new Date(data[data.length - 1].date).toLocaleDateString('pt-BR') : ''}</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}><div className="spinner"></div></div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-80px)] flex flex-col gap-4 fade-in overflow-hidden">

      {/* Period Selector & Account Filter (Top Left Header Row) */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <div style={{ display: 'flex', backgroundColor: 'var(--bg-primary)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
          {[1, 7, 30, 90].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`nav-button ${period === p ? 'active' : ''}`}
              style={{ width: '90px', justifyContent: 'center', padding: '6px 12px', fontSize: '12px' }}>
              {p === 1 ? '24 horas' : `${p} dias`}
            </button>
          ))}
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
          className="min-w-[200px]"
        />

        {/* Live Sync Button */}
        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing}
          className="h-9 px-3.5 rounded-xl bg-white hover:bg-[#F5F5F7] border border-[#E8E8ED] text-xs font-bold text-[#1D1D1F] flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50"
          title="Sincronizar métricas do Instagram em tempo real"
        >
          <span className={`material-symbols-outlined text-[16px] text-[#0071E3] ${isSyncing ? 'animate-spin' : ''}`}>
            {isSyncing ? 'progress_activity' : 'sync'}
          </span>
          <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Métricas'}</span>
        </button>
      </div>

      {/* Overview Cards (Migrated from Resumo) */}
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        {/* Contas Vinculadas */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Contas Vinculadas</span>
            <div className="text-3xl font-extrabold text-[#1D1D1F] tracking-tight leading-none">
              {dashboardStats.total_accounts}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-1.5 truncate">Instagrams ativos no Kanban</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#0071E3]/8 text-[#0071E3] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">group</span>
          </div>
        </div>

        {/* Mídias Baixadas */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Mídias Baixadas</span>
            <div className="text-3xl font-extrabold text-[#1D1D1F] tracking-tight leading-none">
              {dashboardStats.total_downloads}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-1.5 truncate">Vídeos salvos localmente</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-500/8 text-purple-600 flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">download</span>
          </div>
        </div>

        {/* Fila de Postagem */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Fila de Postagem</span>
            <div className="flex gap-4 items-center mt-1">
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold text-[#0071E3] leading-none">{dashboardStats.pending_posts}</span>
                <span className="text-[9px] text-[#86868B] font-semibold mt-0.5">Pendentes</span>
              </div>
              <div className="w-[1px] h-6 bg-[#E8E8ED]" />
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold text-[#30D158] leading-none">{dashboardStats.completed_posts}</span>
                <span className="text-[9px] text-[#86868B] font-semibold mt-0.5">Publicados</span>
              </div>
              {dashboardStats.failed_posts > 0 && (
                <>
                  <div className="w-[1px] h-6 bg-[#E8E8ED]" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-extrabold text-[#BA1A1A] leading-none">{dashboardStats.failed_posts}</span>
                    <span className="text-[9px] text-[#86868B] font-semibold mt-0.5">Falhas</span>
                  </div>
                </>
              )}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-2">Posts agendados no sistema</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/8 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">pending_actions</span>
          </div>
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        {/* Alcance Total */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Alcance Total</span>
            <div className="text-3xl font-extrabold text-[#1D1D1F] tracking-tight leading-none">
              {formatNum(overview?.total_reach || 0)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-1.5">{overview?.total_posts || 0} posts no período</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/8 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">analytics</span>
          </div>
        </div>

        {/* Engajamento Médio */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Engajamento Médio</span>
            <div className="text-3xl font-extrabold text-[#30D158] tracking-tight leading-none">
              {overview?.avg_engagement_rate || 0}%
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-1.5">{formatNum(overview?.total_engagement || 0)} interações totais</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-green-500/8 text-green-600 flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">favorite</span>
          </div>
        </div>

        {/* Reproduções */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 hover:scale-[1.015] hover:shadow-[0_12px_48px_rgba(0,0,0,0.05)] transition-all duration-300 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.08em]">Reproduções</span>
            <div className="text-3xl font-extrabold text-[#0071E3] tracking-tight leading-none">
              {formatNum(overview?.total_plays || 0)}
            </div>
            <p className="text-[10px] text-[#86868B] font-medium mt-1.5">{formatNum(overview?.total_saves || 0)} salvamentos</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-500/8 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[22px]">play_circle</span>
          </div>
        </div>
      </div>

      {/* Follower Growth and Best posting times */}
      <div className="grid grid-cols-2 gap-4 flex-shrink-0">
        {/* Follower Growth */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 shadow-xs flex flex-col gap-3">
          <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Evolução de Seguidores</span>
          <div className="mt-1 flex-1">
            {renderFollowerChart()}
          </div>
        </div>

        {/* Best Posting Times */}
        <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 shadow-xs flex flex-col gap-3">
          <span className="text-xs font-bold text-[#1D1D1F] tracking-tight">Melhores Horários</span>
          <div className="mt-1 flex-1">
            {bestTimes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 border border-dashed border-[#E8E8ED] rounded-2xl bg-[#F5F5F7]/30 text-center gap-2.5 animate-fadeIn">
                <span className="material-symbols-outlined text-[24px] text-[#86868B]">hourglass_empty</span>
                <p className="text-[10px] text-[#86868B] max-w-[220px] leading-relaxed">Sem dados suficientes. Publique mais posts e colete analytics.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {bestTimes.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-[#F5F5F7] border border-[#E8E8ED] rounded-xl hover:-translate-y-0.5 transition-all duration-205 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-white border border-[#E8E8ED] flex items-center justify-center shrink-0 text-xs">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-[#1D1D1F]">{t.day} às {t.hour}h</div>
                        <div className="text-[9px] text-[#86868B] truncate">
                          {t.sample_count ? `${t.sample_count} amostras` : t.note || ''}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                      {t.avg_engagement}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Posts Performance Table */}
      <div className="bg-white border border-[#E8E8ED] rounded-2xl p-5 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden">
        <span className="text-xs font-bold text-[#1D1D1F] tracking-tight mb-3">Desempenho por Post</span>
        {overview?.posts?.length > 0 ? (
          <div className="custom-scrollbar overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8E8ED]">
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Post</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Alcance</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Engajamento</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Curtidas</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Salvos</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Views</th>
                  <th className="pb-3 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Taxa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8ED]/60">
                {overview.posts.map((p, i) => (
                  <tr key={i} className="hover:bg-[#F5F5F7]/35 transition-colors group">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5 min-w-0 max-w-[280px]">
                        <div className="w-8 h-8 rounded-lg bg-[#0071E3]/8 text-[#0071E3] flex items-center justify-center shrink-0 border border-[#0071E3]/15">
                          <span className="material-symbols-outlined text-[16px]">
                            {p.post_type === 'carousel' ? 'photo_library' : 'movie'}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] font-bold text-[#1D1D1F] truncate hover:text-[#0071E3] transition-colors" title={p.caption || p.title}>
                            {p.title || `Post #${p.post_id}`}
                          </span>
                          <span className="text-[9px] text-[#86868B] flex items-center gap-1 mt-0.5 truncate">
                            <span className="capitalize font-semibold text-[#0071E3]">{p.post_type === 'carousel' ? 'Feed' : 'Reels'}</span>
                            {p.scheduled_time && <span>• {new Date(p.scheduled_time).toLocaleDateString('pt-BR')}</span>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-[11px] font-medium text-[#1D1D1F]">{formatNum(p.reach)}</td>
                    <td className="py-3 text-[11px] font-medium text-[#1D1D1F]">{formatNum(p.engagement)}</td>
                    <td className="py-3 text-[11px] font-medium text-[#1D1D1F]">{formatNum(p.likes)}</td>
                    <td className="py-3 text-[11px] font-medium text-[#1D1D1F]">{formatNum(p.saves)}</td>
                    <td className="py-3 text-[11px] font-medium text-[#1D1D1F]">{formatNum(p.plays)}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        p.engagement_rate >= 5 
                          ? 'bg-emerald-500/10 text-emerald-600' 
                          : p.engagement_rate >= 2 
                            ? 'bg-amber-500/10 text-amber-600' 
                            : 'bg-rose-500/10 text-rose-600'
                      }`}>
                        {p.engagement_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#E8E8ED] rounded-2xl bg-[#F5F5F7]/30 text-center gap-3.5 my-2">
            <div className="w-14 h-14 rounded-2xl bg-[#0071E3]/5 flex items-center justify-center text-[#0071E3]">
              <span className="material-symbols-outlined text-[26px]">bar_chart</span>
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold text-[#1D1D1F]">Sem dados de desempenho</h4>
              <p className="text-[10px] text-[#86868B] max-w-[280px] leading-relaxed">
                Nenhum post publicado com métricas encontradas no período. Agende posts no publicador ou force a coleta de métricas.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
