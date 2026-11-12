provider "aws" {
  region = "us-east-1" # Cambia a tu región de AWS preferida
}

variable "tenant_id" {
  type    = string
  default = "demo-tenant"
}

variable "tenant_name" {
  type    = string
  default = "Institucion Demo"
}

variable "plan" {
  type    = string
  default = "basico"
}

# Asignar tipo de instancia según el plan solicitado
locals {
  instance_type = var.plan == "avanzado" ? "t2.medium" : (var.plan == "estandar" ? "t2.small" : "t2.micro")
}

# Llamado al módulo reutilizable
module "tenant_infrastructure" {
  source        = "./modules/tenant_ec2"
  tenant_id     = var.tenant_id
  tenant_name   = var.tenant_name
  instance_type = local.instance_type
}

output "tenant_public_ip" {
  value       = module.tenant_infrastructure.public_ip
  description = "IP pública de la instancia desplegada para el tenant"
}