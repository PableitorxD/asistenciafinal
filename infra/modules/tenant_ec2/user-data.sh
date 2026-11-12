#!/bin/bash
# Actualizar sistema e instalar Node.js, npm y Git
apt-get update -y
apt-get install -y nodejs npm git

# Crear directorio de trabajo en la máquina virtual
mkdir -p /app
cd /app

# Clonar repositorio desde GitHub
git clone https://github.com/PableitorxD/asistenciafinal.git .

# Entrar a la carpeta 'backend' donde están el package.json y el server.js
cd backend

# Instalar dependencias de Node.js
npm install

# Iniciar la aplicación en segundo plano usando nohup para que quede corriendo en el puerto 3000
nohup node server.js > app.log 2>&1 &