import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiCache } from '../api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function AddCampaign() {
  const [inboxes, setInboxes] = useState(() => apiCache.get('/inboxes') || []);
  const [modeCodes, setModeCodes] = useState({ manual: 'MANU-2024', semi_manual: 'SEMI-2024', full_ai: 'FULL-2024' });
  const [campaignCode, setCampaignCode] = useState('');
  const [detectedMode, setDetectedMode] = useState(null);
  const [form, setForm] = useState({
    name: '',
    campaign_code: '',
    inbox_ids: [],
    sending_days: [0,1,2,3,4],
    sending_hours_start: '09:00',
    sending_hours_end: '17:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    stop_on_reply: true,
    track_opens: false,
    track_clicks: false,
    add_unsubscribe_header: true,
    send_first_as_text: false,
    send_all_as_text: false,
    match_lead_provider: true,
  });
  const [message, setMessage] = useState(null);
  const [tzSearch, setTzSearch] = useState('');
  const navigate = useNavigate();

  const tzList = useMemo(() => {
    return Intl.supportedValuesOf('timeZone').map(tz => {
      let offsetLabel = '';
      try {
        const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
        const off = parts.find(p => p.type === 'timeZoneName');
        if (off) offsetLabel = ` (${off.value})`;
      } catch (_) {}
      return { value: tz, label: `${tz.replace(/_/g, ' ')}${offsetLabel}` };
    });
  }, []);

  const filteredTz = tzSearch
    ? tzList.filter(t => t.label.toLowerCase().includes(tzSearch.toLowerCase()))
    : tzList;

  useEffect(() => {
    api.get('/inboxes').then(setInboxes).catch(() => {});
    api.get('/settings/campaign-mode-codes').then(setModeCodes).catch(() => {});
  }, []);

  // Detect mode from code
  useEffect(() => {
    const code = campaignCode.trim().toUpperCase();
    if (!code) { setDetectedMode(null); return; }
    if (code === modeCodes.manual?.toUpperCase()) setDetectedMode('manual');
    else if (code === modeCodes.semi_manual?.toUpperCase()) setDetectedMode('semi_manual');
    else if (code === modeCodes.full_ai?.toUpperCase()) setDetectedMode('full_ai');
    else setDetectedMode('invalid');
  }, [campaignCode, modeCodes]);

  const modeInfo = {
    manual:      { label: 'Manual',         desc: 'You build sequences and branch tree manually.',                       color: 'border-gray-400 bg-gray-50 text-gray-700' },
    semi_manual: { label: 'Semi-Manual AI', desc: 'Write Step 1 only. AI handles all replies automatically.',            color: 'border-teal-400 bg-teal-50 text-teal-700' },
    full_ai:     { label: 'Full AI Agent',  desc: 'No sequences, no branch tree. AI manages everything end-to-end.',     color: 'border-purple-400 bg-purple-50 text-purple-700' },
    invalid:     { label: 'Invalid code',   desc: 'This code does not match any campaign mode. Contact your admin.',      color: 'border-red-400 bg-red-50 text-red-700' },
  };

  function handleCheckboxChange(e) {
    const { name, value, checked } = e.target;
    if (name === 'inbox_id') {
      const id = parseInt(value, 10);
      setForm(f => {
        const ids = new Set(f.inbox_ids);
        if (checked) ids.add(id); else ids.delete(id);
        return { ...f, inbox_ids: Array.from(ids) };
      });
    } else if (name === 'day') {
      const day = parseInt(value, 10);
      setForm(f => {
        const days = new Set(f.sending_days);
        if (checked) days.add(day); else days.delete(day);
        return { ...f, sending_days: Array.from(days).sort() };
      });
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!campaignCode.trim()) { setMessage({ type: 'error', text: 'Campaign code is required' }); return; }
    if (detectedMode === 'invalid' || !detectedMode) { setMessage({ type: 'error', text: 'Invalid campaign code' }); return; }
    try {
      const payload = { ...form, campaign_code: campaignCode.trim().toUpperCase() };
      const data = await api.post('/campaigns', payload);
      navigate(`/campaigns/${data.id}#sequences`);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className="min-h-0 max-w-2xl flex-1 overflow-y-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Create campaign</h1>
      <p className="text-sm text-gray-500 mb-6">Enter your campaign code to set the mode, then configure the campaign.</p>

      {message && (
        <div className={`mb-4 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Campaign Code Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Campaign Code *</label>
          <input
            type="text"
            value={campaignCode}
            onChange={e => setCampaignCode(e.target.value.toUpperCase())}
            placeholder="e.g. MANU-2024"
            className="w-full border-2 rounded-xl px-4 py-3 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <p className="text-xs text-gray-400 mt-1">Get this code from your admin in Settings - Features - Campaign Modes.</p>

          {/* Mode detection result */}
          {detectedMode && (
            <div className={`mt-3 p-3 rounded-xl border-2 ${modeInfo[detectedMode]?.color}`}>
              <div className="font-semibold text-sm">{modeInfo[detectedMode]?.label}</div>
              <div className="text-xs mt-0.5 opacity-80">{modeInfo[detectedMode]?.desc}</div>
            </div>
          )}
        </div>

        {/* Campaign Name */}
        <div>
          <Input label="Campaign name *" name="name" value={form.name} onChange={handleChange} required />
        </div>

        {/* Inboxes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sending inboxes (optional)</label>
          <div className="mt-1 space-y-1 max-h-52 overflow-y-auto p-2 border border-gray-300 rounded">
            {inboxes.map(i => (
              <label key={i.id} className="flex items-center gap-2">
                <input type="checkbox" name="inbox_id" value={i.id}
                  checked={form.inbox_ids.includes(i.id)} onChange={handleCheckboxChange} />
                <span className="text-sm">{i.email}{i.display_name ? ` (${i.display_name})` : ''} - max {i.max_emails_per_day}/day</span>
              </label>
            ))}
          </div>
        </div>

        {/* Sending days */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sending days</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {[0,1,2,3,4,5,6].map(d => (
              <label key={d} className="flex items-center gap-2">
                <input type="checkbox" name="day" value={d}
                  checked={form.sending_days.includes(d)} onChange={handleCheckboxChange} />
                <span className="text-sm">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Sending window */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Window start</label>
            <input type="time" name="sending_hours_start" value={form.sending_hours_start} onChange={handleChange}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Window end</label>
            <input type="time" name="sending_hours_end" value={form.sending_hours_end} onChange={handleChange}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <div className="relative">
            <input type="text" placeholder="Search timezone..."
              value={tzSearch || form.timezone}
              onFocus={e => { setTzSearch(''); e.target.select(); }}
              onChange={e => setTzSearch(e.target.value)}
              onBlur={() => setTimeout(() => setTzSearch(''), 200)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
            {tzSearch !== '' && (
              <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {filteredTz.slice(0, 100).map(t => (
                  <li key={t.value}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-teal-50 ${form.timezone === t.value ? 'bg-teal-100 font-medium' : ''}`}
                    onMouseDown={() => { setForm(f => ({ ...f, timezone: t.value })); setTzSearch(''); }}
                  >{t.label}</li>
                ))}
                {filteredTz.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No match</li>}
              </ul>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="border-t pt-4 space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="stop_on_reply" checked={form.stop_on_reply} onChange={handleChange} />
            <span className="text-sm">Stop sending when lead replies</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="track_opens" checked={form.track_opens} onChange={handleChange} />
            <span className="text-sm">Track email opens</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="track_clicks" checked={form.track_clicks} onChange={handleChange} />
            <span className="text-sm">Track link clicks</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="match_lead_provider" checked={form.match_lead_provider} onChange={handleChange} />
            <span className="text-sm">Match lead provider</span>
          </label>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="default" disabled={detectedMode === 'invalid' || !detectedMode || !form.name.trim()}>
            Create campaign
          </Button>
        </div>
      </form>
    </div>
  );
}
