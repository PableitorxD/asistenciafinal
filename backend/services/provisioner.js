const { exec } = require('child_process');
const path = require('path');

/**
 * Función para aprovisionar infraestructura usando Terraform de forma dinámica
 */
function deployTenantInfrastructure(tenantId, tenantName, plan, callback) {
  const infraDir = path.join(__dirname, '../../infra');

  // Ejecuta init, selecciona/crea el workspace del tenant, aplica cambios e imprime todos los outputs
  const tfCommand = `terraform init -input=false && terraform workspace select -or-create ${tenantId} && terraform apply -auto-approve -var="tenant_id=${tenantId}" -var="tenant_name=${tenantName}" -var="plan=${plan}" && terraform output`;

  console.log(`Iniciando despliegue aislado (workspace: ${tenantId})...`);

  exec(tfCommand, { cwd: infraDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error en el aprovisionamiento de ${tenantId}:`, error.message);
      if (stderr) console.error(stderr);
      return callback(error, null);
    }

    // Buscar cualquier dirección IPv4 válida en la salida final de Terraform
    const ipMatches = stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
    const ipPublica = ipMatches && ipMatches.length ? ipMatches[ipMatches.length - 1] : 'IP pendiente';

    console.log(`Despliegue exitoso para ${tenantId}. IP Obtenida: ${ipPublica}`);
    callback(null, ipPublica);
  });
}

module.exports = { deployTenantInfrastructure };