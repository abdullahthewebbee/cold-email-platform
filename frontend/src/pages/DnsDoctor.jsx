import { useState } from 'react';
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiCloseCircleLine,
  RiGlobalLine,
  RiFileCopyLine,
  RiCheckLine,
  RiSearchLine,
} from 'react-icons/ri';
import { api } from '../api';

/* ─── helpers ───────────────────────────────────────────── */

function statusColor(status) {
  switch (status) {
    case 'fail':    return { dot: 'bg-red-500',    text: 'text-red-500',    border: 'border-red-200',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700' };
    case 'warning': return { dot: 'bg-yellow-400', text: 'text-yellow-600', border: 'border-yellow-200', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700' };
    case 'pass':    return { dot: 'bg-green-500',  text: 'text-green-600',  border: 'border-green-200',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700' };
    default:        return { dot: 'bg-gray-400',   text: 'text-gray-500',   border: 'border-gray-200',   bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-600' };
  }
}

function statusLabel(status) {
  switch (status) {
    case 'fail':    return 'Fail';
    case 'warning': return 'Warning';
    case 'pass':    return 'Pass';
    default:        return 'Unknown';
  }
}

function StatusIcon({ status, size = 18 }) {
  const cls = statusColor(status).text;
  switch (status) {
    case 'fail':    return <RiCloseCircleLine    size={size} className={cls} />;
    case 'warning': return <RiErrorWarningLine   size={size} className={cls} />;
    case 'pass':    return <RiCheckboxCircleLine size={size} className={cls} />;
    default:        return <RiGlobalLine         size={size} className={cls} />;
  }
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={doCopy}
      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
    >
      {copied ? <RiCheckLine size={13} className="text-green-600" /> : <RiFileCopyLine size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ─── record card ───────────────────────────────────────── */

function RecordCard({ title, result }) {
  const col = statusColor(result.status);
  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${col.border}`}>
      <div className={`flex items-center justify-between px-4 py-3 ${col.bg} border-b ${col.border}`}>
        <div className="flex items-center gap-2.5">
          <StatusIcon status={result.status} />
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.badge}`}>
          {statusLabel(result.status)}
        </span>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
        {result.record && (
          <p className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1.5 break-all">
            {result.record}
          </p>
        )}
        {result.message && (
          <p className="text-sm text-gray-500 leading-snug">{result.message}</p>
        )}
        {result.suggested_record && (
          <div className="flex items-start gap-2 mt-1">
            <p className="text-xs font-mono text-gray-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 flex-1 break-all">
              {result.suggested_record}
            </p>
            <CopyButton text={result.suggested_record} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────── */

export default function DnsDoctor() {
  const [domain, setDomain] = useState('');
  const [dkimSelector, setDkimSelector] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ domain: domain.trim() });
      if (dkimSelector.trim()) params.set('dkim_selector', dkimSelector.trim());
      const data = await api.get(`/dns-doctor/check?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Check failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-0 max-w-3xl flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">DNS Doctor</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Check SPF, DKIM, and DMARC records for a sending domain.
        </p>
      </div>

      <form onSubmit={runCheck} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <RiGlobalLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <RiSearchLine size={16} />
            {loading ? 'Checking…' : 'Check'}
          </button>
        </div>
        <input
          type="text"
          value={dkimSelector}
          onChange={(e) => setDkimSelector(e.target.value)}
          placeholder="DKIM selector (optional — e.g. from your provider's docs)"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 ${statusColor(result.overall_status).border} ${statusColor(result.overall_status).bg}`}>
            <span className={`text-sm font-semibold ${statusColor(result.overall_status).text}`}>
              {result.domain} — {statusLabel(result.overall_status)}
            </span>
          </div>
          <RecordCard title="SPF" result={result.spf} />
          <RecordCard title="DKIM" result={result.dkim} />
          <RecordCard title="DMARC" result={result.dmarc} />
          <RecordCard
            title="Blacklist"
            result={{
              status: result.blacklist.status,
              record: result.blacklist.ip ? `IP: ${result.blacklist.ip}` : null,
              message: result.blacklist.message,
              suggested_record: null,
            }}
          />
        </div>
      )}
    </div>
  );
}