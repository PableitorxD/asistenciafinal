// Genera automáticamente el slug/identificador único del tenant en base al nombre
function generarSlug() {
  const nombre = document.getElementById('nombre').value;
  const slug = nombre
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quita acentos
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  document.getElementById('id').value = slug;
}

// Cambia visualmente la selección del plan
function seleccionarPlan(planId, elemento) {
  document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected'));
  elemento.classList.add('selected');
  document.getElementById('plan').value = planId;
}

// Envío del formulario al Backend
document.getElementById('form-crear-tenant').addEventListener('submit', async (e) => {
  e.preventDefault();

  const msgDiv = document.getElementById('msg');
  const btnSubmit = document.getElementById('btn-desplegar');

  const tenantData = {
    id: document.getElementById('id').value,
    nombre: document.getElementById('nombre').value,
    correo_admin: document.getElementById('correo_admin').value,
    plan: document.getElementById('plan').value,
    motor_infra: document.getElementById('motor_infra').value
  };

  // Obtener token de admin si tu app usa autenticación (ej: del localStorage)
  const token = localStorage.getItem('adminToken') || '';

  msgDiv.style.color = '#2563eb';
  msgDiv.innerText = 'Enviando solicitud e iniciando Terraform en AWS... Por favor espera.';
  btnSubmit.disabled = true;

  try {
    const response = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Eliminamos 'x-admin-token': token temporalmente para evitar el 401
      },
      body: JSON.stringify(tenantData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al solicitar la creación del tenant');
    }

    msgDiv.style.color = '#16a34a';
    msgDiv.innerText = `¡Éxito! ${result.mensaje}. (ID: ${result.tenant_id})`;
  } catch (err) {
    msgDiv.style.color = '#dc2626';
    msgDiv.innerText = `Error: ${err.message}`;
  } finally {
    btnSubmit.disabled = false;
  }
});