const { exec } = require('child_process');
const path = require('path');

/**
 * Función para aprovisionar infraestructura usando Terraform de forma dinámica
 */
function deployTenantInfrastructure(tenantId, tenantName, plan, callback) {
  // Ruta donde se encuentra la infraestructura principal
  const infraDir = path.join(__dirname, '../../infra');

  // Comando de Terraform: ejecuta el apply y luego extrae directamente la IP pública declarada en los outputs
  const tfCommand = `terraform init && terraform apply -auto-approve -var="tenant_id=${tenantId}" -var="tenant_name=${tenantName}" -var="plan=${plan}" && terraform output -raw tenant_public_ip`;

  console.log(`Iniciando despliegue para el tenant: ${tenantId}...`);

  exec(tfCommand, { cwd: infraDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error en el aprovisionamiento: ${error.message}`);
      return callback(error, null);
    }
    
    // El último comando (terraform output -raw) imprime únicamente la dirección IP limpia en el stdout
    const ipPublica = stdout.trim().split('\n').pop(); // Limpiamos cualquier salto de línea sobrante
    
    console.log(`Despliegue exitoso para ${tenantId}. IP Obtenida: ${ipPublica}`);
    
    callback(null, ipPublica);
  });
}

module.exports = { deployTenantInfrastructure };