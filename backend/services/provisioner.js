const { exec } = require('child_process');
const path = require('path');

// Almacén en memoria de logs en tiempo real por cada tenant
const tenantLogs = {};

function appendTenantLog(tenantId, text) {
  if (!tenantLogs[tenantId]) tenantLogs[tenantId] = '';
  // Limpiar códigos de color ANSI de Terraform para que se lea limpio en el modal
  const cleanText = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  tenantLogs[tenantId] += cleanText;
}

function getTenantLogs(tenantId) {
  return tenantLogs[tenantId] || '⏳ Inicializando motor de infraestructura (Terraform)...\n';
}

/**
 * Función para aprovisionar infraestructura usando Terraform de forma dinámica
 * y transmitiendo los logs línea por línea en vivo.
 */
function deployTenantInfrastructure(tenantId, tenantName, plan, callback) {
  const infraDir = path.join(__dirname, '../../infra');

  tenantLogs[tenantId] = `🚀 Iniciando aprovisionamiento en AWS para: ${tenantName} (${tenantId})\n📦 Plan seleccionado: ${plan}\n------------------------------------------------------------\n`;

  const tfCommand = `terraform init -no-color -input=false && terraform workspace select -or-create ${tenantId} && terraform apply -no-color -auto-approve -var="tenant_id=${tenantId}" -var="tenant_name=${tenantName}" -var="plan=${plan}" && terraform output -no-color`;

  console.log(`Iniciando despliegue aislado (workspace: ${tenantId})...`);

  const child = exec(tfCommand, { cwd: infraDir });
  let fullStdout = '';

  // Capturar salida estándar en tiempo real
  child.stdout.on('data', (data) => {
    const str = data.toString();
    fullStdout += str;
    appendTenantLog(tenantId, str);
  });

  // Capturar advertencias o errores en tiempo real
  child.stderr.on('data', (data) => {
    appendTenantLog(tenantId, data.toString());
  });

  child.on('close', (code) => {
    if (code !== 0) {
      const err = new Error(`El proceso de Terraform finalizó con código ${code}`);
      appendTenantLog(tenantId, `\n❌ Error durante el aprovisionamiento (código ${code}).\n`);
      console.error(`Error en el aprovisionamiento de ${tenantId}:`, err.message);
      return callback(err, null);
    }

    const ipMatches = fullStdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
    const ipPublica = ipMatches && ipMatches.length ? ipMatches[ipMatches.length - 1] : 'IP pendiente';

    appendTenantLog(
      tenantId,
      `\n✅ Infraestructura creada. IP: ${ipPublica}\n⏳ Esperando que la aplicación web termine de instalarse (esto toma unos 1-2 minutos)...\n🎉 ¡Despliegue completado exitosamente!\n`
    );

    console.log(`Despliegue exitoso para ${tenantId}. IP Obtenida: ${ipPublica}`);
    callback(null, ipPublica);
  });
}

module.exports = { deployTenantInfrastructure, getTenantLogs, appendTenantLog };