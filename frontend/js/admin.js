if (!sessionStorage.getItem('adminToken')) location.href = 'index.html';

const VISTAS = [
  ['resumen', 'Resumen', 'chart'], ['asistencias', 'Asistencias', 'list'], ['estudiantes', 'Estudiantes', 'users'],
  ['fechas', 'Fechas de clase', 'cal'], ['importar', 'Importar Excel', 'up'], ['bitacora', 'Actividades', 'shield'],
];
let vista = 'resumen', asist = [], estudiantes = [];

$('#nav').innerHTML = VISTAS.map(([id, n, ic]) => `<button data-v="${id}">${ICONS[ic]}<span>${n}</span></button>`).join('');
$('#nuevo-modulo').innerHTML = `${ICONS.refresh}<span>Nuevo módulo</span>`;
$('#logout').innerHTML = `${ICONS.out}<span>Cerrar sesión</span>`;
$('#logout').onclick = () => { sessionStorage.removeItem('adminToken'); location.href = 'index.html'; };
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) ir(b.dataset.v); });

function ir(v) {
  vista = v; location.hash = v;
  document.querySelectorAll('[data-view]').forEach((s) => s.classList.toggle('hidden', s.dataset.view !== v));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  $('#titulo').textContent = VISTAS.find((x) => x[0] === v)[1];
  cargar();
}

async function cabecera() {
  const r = await api('/api/admin/resumen', { admin: true });
  $('#modulo').textContent = 'Módulo activo: ' + (r.modulo || '—'); $('#fecha-hoy').textContent = r.hoy;
  if (!window.__reloj) { window.__reloj = 1; iniciarReloj($('#reloj'), r.hora_servidor); }
  return r;
}

async function cargar() {
  try {
    if (vista === 'resumen') await vResumen();
    else { await cabecera(); await ({ asistencias: vAsist, estudiantes: vEst, fechas: vFechas, importar: async () => {}, bitacora: vBit })[vista](); }
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- Resumen ----------
async function vResumen() {
  const r = await cabecera();
  $('#k-pct').textContent = r.porcentaje === null ? '–' : r.porcentaje + '%'; $('#k-est').textContent = r.estudiantes;
  $('#k-clases').textContent = r.clases; $('#k-hoy').textContent = r.presentes_hoy;
  barras($('#chart'), r.por_fecha.filter((f) => f.presentes + f.ausentes).map((f) => ({ etq: f.fecha.slice(0, 5), a: f.presentes, b: f.ausentes })));
  const e = r.estados;
  donut($('#donut'), [{ n: 'Puntuales', v: e.PUNTUAL, c: '#34e3a4' }, { n: 'Atrasos', v: e.ATRASO, c: '#f4b740' }, { n: 'Faltas', v: e.FALTA, c: '#f0627b' }, { n: 'Pendientes', v: e.PENDIENTE, c: '#3b5666' }], r.porcentaje === null ? '–' : r.porcentaje + '%', 'asistencia');
  const max = Math.max(1, ...r.mas_faltas.map((x) => x.faltas));
  $('#top').innerHTML = r.mas_faltas.length ? r.mas_faltas.map((x) => `<div style="display:grid;grid-template-columns:minmax(120px,220px) 1fr 40px;gap:14px;align-items:center;margin-bottom:10px"><span>${esc(x.nombre)}</span><div class="bar"><i style="width:${(x.faltas / max) * 100}%;background:var(--red)"></i></div><b class="num">${x.faltas}</b></div>`).join('') : '<p class="muted small">Sin faltas registradas todavía.</p>';
}

// ---------- Asistencias ----------
async function vAsist() {
  asist = await api('/api/admin/asistencias', { admin: true });
  const sel = $('#f-fecha'), actual = sel.value, fechas = [...new Set(asist.map((a) => a.fecha))];
  sel.innerHTML = '<option value="">Todas las fechas</option>' + fechas.map((f) => `<option ${f === actual ? 'selected' : ''}>${esc(f)}</option>`).join('');
  pintarAsist();
}
function pintarAsist() {
  const q = $('#q').value.toLowerCase(), f = $('#f-fecha').value, e = $('#f-estado').value;
  const filas = asist.filter((a) => (!f || a.fecha === f) && (!e || a.estado === e) && (a.nombre.toLowerCase().includes(q) || a.registro.includes(q)));
  $('#t-asist').innerHTML = filas.length ? filas.slice(0, 400).map((a) => `<tr><td class="num"><b>${esc(a.registro)}</b></td><td>${esc(a.nombre)}</td><td class="num">${esc(a.fecha)}</td><td class="num muted">${esc(a.hora_marca)}</td><td>${badge(a.estado)}</td>
    <td><select class="input" style="padding:5px 28px 5px 9px;font-size:.8rem;width:auto" data-r="${esc(a.registro)}" data-f="${esc(a.fecha)}"><option value="">Cambiar a…</option>${['PUNTUAL', 'ATRASO', 'FALTA'].filter((s) => s !== a.estado).map((s) => `<option>${s}</option>`).join('')}</select></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No hay registros. Importa los Excel de estudiantes y fechas desde “Importar Excel”.</td></tr>';
  $('#t-asist-n').textContent = filas.length > 400 ? `Mostrando 400 de ${filas.length}. Usa los filtros para acotar.` : `${filas.length} registros`;
}
['q', 'f-fecha', 'f-estado'].forEach((id) => $('#' + id).addEventListener('input', pintarAsist));
$('#t-asist').addEventListener('change', async (e) => {
  const s = e.target.closest('select'); if (!s || !s.value) return;
  try { const r = await api('/api/admin/cambiar-asistencia', { method: 'POST', admin: true, body: { registro: s.dataset.r, fecha: s.dataset.f, nuevoEstado: s.value } }); toast(r.mensaje, 'ok'); vAsist(); }
  catch (err) { toast(err.message, 'err'); }
});

// ---------- Estudiantes ----------
async function vEst() { estudiantes = await api('/api/admin/estudiantes', { admin: true }); pintarEst(); }
function pintarEst() {
  const q = $('#q2').value.toLowerCase(); const f = estudiantes.filter((s) => s.nombre.toLowerCase().includes(q) || s.registro.includes(q));
  $('#t-est').innerHTML = f.length ? f.map((s) => `<tr><td class="num"><b>${esc(s.registro)}</b></td><td><span style="display:flex;gap:10px;align-items:center"><span class="avatar" style="width:30px;height:30px;font-size:.72rem">${esc(initials(s.nombre))}</span>${esc(s.nombre)}</span></td><td class="muted">${esc(s.correo)}</td>
    <td class="num" style="color:var(--mint)">${s.puntuales}</td><td class="num" style="color:var(--amber)">${s.atrasos}</td><td class="num" style="color:var(--red)">${s.faltas}</td>
    <td style="min-width:130px">${s.porcentaje === null ? '<span class="muted">–</span>' : `<div style="display:flex;gap:10px;align-items:center"><div class="bar" style="flex:1"><i style="width:${s.porcentaje}%"></i></div><b class="num small">${s.porcentaje}%</b></div>`}</td></tr>`).join('')
    : '<tr><td colspan="7" class="empty">No hay estudiantes en este módulo.</td></tr>';
}
$('#q2').addEventListener('input', pintarEst);

// ---------- Fechas ----------
async function vFechas() {
  const f = await api('/api/admin/fechas', { admin: true }); $('#n-fechas').textContent = f.length + ' clases';
  $('#t-fechas').innerHTML = f.length ? f.map((x) => `<tr><td class="num"><b>${esc(x.fecha)}</b></td><td class="num">${esc(x.hora_inicio)}</td><td class="num">${esc(x.hora_fin)}</td><td>${badge(x.situacion)}</td>
    <td class="num">${x.puntuales + x.atrasos} / ${x.estudiantes}</td><td style="text-align:right"><button class="btn sm danger" data-del="${esc(x.fecha)}">Eliminar</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Todavía no hay fechas. Súbelas en “Importar Excel”.</td></tr>';
}
$('#t-fechas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  if (!(await dialog({ titulo: 'Eliminar fecha', texto: `¿Quitar la clase del ${b.dataset.del} del calendario?`, ok: 'Eliminar', peligro: true }))) return;
  try { toast((await api('/api/admin/fechas?fecha=' + encodeURIComponent(b.dataset.del), { method: 'DELETE', admin: true })).mensaje, 'ok'); vFechas(); } catch (err) { toast(err.message, 'err'); }
});

// ---------- Bitácora ----------
async function vBit() {
  const r = await api('/api/admin/auditoria', { admin: true });
  $('#t-bit').innerHTML = r.length ? r.map((x) => `<tr><td style="color:var(--teal);font-weight:700">${esc(x.usuario)}</td><td>${esc(x.accion)}</td><td class="num">${esc(x.fecha)}</td><td class="num muted">${esc(x.hora)}</td><td class="muted">${esc(x.registro_afectado)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin actividad.</td></tr>';
}

// ---------- Importar ----------
[['alumnos', 'n-alumnos'], ['fechas', 'n-fechas-f']].forEach(([k, n]) => {
  const drop = $('#d-' + k), inp = $('#file-' + k);
  const mostrar = () => { drop.classList.toggle('has', !!inp.files[0]); $('#' + n).textContent = inp.files[0] ? inp.files[0].name : 'Arrastra o haz clic · .xlsx'; };
  inp.addEventListener('change', mostrar);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { inp.files = e.dataTransfer.files; mostrar(); } });
});

$('#btn-importar').addEventListener('click', async () => {
  const a = $('#file-alumnos').files[0], f = $('#file-fechas').files[0];
  if (!a || !f) return toast('Selecciona ambos archivos Excel antes de procesar.', 'err');
  const fd = new FormData(); fd.append('archivoAlumnos', a); fd.append('archivoFechas', f); fd.append('reemplazar', $('#reemplazar').checked);
  const btn = $('#btn-importar'), rep = $('#reporte'); btn.disabled = true; btn.textContent = 'Procesando…';
  try {
    const r = await api('/api/admin/importar-estudiantes', { method: 'POST', body: fd, admin: true });
    const rech = (t, l) => l.length ? `<ul>${l.map((x) => `<li>${t} fila ${x.fila}: ${esc(x.motivo)}</li>`).join('')}</ul>` : '';
    rep.innerHTML = `<b style="color:var(--mint)">${esc(r.mensaje)}</b><div class="chips">${[...new Set(r.fechas.lista)].map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>${rech('Estudiantes', r.estudiantes.rechazados)}${rech('Fechas', r.fechas.rechazadas)}`;
    rep.classList.remove('hidden'); toast(r.mensaje, 'ok');
  } catch (e) { rep.innerHTML = `<b style="color:var(--red)">${esc(e.message)}</b>`; rep.classList.remove('hidden'); toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = 'Procesar archivos';
});

// ---------- Nuevo módulo ----------
$('#nuevo-modulo').addEventListener('click', async () => {
  if (!(await dialog({ titulo: 'Reiniciar módulo', texto: 'El módulo actual se archiva y empieza uno nuevo, vacío. ¿Continuar?', ok: 'Continuar', peligro: true }))) return;
  const nombre = await dialog({ titulo: 'Nombre del nuevo módulo', input: { placeholder: 'Ej. Power BI Avanzado' }, ok: 'Crear módulo' });
  if (!nombre) return;
  try { toast((await api('/api/admin/reiniciar-modulo', { method: 'POST', admin: true, body: { nuevoNombre: nombre } })).mensaje, 'ok'); ir('importar'); } catch (e) { toast(e.message, 'err'); }
});

ir(VISTAS.some((v) => v[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'resumen');
