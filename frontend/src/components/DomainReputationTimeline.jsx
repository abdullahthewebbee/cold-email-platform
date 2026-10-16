import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../api';

const css = `
.drt-wrap {
  background: var(--do-surface);
  border: 1px solid var(--do-border);
  border-radius: var(--do-r-lg);
  box-shadow: var(--do-shadow-sm);
  overflow: hidden;
  margin-bottom: 16px;
}
.drt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--do-border);
}
.drt-title {
  font-family: var(--do-font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--do-text);
}
.drt-tabs {
  display: flex;
  gap: 4px;
  background: var(--do-surf3);
  border-radius: var(--do-r-sm);
  padding: 3px;
}
.drt-tab {
  padding: 4px 12px;
  border-radius: var(--do-r-xs);
  font-size: 11px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--do-text4);
  transition: all .15s ease;
}
.drt-tab.active {
  background: var(--do-surface);
  color: var(--do-gold-dark);
  box-shadow: var(--do-shadow-xs);
}
.drt-body { padding: 16px 20px 20px; }
.drt-meta {
  font-size: 11px;
  font-family: var(--do-font-mono);
  color: var(--do-text4);
  margin-bottom: 12px;
}
.drt-empty {
  font-size: 13px;
  color: var(--do-text4);
  font-style: italic;
  padding: 24px 0;
}
.drt-error {
  font-size: 13px;
  color: var(--do-red);
  padding: 12px 0;
}
.drt-loading {
  font-size: 13px;
  color: var(--do-text4);
  padding: 12px 0;
}
`;

function DrtTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--do-surface)',
      border: '1px solid var(--do-border)',
      borderRadius: 'var(--do-r)',
      boxShadow: 'var(--do-shadow)',
      padding: '10px 14px',
      fontSize: 12,
      minWidth: 160,
    }}>
      <div style={{ fontFamily: 'var(--do-font-serif)', fontWeight: 700, color: 'var(--do-text)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--do-border)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--do-text3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
              {p.name}
            </span>
            <span style={{ fontFamily: 'var(--do-font-mono)', fontWeight: 600, color: 'var(--do-text)', fontSize: 12 }}>
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DomainReputationTimeline() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/analytics/domain-reputation?days=${days}`)
      .then((rows) => {
        const byDate = {};
        for (const r of rows) {
          if (!byDate[r.date]) {
            byDate[r.date] = { date: r.date, sent: 0, opened: 0, clicked: 0, hard: 0, soft: 0, block: 0, content: 0 };
          }
          byDate[r.date].sent    += r.sent;
          byDate[r.date].opened  += r.opened;
          byDate[r.date].clicked += r.clicked;
          byDate[r.date].hard    += r.bounces.hard;
          byDate[r.date].soft    += r.bounces.soft;
          byDate[r.date].block   += r.bounces.block;
          byDate[r.date].content += r.bounces.content;
        }
        const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
        setData(merged);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  const totalSent    = data.reduce((s, d) => s + d.sent, 0);
  const totalBounces = data.reduce((s, d) => s + d.hard + d.soft + d.block + d.content, 0);

  return (
    <>
      <style>{css}</style>
      <div className="drt-wrap">
        <div className="drt-head">
          <span className="drt-title">Domain Reputation Timeline</span>
          <div className="drt-tabs">
            {[7, 30, 90].map(n => (
              <button key={n} onClick={() => setDays(n)} className={`drt-tab${days === n ? ' active' : ''}`}>
                {n}d
              </button>
            ))}
          </div>
        </div>

        <div className="drt-body">
          {loading && <p className="drt-loading">Loading…</p>}
          {error   && <p className="drt-error">{error}</p>}

          {!loading && !error && data.length === 0 && (
            <p className="drt-empty">No sends yet in this period — this chart populates as your campaigns send.</p>
          )}

          {!loading && !error && data.length > 0 && (
            <>
              <p className="drt-meta">
                {totalSent.toLocaleString()} sent · {totalBounces.toLocaleString()} bounced ({totalSent > 0 ? ((totalBounces / totalSent) * 100).toFixed(1) : 0}% bounce rate)
              </p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--do-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--do-text4)', fontFamily: 'var(--do-font-mono)' }}
                      axisLine={{ stroke: 'var(--do-border)' }} tickLine={false} dy={6} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--do-text4)', fontFamily: 'var(--do-font-mono)' }}
                      axisLine={false} tickLine={false} width={34} />
                    <Tooltip content={<DrtTooltip />} cursor={{ fill: 'var(--do-gold-bg)' }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12, color: 'var(--do-text3)' }} />
                    <Bar dataKey="sent"    fill="var(--chart-sent)" name="Sent"             barSize={14} radius={[3,3,0,0]} />
                    <Bar dataKey="hard"    stackId="b" fill="var(--chart-bounced)"  name="Hard bounce"       barSize={14} />
                    <Bar dataKey="soft"    stackId="b" fill="var(--warning)"      name="Soft bounce"       barSize={14} />
                    <Bar dataKey="block"   stackId="b" fill="var(--text-muted)"   name="Blocked"           barSize={14} />
                    <Bar dataKey="content" stackId="b" fill="var(--text-dim)"     name="Content-filtered"  barSize={14} radius={[3,3,0,0]} />
                    <Line type="monotone" dataKey="opened" stroke="var(--chart-opened)" name="Opened"
                      strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--do-surface)', strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}