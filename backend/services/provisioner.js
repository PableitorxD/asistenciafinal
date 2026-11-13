const { exec } = require('child_process');
const path = require('path');

/**
 * Función para aprovisionar infraestructura usando Terraform de forma dinámica
 * Usa Workspaces por tenantId para que múltiples tenants coexistan sin pisarse
 */
function deployTenantInfrastructure(tenantId, tenantName, plan, callback) {
  // Ruta donde se encuentra la infraestructura principal
  const infraDir = path.join(__dirname, '../../infra');

  // Selecciona o crea un workspace aislado para este tenant, aplica y obtiene la IP pública
  const tfCommand = `terraform init -input=false && terraform workspace select -or-create ${tenantId} && terraform apply -auto-approve -var="tenant_id=${tenantId}" -var="tenant_name=${tenantName}" -var="plan=${plan}" && terraform output -raw public_ip`;

  console.log(`Iniciando despliegue aislado (workspace: ${tenantId})...`);

  exec(tfCommand, { cwd: infraDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error en el aprovisionamiento de ${tenantId}: ${error.message}`);
      if (stderr) console.error(stderr);
      return callback(error, null);
    }

    // Extraemos la última línea no vacía (la IP pública limpia)
    const lineas = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const ipPublica = lineas.pop();

    console.log(`Despliegue exitoso para ${tenantId}. IP Obtenida: ${ipPublica}`);
    callback(null, ipPublica);
  });
}

module.exports = { deployTenantInfrastructure };