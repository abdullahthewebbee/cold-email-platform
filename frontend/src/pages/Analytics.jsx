import { useState, useEffect, useRef, useMemo } from 'react';
import CampaignPerformanceChart from '../components/CampaignPerformanceChart';
import DomainReputationTimeline from '../components/DomainReputationTimeline';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import DatePicker from '../components/ui/DatePicker';
import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

/* ─── count-up hook ─── */
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = null;
    let raf;
    const animate = (ts) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ─── custom TradingView-style tooltip ─── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter(p => p.value != null && p.dataKey !== 'prevSent' && p.value > 0);
  if (!visible.length) return null;
  const dateLabel = label
    ? new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-lg)',
      padding: '10px 14px',
      fontSize: 11.5,
      minWidth: 160,
      fontFamily: 'inherit',
    }}>
      <div style={{
        fontWeight: 700,
        color: 'var(--gold-dark)',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        letterSpacing: '.4px',
        textTransform: 'uppercase',
      }}>
        {dateLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visible.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-3)', fontSize: 11 }}>
              <span style={{ width: 8, height: 3, borderRadius: 2, background: p.color, display: 'inline-block', flexShrink: 0 }} />
              {p.name}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── date helpers ─── */
/* "Jul 17 – Oct 14, 2026" — follows the selected range (presets, custom dates, compare) */
function formatRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const a = new Date(startDate + 'T00:00:00');
  const b = new Date(endDate + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return '';
  const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const mdy = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (startDate === endDate) return mdy(b);
  if (a.getFullYear() === b.getFullYear()) return `${md(a)} – ${mdy(b)}`;
  return `${mdy(a)} – ${mdy(b)}`;
}

function fillDateRange(dataMap, startDate, endDate) {
  const result = [];
  if (!startDate || !endDate) return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    const iso = localIso(cur);
    result.push(dataMap[iso] || { date: iso, sent: 0, totalOpens: 0, uniqueOpens: 0, totalReplies: 0, totalClicks: 0, uniqueClicks: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function localIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function buildPresets(serverToday) {
  const t = serverToday || new Date();
  const todayStr = localIso(t);
  const d = (offset) => { const dt = new Date(t); dt.setDate(dt.getDate() + offset); return localIso(dt); };
  const monday = (dt) => { const x = new Date(dt); const day = x.getDay(); x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); return x; };
  const lastWeekEnd = new Date(monday(t)); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastWeekStart = localIso(monday(lastWeekEnd));
  const lastMonthStart = localIso(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  const lastMonthEnd = localIso(new Date(t.getFullYear(), t.getMonth(), 0));
  return [
    { label: '7D',   full: 'Last 7 Days',  start: d(-6),         end: todayStr },
    { label: 'Week', full: 'Last Week',     start: lastWeekStart, end: localIso(lastWeekEnd) },
    { label: '30D',  full: 'Last 30 Days',  start: d(-29),        end: todayStr },
    { label: 'Month',full: 'Last Month',    start: lastMonthStart,end: lastMonthEnd },
    { label: '90D',  full: 'Last 90 Days',  start: d(-89),        end: todayStr },
  ];
}

/* ─── series config ─── */
const SERIES = [
  { key: 'sent',         name: 'Sent',          stroke: 'var(--chart-sent)',           fill: 'var(--chart-sent)' },
  { key: 'totalOpens',   name: 'Total Opens',   stroke: 'var(--chart-opened)',         fill: 'var(--chart-opened)' },
  { key: 'uniqueOpens',  name: 'Unique Opens',  stroke: 'var(--chart-opened-unique)',  fill: 'var(--chart-opened-unique)' },
  { key: 'totalReplies', name: 'Replies',       stroke: 'var(--chart-replied)',        fill: 'var(--chart-replied)' },
  { key: 'totalClicks',  name: 'Total Clicks',  stroke: 'var(--chart-clicked)',        fill: 'var(--chart-clicked)' },
  { key: 'uniqueClicks', name: 'Unique Clicks', stroke: 'var(--chart-clicked-unique)', fill: 'var(--chart-clicked-unique)' },
];

/* ─── mini sparkline ─── */
function Spark({ data, dataKey, color }) {
  if (!data || data.length < 2) return <div style={{ width: 56, height: 24 }} />;
  const vals = data.map(d => d[dataKey] || 0);
  const max = Math.max(...vals, 1);
  const w = 56, h = 24;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const trend = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={`sp-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── trend badge ─── */
function TrendBadge({ trend }) {
  if (!trend) return <span style={{ fontSize: 10, color: 'var(--text-4)' }}>—</span>;
  const up = trend.dir === 'up';
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      color: up ? 'var(--green-dark)' : 'var(--red)',
      background: up ? 'var(--green-light)' : 'var(--red-light)',
      padding: '1px 6px',
      borderRadius: 4,
    }}>
      {up ? '↑' : '↓'} {trend.pct}%
    </span>
  );
}

/* ─── Stat chip (Aegis .stat-chip) ─── */
function StatCard({ icon, iconBg, iconColor, label, value, sub, delta, sparkData, sparkKey, sparkColor }) {
  const numericTarget = typeof value === 'number' ? value : parseInt(value) || 0;
  const animVal = useCountUp(numericTarget);
  const isPercent = typeof value === 'string' && value.endsWith('%');
  const display = isPercent ? `${animVal}%` : animVal;

  return (
    <div className="stat-chip an-stat">
      <div className="stat-chip-icon" style={{ background: iconBg }}>
        <svg viewBox="0 0 20 20" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          {icon}
        </svg>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-chip-value">{display}</div>
        <div className="stat-chip-label">
          {label}
          {delta && <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}><TrendBadge trend={delta} /></span>}
          {delta && sub && <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 6 }}>{sub}</span>}
        </div>
      </div>
      {sparkData && <div className="an-spark"><Spark data={sparkData} dataKey={sparkKey} color={sparkColor} /></div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════ */
export default function Analytics() {
  const [campaigns, setCampaigns] = useState(() => apiCache.get('/campaigns') || []);
  const [currentChoice, setCurrentChoice] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [serverToday, setServerToday] = useState(null);

  const [presets, setPresets] = useState(() => buildPresets(new Date()));
  const [activePreset, setActivePreset] = useState('7D');
  const defaultRange = presets[0];
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [showCustom, setShowCustom] = useState(false);

  const [hideSeries, setHideSeries] = useState(() =>
    Object.fromEntries(SERIES.map(s => [s.key, false]))
  );
  const initializedRef = useRef(false);
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 0 });
  const activeChartIdxRef = useRef(null);
  const chartContainerRef = useRef(null);
  const [compareMode, setCompareMode] = useState(false);
  const [prevAnalyticsData, setPrevAnalyticsData] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [camps, offsetData] = await Promise.all([
          api.get('/campaigns'),
          api.get('/settings/time-offset').catch(() => ({ time_offset_days: 0 })),
        ]);
        setCampaigns(camps);
        const off = parseInt(offsetData.time_offset_days || 0, 10);
        const t = new Date(); t.setDate(t.getDate() + off);
        setServerToday(t);
        const newPresets = buildPresets(t);
        setPresets(newPresets);
        setStartDate(newPresets[0].start);
        setEndDate(newPresets[0].end);
      } catch { setError('Failed to load analytics'); }
    })();
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (selectedIds.length) selectedIds.forEach(id => params.append('campaign_id', id));
    api.get(`/analytics/daily?${params}`)
      .then(data => setAnalyticsData(data))
      .catch(() => setAnalyticsData([]));
  }, [startDate, endDate, selectedIds]);

  useEffect(() => {
    if (!compareMode || !startDate || !endDate) { setPrevAnalyticsData([]); return; }
    const start = new Date(startDate + 'T00:00:00');
    const end   = new Date(endDate   + 'T00:00:00');
    const days  = Math.round((end - start) / 86400000) + 1;
    const prevEnd   = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
    const fmt = d => d.toISOString().slice(0, 10);
    const params = new URLSearchParams({ start_date: fmt(prevStart), end_date: fmt(prevEnd) });
    if (selectedIds.length) selectedIds.forEach(id => params.append('campaign_id', id));
    api.get(`/analytics/daily?${params}`)
      .then(d => setPrevAnalyticsData(d))
      .catch(() => setPrevAnalyticsData([]));
  }, [compareMode, startDate, endDate, selectedIds]);

  const chartData = useMemo(() => {
    const dailyMap = {};
    analyticsData.forEach(row => {
      const d = row.date;
      if (!dailyMap[d]) dailyMap[d] = { date: d, sent: 0, totalOpens: 0, uniqueOpens: 0, totalReplies: 0, totalClicks: 0, uniqueClicks: 0 };
      dailyMap[d].sent         += row.sent;
      dailyMap[d].totalOpens   += row.total_opens;
      dailyMap[d].uniqueOpens  += row.unique_opens;
      dailyMap[d].totalReplies += row.total_replies;
      dailyMap[d].totalClicks  += row.total_clicks;
      dailyMap[d].uniqueClicks += row.unique_clicks;
    });
    const filled = fillDateRange(dailyMap, startDate, endDate);
    if (compareMode && prevAnalyticsData.length) {
      const prevMap = {};
      prevAnalyticsData.forEach(row => {
        if (!prevMap[row.date]) prevMap[row.date] = { sent: 0 };
        prevMap[row.date].sent += row.emails_sent || 0;
      });
      const prevDates = Object.keys(prevMap).sort();
      const prevFilled = prevDates.length ? fillDateRange(prevMap, prevDates[0], prevDates[prevDates.length - 1]) : [];
      filled.forEach((row, i) => { row.prevSent = prevFilled[i]?.sent || 0; });
    }
    return filled;
  }, [analyticsData, prevAnalyticsData, compareMode, startDate, endDate]);

  useEffect(() => {
    if (!initializedRef.current && chartData.length > 0 && chartData.some(d => SERIES.some(s => d[s.key] > 0))) {
      setHideSeries(prev => {
        const next = { ...prev };
        SERIES.forEach(s => { next[s.key] = chartData.every(d => d[s.key] === 0); });
        return next;
      });
      initializedRef.current = true;
    }
  }, [chartData]);

  useEffect(() => { setZoomRange({ start: 0, end: Math.max(0, chartData.length - 1) }); }, [chartData]);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoomRange(prev => {
        const len = chartData.length;
        if (len <= 2) return prev;
        const windowSize = prev.end - prev.start + 1;
        const pivot = activeChartIdxRef.current ?? Math.floor((prev.start + prev.end) / 2);
        const factor = e.deltaY < 0 ? 0.75 : 1.35;
        const newSize = Math.max(3, Math.min(len, Math.round(windowSize * factor)));
        const pivotRatio = windowSize > 1 ? (pivot - prev.start) / (windowSize - 1) : 0.5;
        let newStart = Math.round(pivot - pivotRatio * (newSize - 1));
        let newEnd = newStart + newSize - 1;
        if (newStart < 0) { newStart = 0; newEnd = newSize - 1; }
        if (newEnd >= len) { newEnd = len - 1; newStart = Math.max(0, len - newSize); }
        return { start: newStart, end: newEnd };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chartData]);

  const displayData = chartData.slice(zoomRange.start, zoomRange.end + 1);
  const handleChartMouseMove = (state) => {
    if (state?.activeTooltipIndex != null)
      activeChartIdxRef.current = zoomRange.start + state.activeTooltipIndex;
  };

  const filtered = selectedIds.length ? campaigns.filter(c => selectedIds.includes(String(c.id))) : campaigns;
  const filteredStatsByCampaign = useMemo(() => {
    const map = {};
    analyticsData.forEach(row => {
      const cid = String(row.campaign_id);
      if (!map[cid]) map[cid] = { sent: 0, replies: 0, totalOpens: 0, totalClicks: 0 };
      map[cid].sent        += row.sent;
      map[cid].replies     += row.total_replies;
      map[cid].totalOpens  += row.total_opens;
      map[cid].totalClicks += row.total_clicks;
    });
    return map;
  }, [analyticsData]);

  const rangeSent    = chartData.reduce((a, d) => a + d.sent, 0);
  const rangeReplies = chartData.reduce((a, d) => a + d.totalReplies, 0);
  const rangeClicks  = chartData.reduce((a, d) => a + d.totalClicks, 0);

  const totalRepliesFromStats = filtered.reduce((a, c) => a + (c.stats?.replies || 0), 0);
  const totalSentFromStats    = filtered.reduce((a, c) => a + (c.stats?.emails_sent || 0), 0);
  const replyRate  = totalSentFromStats > 0 ? Math.round((totalRepliesFromStats / totalSentFromStats) * 100) : 0;
  const clickRate  = rangeSent > 0 ? Math.round((rangeClicks / rangeSent) * 100) : 0;
  const totalOpened = filtered.reduce((a, c) => a + ((c.stats?.open_rate || 0) * (c.stats?.emails_sent || 0)), 0);
  const totalSentForRates = filtered.reduce((a, c) => a + (c.stats?.emails_sent || 0), 0);
  const openRate   = totalSentForRates > 0 ? Math.round((totalOpened / totalSentForRates) * 100) : 0;

  const trendFor = (key) => {
    if (chartData.length < 4) return null;
    const mid = Math.floor(chartData.length / 2);
    const first  = chartData.slice(0, mid).reduce((a, d) => a + (d[key] || 0), 0);
    const second = chartData.slice(mid).reduce((a, d) => a + (d[key] || 0), 0);
    if (first === 0 && second === 0) return null;
    if (first === 0) return { dir: 'up', pct: 100 };
    const pct = Math.round(((second - first) / first) * 100);
    if (pct === 0) return null;
    return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
  };

  const formatXDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const dayLen = displayData.length;
    if (dayLen > 30) {
      // show month + day for longer ranges
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  // smart tick interval — never let ticks overlap
  const xTickInterval = (() => {
    const len = displayData.length;
    if (len <= 7)  return 0;        // show every tick
    if (len <= 14) return 1;        // every 2nd
    if (len <= 30) return 2;        // every 3rd
    if (len <= 60) return 6;        // weekly
    return Math.floor(len / 10);    // ~10 ticks max
  })();

  const applyPreset = (p) => {
    setActivePreset(p.label);
    setStartDate(p.start);
    setEndDate(p.end);
    setShowCustom(false);
  };

  const activePresetObj = presets.find(p => p.label === activePreset);
  const hasActivity = rangeSent > 0;

  return (
    <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '24px 28px', background: 'var(--bg)' }}>

      <style>{`
        /* Analytics-only bits Aegis has no class for */
        .an-stat { flex: 1 1 0; }
        .an-spark { flex-shrink: 0; max-width: 84px; opacity: .9; }
        .an-head-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .an-tabs { display: inline-flex; gap: 2px; padding: 3px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-full); }
        .an-tabs .tab-pill { padding: 4px 11px; border: none; background: transparent; border-radius: var(--radius-full); font-size: 11.5px; font-weight: 600; color: var(--text-3); cursor: pointer; white-space: nowrap; transition: background var(--transition), color var(--transition); }
        .an-tabs .tab-pill:hover { background: var(--surface-3); color: var(--text); }
        .an-tabs .tab-pill.active { background: var(--gold-dark); color: var(--text-inverted); }
        .an-chart-wrap { position: relative; padding: 10px 12px 4px; background: var(--surface); }
        .an-chart-empty { position: absolute; inset: 8px 12px 34px; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; gap: 2px; z-index: 2; }
        .an-chart-empty svg { width: 22px; height: 22px; margin-bottom: 2px; }
        .an-chart-empty-title { font-size: 12.5px; font-weight: 700; color: var(--text-2); }
        .an-chart-empty-sub { font-size: 11.5px; color: var(--text-3); }
        .an-legend { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; padding: 10px 14px 14px; background: var(--surface); border-top: 1px solid var(--border); }
        .an-legend-btn { position: relative; display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 2px; padding: 10px 12px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); cursor: pointer; overflow: hidden; text-align: left; transition: opacity var(--transition), border-color var(--transition); }
        .an-legend-btn:hover { border-color: var(--border-dark); }
        .an-legend-btn.is-off { opacity: .35; }
        .an-legend-swatch { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .an-legend-name { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
        .an-legend-count { font-family: var(--font-serif); font-size: 18px; font-weight: 700; color: var(--text); line-height: 1.1; }
        @media (max-width: 1100px) { .an-legend { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 520px)  { .an-legend { grid-template-columns: repeat(2, 1fr); } }
        .an-stats { margin-bottom: 0; }
      `}</style>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* ── HERO ── */}
      <div className="hero-banner is-quiet">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <div className="page-hero-eyebrow">Analytics · {formatRangeLabel(startDate, endDate)}</div>
            <div className="page-hero-title">Email Performance Overview</div>
            <div className="page-hero-sub">
              {activePresetObj?.full || 'Custom range'} · {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="page-hero-actions">
            <Link to="/campaigns/add" className="btn-hero-solid is-on-light">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M10 4v12M4 10h12"/>
              </svg>
              New Campaign
            </Link>
            <button className="btn-hero-ghost is-on-light">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14l4-4 3 3 5-6"/><path d="M14 14h4v4"/>
              </svg>
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* ── BIG STAT CARDS ── */}
      <div className="stat-chips-row an-stats">
        <StatCard
          icon={<path d="M3 10l14-7-7 14v-7L3 10z"/>}
          iconBg="var(--icon-bg-blue)" iconColor="var(--blue-dark)"
          label="Total Sent"
          value={rangeSent}
          delta={trendFor('sent')}
          sparkData={chartData} sparkKey="sent" sparkColor="var(--blue)"
        />
        <StatCard
          icon={<><path d="M4 10l4 4 8-8"/></>}
          iconBg="var(--icon-bg-gold)" iconColor="var(--gold-dark)"
          label="Open Rate"
          value={`${openRate}%`}
          delta={null}
          sparkData={chartData} sparkKey="totalOpens" sparkColor="var(--gold-dark)"
        />
        <StatCard
          icon={<><circle cx="10" cy="10" r="7"/><path d="M10 7v3M10 13v.5"/></>}
          iconBg="var(--icon-bg-green)" iconColor="var(--green-dark)"
          label="Reply Rate"
          value={`${replyRate}%`}
          delta={trendFor('totalReplies')}
          sparkData={chartData} sparkKey="totalReplies" sparkColor="var(--green)"
        />
        <StatCard
          icon={<><path d="M2 14l6-6 4 4 6-7"/></>}
          iconBg="var(--icon-bg-orange)" iconColor="var(--orange-dark)"
          label="Click Rate"
          value={`${clickRate}%`}
          delta={trendFor('totalClicks')}
          sparkData={chartData} sparkKey="totalClicks" sparkColor="var(--orange)"
        />
      </div>

      {/* ── CHART CARD ── */}
      <div className="card">
        {/* head */}
        <div className="card-header">
          <span className="card-title">Activity Timeline</span>
          <div className="an-head-controls">
            <div className="an-tabs">
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`tab-pill${activePreset === p.label ? ' active' : ''}`}
                >{p.label}</button>
              ))}
              <button
                onClick={() => { setActivePreset('custom'); setShowCustom(v => !v); }}
                className={`tab-pill${activePreset === 'custom' ? ' active' : ''}`}
              >Custom</button>
            </div>
            <button
              onClick={() => setCompareMode(v => !v)}
              className={`btn btn-xs ${compareMode ? 'btn-gold' : 'btn-outline'}`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeDasharray="2 1.5"/>
              </svg>
              Compare
            </button>
          </div>
        </div>

        {/* custom date row */}
        {showCustom && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-3)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              From <DatePicker value={startDate} onChange={v => { setStartDate(v); setActivePreset('custom'); }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              To <DatePicker value={endDate} onChange={v => { setEndDate(v); setActivePreset('custom'); }} />
            </label>
          </div>
        )}

        <div className="an-chart-wrap">
          {!hasActivity && (
            <div className="an-chart-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,18 8,12 12,16 18,8 22,12"/>
              </svg>
              <div className="an-chart-empty-title">No activity in this range</div>
              <div className="an-chart-empty-sub">Send a campaign to see metrics here</div>
            </div>
          )}
          <div
            ref={chartContainerRef}
            style={{ width: '100%', height: 220, opacity: hasActivity ? 1 : 0.35 }}
          >
            <ResponsiveContainer>
              <ReAreaChart data={displayData} onMouseMove={handleChartMouseMove} margin={{ top: 10, right: 8, left: -8, bottom: 8 }}>
                <defs>
                  {SERIES.map(s => (
                    <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={s.stroke} stopOpacity={0.4} />
                      <stop offset="75%" stopColor={s.stroke} stopOpacity={0.03} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="1 4"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10.5, fill: 'var(--text-3)', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
                  tickFormatter={formatXDate}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  dy={8}
                  interval={xTickInterval}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  wrapperStyle={{ zIndex: 1000 }}
                  cursor={{
                    stroke: 'var(--border-dark)',
                    strokeWidth: 1,
                    strokeDasharray: '3 3',
                  }}
                />
                {SERIES.map(s => (
                  <Area
                    key={s.key}
                    name={s.name}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.stroke}
                    strokeWidth={2}
                    fill={`url(#grad-${s.key})`}
                    fillOpacity={1}
                    hide={hideSeries[s.key]}
                    animationDuration={700}
                    dot={false}
                    activeDot={{ r: 5, fill: s.stroke, stroke: 'var(--surface)', strokeWidth: 2 }}
                  />
                ))}
                {compareMode && (
                  <Area
                    type="monotone"
                    dataKey="prevSent"
                    name="Prev. Sent"
                    stroke="var(--border-dark)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    fill="none"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ReAreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* legend */}
        <div className="an-legend">
          {SERIES.map(s => {
            const total = displayData.reduce((a, d) => a + (d[s.key] || 0), 0);
            return (
              <button
                key={s.key}
                onClick={() => setHideSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                className={`an-legend-btn${hideSeries[s.key] ? ' is-off' : ''}`}
              >
                <span className="an-legend-swatch" style={{ background: s.stroke }} />
                <span className="an-legend-name">{s.name}</span>
                <span className="an-legend-count">{total.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CAMPAIGN BREAKDOWN ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Campaign Breakdown</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={currentChoice}
              onChange={e => setCurrentChoice(e.target.value)}
              className="form-select"
              style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: 12 }}
            >
              <option value="">Filter by campaign…</option>
              {campaigns.filter(c => !selectedIds.includes(String(c.id))).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-xs"
              onClick={() => {
                if (currentChoice && !selectedIds.includes(currentChoice))
                  setSelectedIds([...selectedIds, currentChoice]);
                setCurrentChoice('');
              }}
              disabled={!currentChoice}
            >Add</button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            {selectedIds.map(id => {
              const camp = campaigns.find(c => String(c.id) === id);
              return (
                <span key={id} className="ep-tag-removable">
                  {camp?.name || id}
                  <button
                    className="ep-tag-remove"
                    onClick={() => setSelectedIds(selectedIds.filter(x => x !== id))}
                    aria-label="Remove"
                  >×</button>
                </span>
              );
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            {campaigns.length === 0 ? 'No campaigns yet.' : 'No matching campaigns.'}
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th style={{ textAlign: 'center' }}>Sent</th>
                  <th style={{ textAlign: 'center' }}>Pending</th>
                  <th style={{ textAlign: 'center' }}>Progress</th>
                  <th style={{ textAlign: 'center' }}>Replies</th>
                  <th style={{ textAlign: 'center' }}>Reply Rate</th>
                  <th style={{ textAlign: 'center' }}>Open Rate</th>
                  <th style={{ textAlign: 'center' }}>Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const allTimeStats = c.stats || {};
                  const rStats  = filteredStatsByCampaign[String(c.id)] || {};
                  const sent    = rStats.sent || 0;
                  const replies = rStats.replies || 0;
                  const openRate2  = sent > 0 ? Math.round((rStats.totalOpens  || 0) / sent * 100) : 0;
                  const replyRate2 = sent > 0 ? Math.round(replies / sent * 100) : 0;
                  const clickRate2 = sent > 0 ? Math.round((rStats.totalClicks || 0) / sent * 100) : 0;
                  const allTimeSent = allTimeStats.emails_sent || 0;
                  const scheduled  = allTimeStats.scheduled   || 0;
                  const denom   = allTimeSent + scheduled;
                  const progress = denom > 0 ? Math.round((allTimeSent / denom) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/campaigns/${c.id}#analytics`} className="data-table-primary" style={{ color: 'var(--gold-dark)' }}>
                          {c.name}
                        </Link>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{sent}</td>
                      <td style={{ textAlign: 'center' }}>{scheduled}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <div className="progress" style={{ width: 80 }}>
                            <div className="progress-bar" style={{ width: `${progress}%` }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{progress}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{replies}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${replyRate2 >= 10 ? 'badge-green' : replyRate2 > 0 ? 'badge-orange' : 'badge-gray'}`}>
                          {replyRate2}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{openRate2}%</td>
                      <td style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{clickRate2}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DomainReputationTimeline />
      <CampaignPerformanceChart />
    </div>
  );
}