const estudiante = JSON.parse(localStorage.getItem('estudiante') || 'null');
if (!estudiante) location.href = 'index.html';

let historial = [], mesVista = null;

$('#nav').innerHTML = `<a href="#inicio" class="active">${ICONS.home}<span>Inicio</span></a><a href="#calendario">${ICONS.cal}<span>Calendario</span></a><a href="#historial">${ICONS.list}<span>Historial</span></a>`;
$('#logout').innerHTML = `${ICONS.out}<span>Cerrar sesión</span>`;
$('#logout').onclick = () => { localStorage.removeItem('estudiante'); location.href = 'index.html'; };
$('#nav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; document.querySelectorAll('#nav a').forEach((x) => x.classList.toggle('active', x === a)); });

$('#avatar').textContent = initials(estudiante.nombre);
$('#u-nombre').textContent = estudiante.nombre; $('#u-reg').textContent = 'Reg. ' + estudiante.registro;
$('#saludo').textContent = 'Hola, ' + estudiante.nombre.split(' ')[0];

async function cargarCabecera() {
  try { $('#modulo').textContent = (await api('/api/modulo-activo')).nombre; } catch (e) { $('#modulo').textContent = 'Sin conexión con el servidor'; }
}

async function cargarHoy() {
  const t = await api('/api/clase-hoy'), btn = $('#btn-marcar');
  if (!window.__reloj) { window.__reloj = 1; iniciarReloj($('#reloj'), t.hora_servidor); }
  $('#fecha-hoy').textContent = t.fecha;
  const hoy = historial.find((h) => h.fecha === t.fecha);
  btn.classList.remove('live');
  if (!t.hay_clase) { $('#t-titulo').textContent = 'Hoy no hay clase programada'; $('#t-sub').textContent = proxima() ; btn.disabled = true; btn.textContent = 'Sin clase hoy'; return; }
  $('#t-sub').textContent = `Horario: ${t.hora_inicio} – ${t.hora_fin}`;
  if (hoy && (hoy.estado === 'PUNTUAL' || hoy.estado === 'ATRASO')) { $('#t-titulo').textContent = 'Asistencia registrada ✓'; $('#t-sub').textContent = `Marcaste a las ${hoy.hora_marca} · ${hoy.estado}`; btn.disabled = true; btn.textContent = 'Ya marcaste hoy'; return; }
  $('#t-titulo').textContent = 'Tienes clase hoy'; btn.disabled = false; btn.textContent = 'Marcar asistencia'; btn.classList.add('live');
}
const proxima = () => { const n = historial.find((h) => h.estado === 'PENDIENTE'); return n ? `Próxima clase: ${n.fecha} a las ${n.hora_inicio}` : 'No quedan clases pendientes en este módulo.'; };

$('#btn-marcar').addEventListener('click', async () => {
  const btn = $('#btn-marcar'); btn.disabled = true;
  try { const r = await api('/api/marcar', { method: 'POST', body: { registro: estudiante.registro } }); toast(`${r.mensaje} (${r.hora})`, 'ok'); }
  catch (e) { toast(e.message, 'err'); }
  await cargarTodo();
});

async function cargarHistorial() {
  historial = await api('/api/historial/' + encodeURIComponent(estudiante.registro));
  const c = { PUNTUAL: 0, ATRASO: 0, FALTA: 0, PENDIENTE: 0 }; historial.forEach((h) => c[h.estado]++);
  $('#c-puntual').textContent = c.PUNTUAL; $('#c-atraso').textContent = c.ATRASO; $('#c-falta').textContent = c.FALTA;
  const cont = c.PUNTUAL + c.ATRASO + c.FALTA;
  $('#c-pct').textContent = cont ? Math.round(((c.PUNTUAL + c.ATRASO) / cont) * 100) + '%' : '–';
  donut($('#donut'), [{ n: 'Puntuales', v: c.PUNTUAL, c: '#34e3a4' }, { n: 'Atrasos', v: c.ATRASO, c: '#f4b740' }, { n: 'Faltas', v: c.FALTA, c: '#f0627b' }, { n: 'Pendientes', v: c.PENDIENTE, c: '#3b5666' }], cont ? Math.round(((c.PUNTUAL + c.ATRASO) / cont) * 100) + '%' : '–', 'asistencia');
  $('#h-count').textContent = historial.length + ' clases';
  $('#tbody').innerHTML = historial.length
    ? [...historial].reverse().map((h) => `<tr><td class="num"><b>${esc(h.fecha)}</b></td><td class="num muted">${esc(h.hora_inicio)} – ${esc(h.hora_fin)}</td><td class="num">${esc(h.hora_marca)}</td><td>${badge(h.estado)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Aún no hay fechas cargadas para este módulo. Pide al docente que importe el calendario.</td></tr>';
  if (!mesVista) { const ref = historial.find((h) => h.estado === 'PENDIENTE') || historial[historial.length - 1]; const f = ref ? ref.fecha : null; mesVista = f ? { m: +f.slice(3, 5) - 1, y: +f.slice(6) } : { m: new Date().getMonth(), y: new Date().getFullYear() }; }
  pintarCalendario();
}

function pintarCalendario() {
  const { m, y } = mesVista; $('#mes').textContent = `${MESES[m]} ${y}`;
  const primero = new Date(y, m, 1), dias = new Date(y, m + 1, 0).getDate(), off = (primero.getDay() + 6) % 7;
  const mapa = Object.fromEntries(historial.map((h) => [h.fecha, h.estado])); const hoy = $('#fecha-hoy').textContent;
  let html = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(off);
  for (let d = 1; d <= dias; d++) {
    const f = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`, e = mapa[f];
    html += `<div class="d ${e ? 'cls ' + e : ''} ${f === hoy ? 'today' : ''}" ${e ? `title="${f} · ${e}"` : ''}>${d}</div>`;
  }
  $('#cal').innerHTML = html;
}
$('#prev').onclick = () => { mesVista.m--; if (mesVista.m < 0) { mesVista.m = 11; mesVista.y--; } pintarCalendario(); };
$('#next').onclick = () => { mesVista.m++; if (mesVista.m > 11) { mesVista.m = 0; mesVista.y++; } pintarCalendario(); };

async function cargarTodo() {
  try { await cargarHistorial(); await cargarHoy(); pintarCalendario(); }
  catch (e) { toast(e.message, 'err'); $('#t-titulo').textContent = 'No se pudo cargar tu información'; $('#t-sub').textContent = e.message; }
}
cargarCabecera(); cargarTodo();
