// Utilidades compartidas por las 3 páginas. La URL del backend sale de config.js (API_URL en .env)
const API_URL = ((window.APP_CONFIG && window.APP_CONFIG.API_URL) || '').replace(/\/$/, '');
const ICONS = {
  home:'<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>',
  cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  list:'<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  users:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5 6.5-5s6 1.5 6.5 5M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.3 2 3.5 5"/></svg>',
  up:'<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  shield:'<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  chart:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  out:'<svg viewBox="0 0 24 24"><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  refresh:'<svg viewBox="0 0 24 24"><path d="M20 11A8 8 0 006 6L4 8M4 4v4h4M4 13a8 8 0 0014 5l2-2M20 20v-4h-4"/></svg>',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const badge = (e) => `<span class="badge b-${esc(e)}">${esc(e)}</span>`;
const $ = (s, r = document) => r.querySelector(s);
const fechaKey = (f) => f.slice(6, 10) + f.slice(3, 5) + f.slice(0, 2);
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

async function api(path, { method = 'GET', body, admin = false } = {}) {
  const headers = {}; let payload = body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (admin) headers['x-admin-token'] = sessionStorage.getItem('adminToken') || '';
  let res;
  try { res = await fetch(API_URL + path, { method, headers, body: payload }); }
  catch (_) { throw new Error('No se pudo conectar con el servidor. ¿Está encendido el backend?'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && admin) { sessionStorage.removeItem('adminToken'); location.href = 'index.html'; }
  if (!res.ok) throw new Error(data.error || 'Error inesperado del servidor');
  return data;
}

function toast(msg, tipo = '') {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// Diálogos propios (reemplazan alert/confirm/prompt)
function dialog({ titulo, texto = '', input, ok = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(titulo)}</h3><p class="muted small" style="margin-bottom:14px">${esc(texto)}</p>
      ${input ? `<div class="field"><input class="input" type="${input.type || 'text'}" value="${esc(input.valor || '')}" placeholder="${esc(input.placeholder || '')}"></div>` : ''}
      <div class="row">${cancelar ? `<button class="btn" data-r="0">${cancelar}</button>` : ''}<button class="btn ${peligro ? 'danger' : 'primary'}" data-r="1">${ok}</button></div></div>`;
    document.body.appendChild(o);
    const inp = $('input', o); (inp || $('[data-r="1"]', o)).focus();
    const fin = (v) => { o.remove(); resolve(v); };
    o.addEventListener('click', (e) => { if (e.target === o) fin(null); const r = e.target.closest('[data-r]'); if (r) fin(r.dataset.r === '1' ? (inp ? inp.value : true) : null); });
    o.addEventListener('keydown', (e) => { if (e.key === 'Escape') fin(null); if (e.key === 'Enter') fin(inp ? inp.value : true); });
  });
}

function donut(el, partes, centro, sub) {
  const total = partes.reduce((a, p) => a + p.v, 0), R = 70, C = 2 * Math.PI * R; let off = 0;
  const arcs = total ? partes.filter((p) => p.v).map((p) => { const len = (p.v / total) * C; const s = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('') : '';
  el.innerHTML = `<div class="donut"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="${R}" fill="none" stroke="#1d3543" stroke-width="18"/>${arcs}</svg><div class="mid"><b>${esc(centro)}</b><span>${esc(sub)}</span></div></div>
  <div class="legend">${partes.map((p) => `<div><i style="background:${p.c}"></i>${esc(p.n)}<b>${p.v}</b></div>`).join('')}</div>`;
}

function barras(el, datos) { // [{etq, a, b}] a = presentes, b = ausentes (apiladas)
  if (!datos.length) { el.innerHTML = '<p class="muted small" style="padding:30px;text-align:center">Aún no hay clases con registros.</p>'; return; }
  const W = 640, H = 230, pad = 28, max = Math.max(1, ...datos.map((d) => d.a + d.b)), bw = Math.min(46, (W - pad * 2) / datos.length - 10);
  const sx = (W - pad * 2) / datos.length;
  const bars = datos.map((d, i) => {
    const x = pad + i * sx + (sx - bw) / 2, ha = (d.a / max) * (H - 60), hb = (d.b / max) * (H - 60), base = H - 28;
    return `<rect x="${x}" y="${base - ha}" width="${bw}" height="${ha}" rx="5" fill="#34e3a4"/><rect x="${x}" y="${base - ha - hb}" width="${bw}" height="${hb}" rx="5" fill="#f0627b" opacity=".85"/>
    <text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle">${esc(d.etq)}</text><text x="${x + bw / 2}" y="${base - ha - hb - 6}" text-anchor="middle" style="fill:#e7f2f6">${d.a}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Asistencia por clase"><line x1="${pad}" x2="${W - pad}" y1="${H - 28}" y2="${H - 28}" stroke="#1d3543"/>${bars}</svg>
  <div class="dots"><span><i style="background:#34e3a4"></i>Presentes</span><span><i style="background:#f0627b"></i>Ausentes</span></div>`;
}

// Reloj sincronizado con la hora del servidor (no la del equipo del estudiante)
function iniciarReloj(el, horaInicial) {
  let [h, m] = horaInicial.split(':').map(Number), s = new Date().getSeconds();
  const pintar = () => { el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
  pintar(); setInterval(() => { if (++s === 60) { s = 0; if (++m === 60) { m = 0; h = (h + 1) % 24; } } pintar(); }, 1000);
}
