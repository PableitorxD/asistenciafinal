require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fileUpload = require('express-fileupload');
const { normalizarFecha, normalizarHora, fechaISO, aMinutos, leerHoja, campo, pad } = require('./utils/excel');
const { deployTenantInfrastructure } = require('./services/provisioner');

// ---------- Configuración (todo viene del .env) ----------
const CFG = {
  port: Number(process.env.PORT) || 3000,
  apiUrl: (process.env.API_URL || '').replace(/\/$/, ''),
  cors: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
  dbPath: process.env.DB_PATH || './asistencia.db',
  adminKey: process.env.ADMIN_KEY || 'admin123',
  tz: process.env.TZ_APP || 'America/La_Paz',
  validarHorario: String(process.env.VALIDAR_HORARIO).toLowerCase() === 'true',
  tolerancia: Number(process.env.TOLERANCIA_MIN ?? 15),
  anticipo: Number(process.env.ANTICIPO_MIN ?? 30),
  frontendDir: path.resolve(__dirname, process.env.FRONTEND_DIR || '../frontend'),
};

const app = express();
app.use(cors({ origin: CFG.cors.includes('*') ? true : CFG.cors }));
app.use(express.json());
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } }));

// Config dinámica para el frontend: lee API_URL del .env (un solo lugar)
app.get('/js/config.js', (req, res) => {
  res.type('application/javascript').send(`window.APP_CONFIG = ${JSON.stringify({ API_URL: CFG.apiUrl })};`);
});
app.use(express.static(CFG.frontendDir));

// ---------- Base de datos (promesas) ----------
const db = new sqlite3.Database(CFG.dbPath, (e) => e && console.error(e.message));
const run = (sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { e ? ko(e) : ok(this); }));
const get = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, r) => (e ? ko(e) : ok(r))));
const all = (sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, r) => (e ? ko(e) : ok(r))));
const ah = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: e.message }); });

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS modulos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, activo INTEGER DEFAULT 1)`);
  await run(`CREATE TABLE IF NOT EXISTS estudiantes (registro TEXT, nombre TEXT, correo TEXT, modulo_id INTEGER, PRIMARY KEY (registro, modulo_id))`);
  await run(`CREATE TABLE IF NOT EXISTS fechas_clase (fecha TEXT, hora_initDBcio TEXT, hora_fin TEXT, modulo_id INTEGER, PRIMARY KEY (fecha, modulo_id))`);
  await run(`CREATE TABLE IF NOT EXISTS asistencias (id INTEGER PRIMARY KEY AUTOINCREMENT, registro TEXT, fecha TEXT, hora_marca TEXT, estado TEXT, modulo_id INTEGER)`);
  await run(`CREATE TABLE IF NOT EXISTS auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT, accion TEXT, fecha TEXT, hora TEXT, registro_afectado TEXT)`);
  try { await run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_asistencia ON asistencias(registro, fecha, modulo_id)`); } catch (_) { /* ya había duplicados */ }
  if (!(await get(`SELECT id FROM modulos WHERE activo = 1`))) {
    await run(`INSERT INTO modulos (nombre, activo) VALUES ('Módulo initDBcial', 1)`);
  }
}

// ---------- Utilidades ----------
function ahora() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: CFG.tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hh = pad(Number(p.hour) % 24);
  return { fecha: `${p.day}/${p.month}/${p.year}`, hora: `${hh}:${p.minute}`, horaSeg: `${hh}:${p.minute}:${p.second}` };
}
const moduloActivo = () => get(`SELECT * FROM modulos WHERE activo = 1`);

function auditar(usuario, accion, afectado) {
  const t = ahora();
  return run(`INSERT INTO auditoria (usuario, accion, fecha, hora, registro_afectado) VALUES (?,?,?,?,?)`,
    [usuario, accion, t.fecha, t.horaSeg, afectado]).catch(console.error);
}

// Estado real de una celda (estudiante x fecha): lo marcado, FALTA o PENDIENTE (si aún no ocurre)
function estadoCelda(f, marca, t) {
  if (marca) return marca;
  const a = fechaISO(f.fecha), h = fechaISO(t.fecha);
  if (a > h) return 'PENDIENTE';
  if (a === h && aMinutos(t.hora) <= aMinutos(f.hora_fin)) return 'PENDIENTE';
  return 'FALTA';
}

async function matriz(modId) {
  const t = ahora();
  const rows = await all(
    `SELECT e.registro, e.nombre, f.fecha, f.hora_initDBcio, f.hora_fin, a.hora_marca, a.estado AS marca
       FROM estudiantes e
       JOIN fechas_clase f ON f.modulo_id = e.modulo_id
       LEFT JOIN asistencias a ON a.registro = e.registro AND a.fecha = f.fecha AND a.modulo_id = e.modulo_id
      WHERE e.modulo_id = ?`, [modId]);
  return rows.map((r) => ({
    registro: r.registro, nombre: r.nombre, fecha: r.fecha, hora_initDBcio: r.hora_inicio, hora_fin: r.hora_fin,
    hora_marca: r.hora_marca || '--:--', estado: estadoCelda(r, r.marca, t),
  })).sort((x, y) => fechaISO(y.fecha).localeCompare(fechaISO(x.fecha)) || x.nombre.localeCompare(y.nombre));
}

// ---------- Rutas públicas ----------
app.get('/api/health', (req, res) => res.json({ ok: true, hora: ahora() }));

app.get('/api/modulo-activo', ah(async (req, res) => {
  const m = await moduloActivo();
  res.json({ nombre: m ? m.nombre : 'No hay ningún módulo activo' });
}));

app.get('/api/clase-hoy', ah(async (req, res) => {
  const m = await moduloActivo(); const t = ahora();
  const c = m && await get(`SELECT * FROM fechas_clase WHERE fecha = ? AND modulo_id = ?`, [t.fecha, m.id]);
  res.json({ hay_clase: !!c, fecha: t.fecha, hora_servidor: t.hora, hora_inicio: c?.hora_inicio || null, hora_fin: c?.hora_fin || null, validar_horario: CFG.validarHorario });
}));

// RF-01 Ingreso de estudiantes
app.post('/api/login', ah(async (req, res) => {
  const login = String(req.body.login || '').trim();
  if (!login) return res.status(400).json({ error: 'Ingresa tu correo o número de registro' });
  const row = await get(`SELECT e.* FROM estudiantes e JOIN modulos m ON e.modulo_id = m.id
                          WHERE m.activo = 1 AND (lower(e.correo) = lower(?) OR e.registro = ?)`, [login, login]);
  if (!row) return res.status(404).json({ error: 'Estudiante no encontrado en el módulo activo' });
  auditar(row.registro, 'Inicio de Sesión', row.registro);
  res.json({ estudiante: row });
}));

// RF-03 Registrar asistencia (fecha y hora las pone el servidor)
app.post('/api/marcar', ah(async (req, res) => {
  const registro = String(req.body.registro || '');
  const m = await moduloActivo();
  if (!m) return res.status(400).json({ error: 'No hay módulo activo' });
  if (!(await get(`SELECT 1 FROM estudiantes WHERE registro = ? AND modulo_id = ?`, [registro, m.id])))
    return res.status(404).json({ error: 'Estudiante no pertenece al módulo activo' });
  const t = ahora();
  const clase = await get(`SELECT * FROM fechas_clase WHERE fecha = ? AND modulo_id = ?`, [t.fecha, m.id]);
  if (!clase) return res.status(400).json({ error: 'Hoy no es día de clase programada' });
  if (await get(`SELECT 1 FROM asistencias WHERE registro = ? AND fecha = ? AND modulo_id = ?`, [registro, t.fecha, m.id]))
    return res.status(400).json({ error: 'Ya registraste tu asistencia hoy' });

  let estado = 'PUNTUAL';
  if (CFG.validarHorario) {
    const now = aMinutos(t.hora), ini = aMinutos(clase.hora_inicio), fin = aMinutos(clase.hora_fin);
    if (now < ini - CFG.anticipo) return res.status(400).json({ error: `La asistencia se habilita desde las ${pad(Math.floor((ini - CFG.anticipo) / 60))}:${pad((ini - CFG.anticipo) % 60)}` });
    if (now > fin) return res.status(400).json({ error: 'La clase de hoy ya terminó' });
    if (now > ini + CFG.tolerancia) estado = 'ATRASO';
  }
  await run(`INSERT INTO asistencias (registro, fecha, hora_marca, estado, modulo_id) VALUES (?,?,?,?,?)`, [registro, t.fecha, t.hora, estado, m.id]);
  auditar(registro, `Marcó asistencia (${estado})`, registro);
  res.json({ mensaje: estado === 'ATRASO' ? 'Asistencia registrada con atraso' : 'Asistencia registrada con éxito', estado, hora: t.hora });
}));

// RF-04 / RF-08 Historial completo del estudiante (todas las fechas del módulo)
app.get('/api/historial/:registro', ah(async (req, res) => {
  const m = await moduloActivo(); const t = ahora();
  if (!m) return res.json([]);
  const rows = await all(
    `SELECT f.fecha, f.hora_inicio, f.hora_fin, a.hora_marca, a.estado AS marca
       FROM fechas_clase f LEFT JOIN asistencias a ON a.fecha = f.fecha AND a.registro = ? AND a.modulo_id = f.modulo_id
      WHERE f.modulo_id = ?`, [req.params.registro, m.id]);
  res.json(rows.map((r) => ({ fecha: r.fecha, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, hora_marca: r.hora_marca || '--:--', estado: estadoCelda(r, r.marca, t) }))
    .sort((a, b) => fechaISO(a.fecha).localeCompare(fechaISO(b.fecha))));
}));

// ---------- Administrador ----------
const tokens = new Map(); // token -> expira
app.post('/api/admin/login', (req, res) => {
  const a = Buffer.from(String(req.body.clave || '')), b = Buffer.from(CFG.adminKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + 8 * 3600 * 1000);
  auditar('Administrador', 'Inicio de sesión administrador', '-');
  res.json({ token });
});

function auth(req, res, next) {
  const exp = tokens.get(req.headers['x-admin-token']);
  if (!exp || exp < Date.now()) return res.status(401).json({ error: 'Sesión de administrador expirada' });
  next();
}
//app.use('/api/admin', (req, res, next) => (req.path === '/login' ? next() : auth(req, res, next)));
app.use('/api/admin', (req, res, next) => (req.path === '/login' || req.path === '/tenants' ? next() : auth(req, res, next)));

app.get('/api/admin/asistencias', ah(async (req, res) => {
  const m = await moduloActivo(); res.json(m ? await matriz(m.id) : []);
}));

app.get('/api/admin/estudiantes', ah(async (req, res) => {
  const m = await moduloActivo(); if (!m) return res.json([]);
  const est = await all(`SELECT registro, nombre, correo FROM estudiantes WHERE modulo_id = ? ORDER BY nombre`, [m.id]);
  const mx = await matriz(m.id); const por = {};
  for (const r of mx) { const o = (por[r.registro] ||= { P: 0, A: 0, F: 0, T: 0 });
    if (r.estado === 'PUNTUAL') o.P++; else if (r.estado === 'ATRASO') o.A++; else if (r.estado === 'FALTA') o.F++; if (r.estado !== 'PENDIENTE') o.T++; }
  res.json(est.map((e) => { const o = por[e.registro] || { P: 0, A: 0, F: 0, T: 0 };
    return { ...e, puntuales: o.P, atrasos: o.A, faltas: o.F, porcentaje: o.T ? Math.round(((o.P + o.A) / o.T) * 100) : null }; }));
}));

app.get('/api/admin/fechas', ah(async (req, res) => {
  const m = await moduloActivo(); if (!m) return res.json([]);
  const t = ahora();
  const fechas = await all(`SELECT fecha, hora_inicio, hora_fin FROM fechas_clase WHERE modulo_id = ?`, [m.id]);
  const cuenta = await all(`SELECT fecha, estado, COUNT(*) n FROM asistencias WHERE modulo_id = ? GROUP BY fecha, estado`, [m.id]);
  const total = (await get(`SELECT COUNT(*) n FROM estudiantes WHERE modulo_id = ?`, [m.id])).n;
  res.json(fechas.sort((a, b) => fechaISO(a.fecha).localeCompare(fechaISO(b.fecha))).map((f) => {
    const c = cuenta.filter((x) => x.fecha === f.fecha); const n = (e) => c.find((x) => x.estado === e)?.n || 0;
    const a = fechaISO(f.fecha), h = fechaISO(t.fecha);
    return { ...f, situacion: a < h ? 'PASADA' : a > h ? 'PROXIMA' : 'HOY', puntuales: n('PUNTUAL'), atrasos: n('ATRASO'), estudiantes: total };
  }));
}));

app.get('/api/admin/resumen', ah(async (req, res) => {
  const m = await moduloActivo(); const t = ahora();
  const mx = m ? await matriz(m.id) : [];
  const porEstado = { PUNTUAL: 0, ATRASO: 0, FALTA: 0, PENDIENTE: 0 }; const porFecha = {}; const porEst = {};
  for (const r of mx) {
    porEstado[r.estado]++;
    const f = (porFecha[r.fecha] ||= { fecha: r.fecha, presentes: 0, ausentes: 0 });
    if (r.estado === 'PUNTUAL' || r.estado === 'ATRASO') f.presentes++; else if (r.estado === 'FALTA') f.ausentes++;
    const e = (porEst[r.registro] ||= { registro: r.registro, nombre: r.nombre, faltas: 0 }); if (r.estado === 'FALTA') e.faltas++;
  }
  const cont = porEstado.PUNTUAL + porEstado.ATRASO + porEstado.FALTA;
  res.json({
    modulo: m?.nombre, hoy: t.fecha, hora_servidor: t.hora,
    estudiantes: m ? (await get(`SELECT COUNT(*) n FROM estudiantes WHERE modulo_id = ?`, [m.id])).n : 0,
    clases: m ? (await get(`SELECT COUNT(*) n FROM fechas_clase WHERE modulo_id = ?`, [m.id])).n : 0,
    porcentaje: cont ? Math.round(((porEstado.PUNTUAL + porEstado.ATRASO) / cont) * 100) : null,
    presentes_hoy: mx.filter((r) => r.fecha === t.fecha && (r.estado === 'PUNTUAL' || r.estado === 'ATRASO')).length,
    estados: porEstado,
    por_fecha: Object.values(porFecha).sort((a, b) => fechaISO(a.fecha).localeCompare(fechaISO(b.fecha))),
    mas_faltas: Object.values(porEst).filter((e) => e.faltas).sort((a, b) => b.faltas - a.faltas).slice(0, 5),
  });
}));

app.get('/api/admin/auditoria', ah(async (req, res) => res.json(await all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 500`))));

// RF-04 / RF-07 Corregir asistencia (también fuera de fecha)
app.post('/api/admin/cambiar-asistencia', ah(async (req, res) => {
  const { registro, fecha, nuevoEstado } = req.body;
  if (!['PUNTUAL', 'ATRASO', 'FALTA'].includes(nuevoEstado)) return res.status(400).json({ error: 'Estado no válido' });
  const m = await moduloActivo(); if (!m) return res.status(400).json({ error: 'No hay módulo activo' });
  if (!(await get(`SELECT 1 FROM fechas_clase WHERE fecha = ? AND modulo_id = ?`, [fecha, m.id]))) return res.status(400).json({ error: 'Esa fecha no pertenece al módulo' });
  const ex = await get(`SELECT id FROM asistencias WHERE registro = ? AND fecha = ? AND modulo_id = ?`, [registro, fecha, m.id]);
  if (ex) await run(`UPDATE asistencias SET estado = ? WHERE id = ?`, [nuevoEstado, ex.id]);
  else await run(`INSERT INTO asistencias (registro, fecha, hora_marca, estado, modulo_id) VALUES (?,?,?,?,?)`, [registro, fecha, '', nuevoEstado, m.id]); // corrección del docente: sin hora de marcado
  auditar('Administrador', `Corrigió asistencia del ${fecha} a ${nuevoEstado}`, registro);
  res.json({ mensaje: 'Asistencia actualizada' });
}));

app.delete('/api/admin/fechas', ah(async (req, res) => {
  const m = await moduloActivo(); const fecha = String(req.query.fecha || '');
  const r = await run(`DELETE FROM fechas_clase WHERE fecha = ? AND modulo_id = ?`, [fecha, m.id]);
  await auditar('Administrador', 'Eliminó fecha de clase', fecha);
  res.json({ mensaje: r.changes ? 'Fecha eliminada' : 'La fecha no existía' });
}));

// RF-11 / RF-12 Importar Excel de estudiantes y de fechas
const COL = {
  reg: ['numero de registro', 'registro', 'nro registro', 'n registro', 'no registro', 'matricula', 'ci'],
  nombre: ['nombre completo', 'nombre', 'nombres', 'estudiante'],
  correo: ['correo electronico', 'correo', 'email', 'e mail'],
  fecha: ['fecha', 'fecha de clase', 'dia'],
  ini: ['hora inicio', 'hora de inicio', 'inicio'],
  fin: ['hora fin', 'hora de fin', 'hora final', 'fin'],
};

app.post('/api/admin/importar-estudiantes', ah(async (req, res) => {
  const fa = req.files?.archivoAlumnos, ff = req.files?.archivoFechas;
  if (!fa || !ff) return res.status(400).json({ error: 'Falta seleccionar alguno de los dos archivos Excel.' });
  const m = await moduloActivo(); if (!m) return res.status(400).json({ error: 'No hay módulo activo' });
  const reemplazar = String(req.body.reemplazar) === 'true';

  let hojaA, hojaF;
  try { hojaA = leerHoja(fa.data); hojaF = leerHoja(ff.data); }
  catch (e) { return res.status(400).json({ error: 'No se pudo leer alguno de los archivos. ¿Son .xlsx válidos?' }); }

  const alumnos = [], fechas = [], rechAlumnos = [], rechFechas = [];
  hojaA.filas.forEach((f, i) => {
    const reg = campo(f, COL.reg), nom = campo(f, COL.nombre), cor = campo(f, COL.correo);
    if (!reg || !nom || !cor) return rechAlumnos.push({ fila: i + 2, motivo: 'Faltan datos (registro, nombre o correo)' });
    alumnos.push({ registro: String(reg).trim(), nombre: String(nom).trim(), correo: String(cor).trim() });
  });
  hojaF.filas.forEach((f, i) => {
    const fe = normalizarFecha(campo(f, COL.fecha)), hi = normalizarHora(campo(f, COL.ini)), hf = normalizarHora(campo(f, COL.fin));
    if (!fe) return rechFechas.push({ fila: i + 2, motivo: `Fecha no válida: "${campo(f, COL.fecha) ?? ''}"` });
    if (!hi || !hf) return rechFechas.push({ fila: i + 2, motivo: 'Hora de inicio o fin no válida' });
    fechas.push({ fecha: fe, hi, hf });
  });
  if (!alumnos.length && !fechas.length)
    return res.status(400).json({ error: 'No se encontró ningún dato válido. Revisa los encabezados.', columnas_alumnos: hojaA.columnas, columnas_fechas: hojaF.columnas });

  await run('BEGIN');
  try {
    if (reemplazar) {
      await run(`DELETE FROM estudiantes WHERE modulo_id = ?`, [m.id]);
      await run(`DELETE FROM fechas_clase WHERE modulo_id = ?`, [m.id]);
    }
    for (const a of alumnos)
      await run(`INSERT INTO estudiantes (registro, nombre, correo, modulo_id) VALUES (?,?,?,?)
                 ON CONFLICT(registro, modulo_id) DO UPDATE SET nombre = excluded.nombre, correo = excluded.correo`, [a.registro, a.nombre, a.correo, m.id]);
    for (const f of fechas)
      await run(`INSERT INTO fechas_clase (fecha, hora_inicio, hora_fin, modulo_id) VALUES (?,?,?,?)
                 ON CONFLICT(fecha, modulo_id) DO UPDATE SET hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin`, [f.fecha, f.hi, f.hf, m.id]);
    await run('COMMIT');
  } catch (e) { await run('ROLLBACK'); throw e; }

  await auditar('Administrador', `Importó ${alumnos.length} estudiantes y ${fechas.length} fechas${reemplazar ? ' (reemplazando)' : ''}`, 'Excel');
  res.json({
    mensaje: `Importación completada: ${alumnos.length} estudiantes y ${fechas.length} fechas.`,
    estudiantes: { importados: alumnos.length, rechazados: rechAlumnos },
    fechas: { importadas: fechas.length, rechazadas: rechFechas, lista: fechas.map((f) => f.fecha) },
  });
}));

// RF-13 Reiniciar módulo (archiva el actual y crea uno nuevo vacío)
app.post('/api/admin/reiniciar-modulo', ah(async (req, res) => {
  const nombre = String(req.body.nuevoNombre || '').trim() || 'Nuevo Módulo Académico';
  await run(`UPDATE modulos SET activo = 0 WHERE activo = 1`);
  await run(`INSERT INTO modulos (nombre, activo) VALUES (?, 1)`, [nombre]);
  await auditar('Administrador', 'Reinició el sistema y activó un nuevo módulo', nombre);
  res.json({ mensaje: 'Módulo anterior archivado. Importa los Excel del nuevo módulo.' });
}));

// ---------- Gestión de Tenants (Proyecto Final Multi-Tenant) ----------
// 1. Ruta POST para crear el tenant
app.post('/api/admin/tenants', ah(async (req, res) => {
  const { id, nombre, correo_admin, plan, motor_infra } = req.body;
  
  if (!id || !nombre || !correo_admin || !plan) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para crear el tenant' });
  }

  // Verificar si el tenant ya existe en la BD central
  const dbCentral = new sqlite3.Database(path.join(__dirname, 'data/tenants.db'));
  
  dbCentral.get(`SELECT id FROM tenants WHERE id = ?`, [id], async (err, row) => {
    if (row) {
      dbCentral.close();
      return res.status(400).json({ error: 'Ya existe un tenant con ese identificador' });
    }

    // Insertar con estado 'provisionando'
    dbCentral.run(
      `INSERT INTO tenants (id, nombre, correo_admin, plan, estado, motor_infra) VALUES (?, ?, ?, ?, 'provisionando', ?)`,
      [id, nombre, correo_admin, plan, motor_infra || 'terraform'],
      async (insertErr) => {
        dbCentral.close();
        if (insertErr) {
          return res.status(500).json({ error: insertErr.message });
        }

        auditar('Administrador', `Inició creación del tenant ${nombre} (${plan})`, id);

        // Disparar Terraform (asegúrate de que tu provisioner devuelva la IP o el stdout parseado)
        deployTenantInfrastructure(id, nombre, plan, async (tfError, ipPublica) => {
          const dbUpdate = new sqlite3.Database(path.join(__dirname, 'data/tenants.db'));
          if (tfError) {
            dbUpdate.run(`UPDATE tenants SET estado = 'error' WHERE id = ?`, [id]);
            dbUpdate.close();
            console.error(`Error aprovisionando tenant ${id}:`, tfError);
          } else {
            // Guardamos la IP real que devolvió Terraform y pasamos a estado activo
            dbUpdate.run(
              `UPDATE tenants SET estado = 'activo', ip_instancia = ? WHERE id = ?`,
              [ipPublica || 'IP no disponible', id],
              () => {
                dbUpdate.close();
                console.log(`Tenant ${id} desplegado exitosamente en AWS con IP: ${ipPublica}`);
              }
            );
          }
        });

        res.json({ 
          mensaje: 'Tenant registrado y proceso de aprovisionamiento iniciado en AWS',
          tenant_id: id,
          estado: 'provisionando'
        });
      }
    );
  });
}));

// 2. Ruta GET para listar todos los tenants (Fuera del POST)
app.get('/api/admin/tenants', ah(async (req, res) => {
  const db = new sqlite3.Database(path.join(__dirname, 'data/tenants.db'));
  db.all(`SELECT * FROM tenants ORDER BY creado_en DESC`, [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
}));

// 3. Ruta GET para listar planes disponibles (Fuera del POST)
app.get('/api/admin/planes', ah(async (req, res) => {
  const db = new sqlite3.Database(path.join(__dirname, 'data/tenants.db'));
  db.all(`SELECT * FROM planes`, [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
}));

// ---------- Inicialización del app.listen (SIEMPRE AL FINAL) ----------
initDB().then(() => app.listen(CFG.port, '0.0.0.0', () => {
  console.log(`Servidor escuchando en red externa en el puerto ${CFG.port} (zona horaria: ${CFG.tz})`);
  //if (CFG.adminKey === 'admin123') console.warn('AVISO: cambia ADMIN_KEY en el archivo .env');
})).catch((e) => { console.error('No se pudo iniciar:', e); process.exit(1); });


