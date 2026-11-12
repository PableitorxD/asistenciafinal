output "public_ip" {
  value       = aws_instance.tenant_vm.public_ip
  description = "Dirección IP pública asignada a la instancia del tenant"
}

output "instance_id" {
  value       = aws_instance.tenant_vm.id
  description = "ID de la instancia EC2"
}