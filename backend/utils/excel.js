// Normalización de datos que vienen de Excel (fechas, horas y nombres de columnas)
const xlsx = require('xlsx');

const pad = (n) => String(n).padStart(2, '0');

function normalizarClave(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fechaValida(d, m, y) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Devuelve siempre "dd/mm/yyyy" o null. Acepta: número serial de Excel, Date,
// "5/10/26", "05/10/2026", "5-10-2026", "2026-10-05".
function normalizarFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  let d, m, y;
  if (v instanceof Date) {
    d = v.getDate(); m = v.getMonth() + 1; y = v.getFullYear();
  } else if (typeof v === 'number') {
    const p = xlsx.SSF.parse_date_code(v);
    if (!p) return null;
    d = p.d; m = p.m; y = p.y;
  } else {
    const s = String(v).trim();
    let r = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (r) { d = +r[1]; m = +r[2]; y = +r[3]; if (r[3].length === 2) y += 2000; }
    else if ((r = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else return null;
  }
  return fechaValida(d, m, y) ? `${pad(d)}/${pad(m)}/${y}` : null;
}

// Devuelve siempre "HH:mm" o null. Acepta: fracción de día de Excel, "18:00", "18:00:00", "6:00 PM".
function normalizarHora(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number') {
    const frac = v >= 1 ? v - Math.floor(v) : v;
    const mins = Math.round(frac * 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const r = String(v).trim().match(/^(\d{1,2})[:.h](\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i);
  if (!r) return null;
  let h = +r[1]; const mi = +r[2];
  if (r[3]) { const pm = r[3].toLowerCase() === 'p'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h > 23 || mi > 59 ? null : `${pad(h)}:${pad(mi)}`;
}

// "dd/mm/yyyy" -> "yyyymmdd" (para ordenar y comparar)
const fechaISO = (f) => `${f.slice(6, 10)}${f.slice(3, 5)}${f.slice(0, 2)}`;
const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Lee la primera hoja y devuelve filas con las claves normalizadas + columnas detectadas
function leerHoja(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = xlsx.utils.sheet_to_json(ws, { defval: '', raw: true });
  const columnas = filas.length ? Object.keys(filas[0]) : [];
  const norm = filas.map((f) => {
    const o = {};
    for (const k of Object.keys(f)) o[normalizarClave(k)] = f[k];
    return o;
  });
  return { filas: norm, columnas };
}

function campo(fila, candidatos) {
  for (const c of candidatos) if (fila[c] !== undefined && fila[c] !== '') return fila[c];
  return undefined;
}

module.exports = { normalizarFecha, normalizarHora, fechaISO, aMinutos, leerHoja, campo, pad };
