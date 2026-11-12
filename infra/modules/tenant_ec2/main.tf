resource "aws_security_group" "tenant_sg" {
  name        = "sg_${var.tenant_id}"
  description = "Security Group para el tenant ${var.tenant_name}"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name   = "sg-${var.tenant_id}"
    Tenant = var.tenant_id
  }
}

resource "aws_instance" "tenant_vm" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  vpc_security_group_ids      = [aws_security_group.tenant_sg.id]
  associate_public_ip_address = true
  
  # Añadimos esta línea para que lea el script de inicio automáticamente
  user_data = file("${path.module}/user-data.sh")

  tags = {
    Name   = "vm-${var.tenant_id}"
    Tenant = var.tenant_id
  }
}