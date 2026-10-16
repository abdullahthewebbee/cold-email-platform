// Recharts, canvas and three.js cannot read CSS variables directly, so this resolves
// them at runtime to concrete colours and re-resolves whenever the theme toggles
// (data-theme on <html> or the OS colour scheme).
import { useEffect, useState } from 'react';

let _probe = null;
let _ctx = null;

/** Resolve any CSS colour (including var() and color-mix()) to '#rrggbb' (or rgba()). */
function resolve(value) {
  if (typeof document === 'undefined') return value;
  if (!_probe) {
    _probe = document.createElement('span');
    _probe.style.display = 'none';
    document.body.appendChild(_probe);
    _ctx = document.createElement('canvas').getContext('2d');
  }
  _probe.style.color = '';
  _probe.style.color = value;
  const computed = getComputedStyle(_probe).color || value;
  _ctx.fillStyle = 'black';
  _ctx.fillStyle = computed;
  return _ctx.fillStyle;
}

const tok = (name) => resolve(`var(${name})`);

export function getChartTheme() {
  return {
    series: {
      sent:           tok('--chart-sent'),
      opened:         tok('--chart-opened'),
      openedUnique:   tok('--chart-opened-unique'),
      clicked:        tok('--chart-clicked'),
      clickedUnique:  tok('--chart-clicked-unique'),
      replied:        tok('--chart-replied'),
      bounced:        tok('--chart-bounced'),
    },
    bg:        tok('--bg'),
    surface:   tok('--bg-surface'),
    elevated:  tok('--bg-elevated'),
    text:      tok('--text'),
    muted:     tok('--text-muted'),
    dim:       tok('--text-dim'),
    grid:      tok('--border'),
    gridStrong: tok('--border-active'),
    gold:      tok('--gold'),
    info:      tok('--info'),
  };
}

export function useChartTheme() {
  const [theme, setTheme] = useState(() => getChartTheme());
  useEffect(() => {
    const update = () => setTheme(getChartTheme());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', update);
    update();
    return () => { mo.disconnect(); mq.removeEventListener?.('change', update); };
  }, []);
  return theme;
}
