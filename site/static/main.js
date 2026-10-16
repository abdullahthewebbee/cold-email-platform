(function() {
  const stored = localStorage.getItem('emissary-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', stored || (prefersDark ? 'dark' : 'light'));
})();
const tt = document.getElementById('theme-toggle');
if (tt) {
  const sync = () => { tt.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'; };
  sync();
  tt.addEventListener('click', function() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('emissary-theme', next);
    sync();
  });
}
const mb = document.getElementById('mobile-menu-btn');
if (mb) mb.addEventListener('click', () => document.getElementById('nav-mobile').classList.toggle('open'));
document.querySelectorAll('.faq-item').forEach(item => {
  const q = item.querySelector('.faq-q');
  const a = item.querySelector('.faq-a');
  q.addEventListener('click', function() {
    const open = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => { i.classList.remove('open'); i.querySelector('.faq-a').style.maxHeight = null; });
    if (!open) { item.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
  });
});
