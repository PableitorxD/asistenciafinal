const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tenants.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Tabla de Tenants (Control Center)
  db.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      correo_admin TEXT NOT NULL,
      plan TEXT NOT NULL,
      estado TEXT DEFAULT 'provisionando',
      ip_instancia TEXT,
      motor_infra TEXT DEFAULT 'terraform',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de Planes
  db.run(`
    CREATE TABLE IF NOT EXISTS planes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      max_estudiantes INTEGER,
      tipo_instancia TEXT,
      almacenamiento_gb INTEGER
    )
  `);

  // Insertar planes por defecto si no existen
  db.run(`
    INSERT OR IGNORE INTO planes (id, nombre, max_estudiantes, tipo_instancia, almacenamiento_gb)
    VALUES 
      ('basico', 'Básico', 100, 't2.micro', 10),
      ('estandar', 'Estándar', 1000, 't2.small', 50),
      ('avanzado', 'Avanzado', 5000, 't2.medium', 200)
  `);

  console.log('Base de datos central tenants.db inicializada correctamente.');
});

db.close();