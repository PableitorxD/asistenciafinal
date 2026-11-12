variable "tenant_id" {
  description = "Identificador único del tenant (ej: san-marcos)"
  type        = string
}

variable "tenant_name" {
  description = "Nombre de la institución"
  type        = string
}

variable "instance_type" {
  description = "Tipo de instancia según el plan (ej: t2.micro para Básico, t2.small para Estándar)"
  type        = string
  default     = "t2.micro"
}

variable "ami_id" {
  description = "AMI de Ubuntu o Amazon Linux"
  type        = string
  default     = "ami-0c7217cdde317cfec" # Cambiar por el AMI ID de tu región (ej. us-east-1)
}