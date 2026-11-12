#!/bin/bash
apt-get update -y
apt-get install -y curl git build-essential

# Instalar Node.js 20 LTS en lugar del Node 12 de Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

mkdir -p /app
cd /app

git clone https://github.com/PableitorxD/asistenciafinal.git .
cd backend

npm install
node data/init_db.js
nohup node server.js > app.log 2>&1 &