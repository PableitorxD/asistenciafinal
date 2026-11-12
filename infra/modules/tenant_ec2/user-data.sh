#!/bin/bash
# Actualizar sistema e instalar Node.js y Git
apt-get update -y
apt-get install -y nodejs npm git

# Crear directorio para la aplicación
mkdir -p /app
cd /app

# Clonar o descargar tu repositorio/código de asistencia
# (Puedes reemplazar esta URL por la de tu repositorio de GitHub público del proyecto)
git clone https://github.com/tu-usuario/tu-repo-asistencia.git .

# Instalar dependencias de Node.js
npm install

# Iniciar la aplicación en segundo plano usando nohup para que quede corriendo en el puerto 3000
nohup node server.js > app.log 2>&1 &