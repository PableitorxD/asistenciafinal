# Sistema de Asistencia

Backend Node.js + Express + SQLite y frontend en JavaScript vanilla.

## Estructura
```
backend/
  server.js            API completa (login, marcar, importar Excel, admin)
  utils/excel.js       Normaliza fechas, horas y encabezados de los Excel
  .env.example         ÚNICO lugar de configuración (puerto, URL, clave, reglas)
  package.json
frontend/
  index.html           Ingreso de estudiantes + acceso docente
  dashboard.html       Panel del estudiante
  admin.html           Panel docente (resumen, asistencias, estudiantes, fechas, importar, bitácora)
  css/app.css          Sistema de diseño compartido
  js/config.js         URL del backend (respaldo; el servidor la genera desde .env)
  js/core.js           Utilidades comunes (api, toast, gráficos)
  js/student.js        Lógica del estudiante
  js/admin.js          Lógica del docente
```

## Puesta en marcha
```
cd backend
npm install
copy .env.example .env        (Linux/Mac: cp .env.example .env)
npm start
```
Abre **http://localhost:3000** (el backend ya sirve el frontend).

## Configuración (backend/.env)
| Variable | Qué hace |
|---|---|
| `PORT` | Puerto del servidor |
| `API_URL` | Vacío = mismo servidor. Si el frontend está en otro sitio, pon aquí la URL del backend. **Se cambia solo aquí**, las 3 páginas la usan |
| `ADMIN_KEY` | Contraseña del acceso docente |
| `TZ_APP` | Zona horaria (hora de marcado la fija el servidor) |
| `VALIDAR_HORARIO` | `true` = marcar fuera de horario se bloquea y tras `TOLERANCIA_MIN` queda ATRASO |
| `CORS_ORIGIN`, `DB_PATH` | Orígenes permitidos y ruta de la base de datos |

Si hospedas el frontend aparte, edita `frontend/js/config.js` con la misma URL.

## Formato de los Excel
- Estudiantes: `Número de registro`, `Nombre completo`, `Correo electrónico`
- Fechas: `Fecha`, `Hora inicio`, `Hora fin` (acepta `05/10/2026`, `5/10/26`, fecha real de Excel; horas `18:00`, `18:00:00`, `6:00 PM`)
