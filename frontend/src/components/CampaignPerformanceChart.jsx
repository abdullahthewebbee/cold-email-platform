import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../api';
import Icon from './ui/AegisIcon';

const css = `
.cpc-wrap {
  background: var(--do-surface);
  border: 1px solid var(--do-border);
  border-radius: var(--do-r-lg);
  box-shadow: var(--do-shadow-sm);
  overflow: hidden;
  margin-bottom: 16px;
}
.cpc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--do-border);
  flex-wrap: wrap;
  gap: 8px;
}
.cpc-title {
  font-family: var(--do-font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--do-text);
}
.cpc-sub {
  font-size: 11px;
  color: var(--do-text4);
  margin-top: 2px;
}
.cpc-tabs {
  display: flex;
  gap: 4px;
  background: var(--do-surf3);
  border-radius: var(--do-r-sm);
  padding: 3px;
}
.cpc-tab {
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
.cpc-tab.active {
  background: var(--do-surface);
  color: var(--do-gold-dark);
  box-shadow: var(--do-shadow-xs);
}
.cpc-body { padding: 16px 20px 20px; }
.cpc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 160px;
  font-size: 13px;
  color: var(--do-text4);
  gap: 8px;
}
.cpc-state.error { color: var(--do-red); }
`;

const COLORS = {
  sent:    'var(--chart-sent)',
  opened:  'var(--chart-opened)',
  clicked: 'var(--chart-clicked)',
  replied: 'var(--chart-replied)',
};
const RATE_COLORS = {
  open_rate:  'var(--chart-opened)',
  click_rate: 'var(--chart-clicked)',
  reply_rate: 'var(--chart-replied)',
};

function CpcTooltip({ active, payload, label, mode }) {
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
      <div style={{ fontFamily: 'var(--do-font-serif)', fontWeight: 700, color: 'var(--do-text)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--do-border)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              {mode === 'rate' ? `${p.value}%` : p.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CampaignPerformanceChart() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [mode, setMode]       = useState('absolute');

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get('/analytics/campaign-performance')
      .then(rows => setData(rows))
      .catch(e => setError(e.message || 'Failed to load campaign data'))
      .finally(() => setLoading(false));
  }, []);

  const chartData = data.map(r => ({
    ...r,
    name: r.campaign_name.length > 22 ? r.campaign_name.slice(0, 22) + '…' : r.campaign_name,
  }));

  const height = Math.max(220, chartData.length * 52);

  return (
    <>
      <style>{css}</style>
      <div className="cpc-wrap">
        <div className="cpc-head">
          <div>
            <div className="cpc-title">Campaign Performance</div>
            <div className="cpc-sub">Top 10 campaigns by emails sent</div>
          </div>
          <div className="cpc-tabs">
            {[['Numbers', 'absolute'], ['Rates %', 'rate']].map(([label, val]) => (
              <button key={val} onClick={() => setMode(val)} className={`cpc-tab${mode === val ? ' active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="cpc-body">
          {loading && <div className="cpc-state">Loading campaign data…</div>}
          {error   && <div className="cpc-state error">{error}</div>}

          {!loading && !error && chartData.length === 0 && (
            <div className="cpc-state">
              <Icon name="inbox" size={24} />
              No campaigns have sent emails yet.
            </div>
          )}

          {!loading && !error && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--do-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--do-text4)', fontFamily: 'var(--do-font-mono)' }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => mode === 'rate' ? `${v}%` : v.toLocaleString()}
                />
                <YAxis
                  type="category" dataKey="name" width={140}
                  tick={{ fontSize: 11, fill: 'var(--do-text3)' }}
                  tickLine={false} axisLine={false}
                />
                <Tooltip content={<CpcTooltip mode={mode} />} cursor={{ fill: 'var(--do-gold-bg)' }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  formatter={v => <span style={{ color: 'var(--do-text3)' }}>{v}</span>}
                />
                {mode === 'absolute' ? (
                  <>
                    <Bar dataKey="sent"    name="Sent"    fill={COLORS.sent}    radius={[0,3,3,0]} barSize={9} />
                    <Bar dataKey="opened"  name="Opened"  fill={COLORS.opened}  radius={[0,3,3,0]} barSize={9} />
                    <Bar dataKey="clicked" name="Clicked" fill={COLORS.clicked} radius={[0,3,3,0]} barSize={9} />
                    <Bar dataKey="replied" name="Replied" fill={COLORS.replied} radius={[0,3,3,0]} barSize={9} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="open_rate"  name="Open Rate"  fill={RATE_COLORS.open_rate}  radius={[0,3,3,0]} barSize={9} />
                    <Bar dataKey="click_rate" name="Click Rate" fill={RATE_COLORS.click_rate} radius={[0,3,3,0]} barSize={9} />
                    <Bar dataKey="reply_rate" name="Reply Rate" fill={RATE_COLORS.reply_rate} radius={[0,3,3,0]} barSize={9} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}