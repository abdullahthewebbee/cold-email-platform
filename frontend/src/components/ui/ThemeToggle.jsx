import { useEffect, useState } from 'react';

/* Reads / writes data-theme on <html> and persists to localStorage */
export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('do-theme');
      if (saved) return saved === 'dark';
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
    try { localStorage.setItem('do-theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  return (
    <button
      onClick={() => setDark(d => !d)}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid var(--do-border-dark)',
        background: 'var(--do-surface)',
        boxShadow: 'var(--do-shadow)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        transition: 'background 0.2s, box-shadow 0.2s',
        color: 'var(--do-text)',
      }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}