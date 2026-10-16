import { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useChartTheme } from '../utils/chartTheme';

const SERIES_THEME_KEY = {
  sent:         'sent',
  totalOpens:   'opened',
  uniqueOpens:  'openedUnique',
  totalReplies: 'replied',
  totalClicks:  'clicked',
  uniqueClicks: 'clickedUnique',
};
const seriesColor = (theme, key) => theme.series[SERIES_THEME_KEY[key]] || theme.gold;

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 36;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 36);
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.9, 1);
  return sprite;
}

export function ThreeBarChart({ data = [], series = [], hide = {} }) {
  const mountRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const theme = useChartTheme();

  const visibleSeries = useMemo(() => series.filter(s => !hide[s.key]), [series, hide]);

  const maxVal = useMemo(() => {
    let m = 1;
    data.forEach(d => visibleSeries.forEach(s => { if ((d[s.key] || 0) > m) m = d[s.key]; }));
    return m;
  }, [data, visibleSeries]);

  const hasData = data.some(d => visibleSeries.some(s => (d[s.key] || 0) > 0));

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || 800;
    const H = el.clientHeight || 340;

    // ── Scene ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.bg);
    scene.fog = new THREE.FogExp2(theme.bg, 0.016);

    // ── Camera ─────────────────────────────────────────────────────────
    const RADIUS = 30;
    const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 300);
    camera.position.set(0, 14, RADIUS);
    camera.lookAt(0, 3, 0);

    // ── Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // ── Lights ─────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(theme.elevated, 3));

    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(15, 25, 15);
    sun.castShadow = true;
    sun.shadow.camera.left   = -35;
    sun.shadow.camera.right  =  35;
    sun.shadow.camera.top    =  35;
    sun.shadow.camera.bottom = -35;
    scene.add(sun);

    const teal = new THREE.PointLight(theme.series.opened, 2.0, 60);
    teal.position.set(-15, 10, 10);
    scene.add(teal);

    const blue = new THREE.PointLight(theme.series.clicked, 1.2, 60);
    blue.position.set(15, 8, -10);
    scene.add(blue);

    // ── Floor ──────────────────────────────────────────────────────────
    const floorMat = new THREE.MeshPhongMaterial({ color: theme.surface, shininess: 5 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(60, 30, theme.gridStrong, theme.dim);
    scene.add(grid);

    // ── Bars ───────────────────────────────────────────────────────────
    const barMeshes = [];
    const nDates  = data.length;
    const nVis    = visibleSeries.length;
    if (nDates > 0 && nVis > 0) {
      const BAR_W      = 0.52;
      const BAR_GAP    = 0.08;
      const GROUP_GAP  = 0.9;
      const groupW     = nVis * BAR_W + (nVis - 1) * BAR_GAP;
      const dateStep   = groupW + GROUP_GAP;
      const totalW     = nDates * dateStep;
      const startX     = -totalW / 2 + dateStep / 2;

      data.forEach((d, di) => {
        const gx = startX + di * dateStep;

        visibleSeries.forEach((s, si) => {
          const val  = d[s.key] || 0;
          const normH = maxVal > 0 ? (val / maxVal) * 10 : 0;
          const h     = Math.max(normH, 0.04);
          const bx    = gx + (si - (nVis - 1) / 2) * (BAR_W + BAR_GAP);

          const col = new THREE.Color(seriesColor(theme, s.key));
          const mat = new THREE.MeshPhongMaterial({
            color: col,
            emissive: col.clone().multiplyScalar(val > 0 ? 0.18 : 0.04),
            shininess: 90,
            transparent: true,
            opacity: hasData ? 0.88 : 0.18,
          });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, h, BAR_W), mat);
          mesh.position.set(bx, h / 2, 0);
          mesh.castShadow = true;
          mesh.userData = { date: d.date, seriesName: s.name, seriesKey: s.key, value: val };
          scene.add(mesh);
          barMeshes.push(mesh);

          // Glow cap on non-zero bars
          if (val > 0) {
            const capCol = col.clone().multiplyScalar(1.4);
            const capMat = new THREE.MeshPhongMaterial({
              color: capCol,
              emissive: col.clone().multiplyScalar(0.7),
              transparent: true,
              opacity: 0.95,
              shininess: 120,
            });
            const cap = new THREE.Mesh(new THREE.BoxGeometry(BAR_W + 0.06, 0.1, BAR_W + 0.06), capMat);
            cap.position.set(bx, h + 0.05, 0);
            scene.add(cap);
          }
        });

        // Date label
        const label = d.date ? d.date.slice(5).replace('-', '/') : '';
        const sprite = makeLabel(label, theme.dim);
        sprite.position.set(gx, -0.9, 0);
        scene.add(sprite);
      });
    }

    // ── Animation ──────────────────────────────────────────────────────
    let angle   = Math.atan2(0, RADIUS);
    let paused  = false;
    let raf     = null;
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2(-9999, -9999);

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(barMeshes);
      if (hits.length > 0) {
        const ud = hits[0].object.userData;
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ...ud });
      } else {
        setTooltip(null);
      }
    };
    const onMouseEnter = () => { paused = true;  };
    const onMouseLeave = () => { paused = false; setTooltip(null); };

    renderer.domElement.addEventListener('mousemove',  onMouseMove);
    renderer.domElement.addEventListener('mouseenter', onMouseEnter);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!paused) {
        angle += 0.0035;
        camera.position.x = Math.sin(angle) * RADIUS;
        camera.position.z = Math.cos(angle) * RADIUS;
        camera.position.y = 14 + Math.sin(angle * 0.4) * 2;
        camera.lookAt(0, 3, 0);
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('mousemove',  onMouseMove);
      renderer.domElement.removeEventListener('mouseenter', onMouseEnter);
      renderer.domElement.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
      barMeshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [data, visibleSeries, maxVal, hasData, theme]);

  return (
    <div className="relative" style={{ width: '100%', height: 340, background: 'var(--bg)', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-slate-400" style={{ color: 'var(--text-muted)' }}>No activity in this date range</p>
          <p className="text-xs text-slate-600 mt-1">Send this campaign to see 3D metrics</p>
        </div>
      )}

      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 text-xs rounded-xl px-3 py-2.5 shadow-2xl"
          style={{
            left: Math.min(tooltip.x + 14, 260),
            top:  Math.max(8, tooltip.y - 48),
            background:    'var(--bg-elevated)',
            border:        '1px solid var(--border-active)',
            color:         'var(--text)',
            backdropFilter:'blur(10px)',
          }}
        >
          <div className="font-semibold text-teal-400 mb-1">{tooltip.date}</div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: seriesColor(theme, tooltip.seriesKey) }} />
            <span className="text-slate-300">{tooltip.seriesName}</span>
            <span className="font-bold text-white ml-1">{tooltip.value}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-2 right-3 text-xs text-slate-700 pointer-events-none select-none">
        hover to pause · auto-rotating
      </div>
    </div>
  );
}
