# Terraform Style Guide & Best Practices

A comprehensive guide for writing clean, consistent, and maintainable Terraform code following HashiCorp's official recommendations and industry best practices.

**Source:** [HashiCorp Terraform Style Guide](https://developer.hashicorp.com/terraform/language/v1.14.x/style)

---

## 1. CODE FORMATTING

### Automatic Formatting
- **Always use `terraform fmt`** before committing code
- Run `terraform fmt -recursive` to format all files in subdirectories
- Configure your IDE to run `terraform fmt` on save

### Indentation & Spacing
- Use **2 spaces** for indentation (never tabs)
- Add blank lines between resource blocks for readability
- Align arguments vertically when it improves readability

```hcl
# Good
resource "aws_instance" "web" {
  ami           = "ami-0c02fb55956c7d316"
  instance_type = "t3.micro"
  
  tags = {
    Name        = "web-server"
    Environment = "production"
  }
}

# Bad
resource "aws_instance" "web" {
ami = "ami-0c02fb55956c7d316"
instance_type = "t3.micro"
tags = {
Name = "web-server"
Environment = "production"
}
}
```

---

## 2. NAMING CONVENTIONS

### Resource Names
- **Use snake_case** for resource identifiers and variable names
- **Use hyphens** for actual resource names (name attributes)
- Be descriptive and consistent across your codebase

```hcl
# Good
resource "aws_security_group" "web_server_sg" {
  name        = "web-server-security-group"
  description = "Security group for web servers"
}

variable "instance_count" {
  description = "Number of instances to create"
  type        = number
  default     = 2
}

# Bad
resource "aws_security_group" "webSG" {
  name        = "web_server_security_group"
  description = "Security group for web servers"
}
```

### File Naming
- Use descriptive names with hyphens: `web-servers.tf`, `load-balancers.tf`
- Keep related resources in the same file when logical
- Use standard file names:
  - `main.tf` - Primary resources
  - `variables.tf` - Variable definitions
  - `outputs.tf` - Output values
  - `versions.tf` - Provider and Terraform version constraints

---

## 3. VARIABLE DEFINITIONS

### Variable Structure
- Always include `description`
- Specify `type` explicitly
- Use `validation` blocks when appropriate
- Set `default` values for optional variables

```hcl
# Good
variable "instance_type" {
  description = "EC2 instance type for web servers"
  type        = string
  default     = "t3.micro"
  
  validation {
    condition = contains([
      "t3.micro", "t3.small", "t3.medium", "t3.large"
    ], var.instance_type)
    error_message = "Instance type must be a valid t3 family type."
  }
}

variable "availability_zones" {
  description = "List of availability zones to deploy resources"
  type        = list(string)
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Bad
variable "instance_type" {
  default = "t3.micro"
}
```

### Variable Organization
- Order variables logically (required first, then optional)
- Group related variables together
- Use consistent naming patterns

---

## 4. RESOURCE CONFIGURATION

### Resource Structure
- Place required arguments first
- Group related arguments together
- Use lifecycle blocks when appropriate
- Always include meaningful tags

```hcl
resource "aws_instance" "web" {
  # Required arguments first
  ami           = var.ami_id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.private[0].id
  
  # Security and networking
  vpc_security_group_ids = [aws_security_group.web.id]
  key_name              = var.key_pair_name
  
  # Optional configuration
  user_data = file("${path.module}/scripts/user_data.sh")
  
  # Lifecycle management
  lifecycle {
    create_before_destroy = true
    ignore_changes       = [ami]
  }
  
  # Tags (always last)
  tags = merge(
    var.common_tags,
    {
      Name = "web-server-${count.index + 1}"
      Type = "web-server"
    }
  )
}
```

### Dependencies
- Use implicit dependencies when possible (resource references)
- Use `depends_on` only when implicit dependencies aren't sufficient
- Document complex dependencies with comments

---

## 5. OUTPUTS

### Output Structure
- Include meaningful descriptions
- Use consistent naming
- Export values that other modules/configurations might need

```hcl
output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "web_server_urls" {
  description = "URLs of web servers"
  value = [
    for instance in aws_instance.web : 
    "http://${instance.public_ip}"
  ]
}
```

---

## 6. MODULES

### Module Structure
- Create focused, single-purpose modules
- Use semantic versioning for module releases
- Include comprehensive documentation

```hcl
# modules/vpc/main.tf
resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support
  
  tags = merge(
    var.tags,
    {
      Name = var.name
    }
  )
}

# Root module usage
module "vpc" {
  source = "./modules/vpc"
  
  name       = "production-vpc"
  cidr_block = "10.0.0.0/16"
  
  tags = var.common_tags
}
```

### Module Best Practices
- Pin module versions in production
- Use relative paths for local modules
- Document module inputs and outputs
- Test modules independently

---

## 7. STATE MANAGEMENT

### Remote State
- Always use remote state for team environments
- Use appropriate backend for your infrastructure

```hcl
# versions.tf
terraform {
  required_version = ">= 1.0"
  
  backend "s3" {
    bucket  = "my-terraform-state-bucket"
    key     = "production/terraform.tfstate"
    region  = "us-west-2"
    encrypt = true
  }
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

---

## 8. SECURITY BEST PRACTICES

### Sensitive Data
- Never hardcode secrets in Terraform files
- Use variables for sensitive values
- Mark sensitive variables appropriately

```hcl
variable "database_password" {
  description = "Password for database"
  type        = string
  sensitive   = true
}

resource "aws_db_instance" "main" {
  password = var.database_password
  # Other configuration...
}
```

### Resource Security
- Follow principle of least privilege
- Use specific resource references instead of wildcards
- Enable encryption where available

---

## 9. VALIDATION & TESTING

### Pre-commit Checklist
- [ ] Run `terraform fmt -recursive`
- [ ] Run `terraform validate`
- [ ] Run `terraform plan` and review changes
- [ ] Check for security issues with tools like `tfsec`
- [ ] Verify no secrets are hardcoded

### Code Quality
```bash
# Format code
terraform fmt -recursive

# Validate configuration
terraform validate

# Plan changes
terraform plan -var-file="terraform.tfvars"

# Security scanning
tfsec .

# Documentation generation
terraform-docs markdown table --output-file README.md .
```

---

## 10. DOCUMENTATION

### Inline Documentation
- Use comments for complex logic
- Document non-obvious decisions
- Include examples for complex expressions

```hcl
# Create subnets across multiple AZs for high availability
# Each subnet gets a /24 CIDR block from the VPC CIDR
resource "aws_subnet" "private" {
  count = length(var.availability_zones)
  
  vpc_id            = aws_vpc.main.id
  availability_zone = var.availability_zones[count.index]
  
  # Calculate subnet CIDR: 10.0.1.0/24, 10.0.2.0/24, etc.
  cidr_block = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 1)
  
  tags = merge(
    var.common_tags,
    {
      Name = "private-subnet-${count.index + 1}"
      Type = "private"
    }
  )
}
```

### README Template
Include in each Terraform project:
- Purpose and scope
- Prerequisites
- Usage examples
- Input variables
- Outputs
- Dependencies

---

## 11. COMMON PATTERNS

### Conditional Resources
```hcl
resource "aws_instance" "optional" {
  count = var.create_instance ? 1 : 0
  
  ami           = var.ami_id
  instance_type = var.instance_type
  
  tags = var.common_tags
}
```

### Dynamic Blocks
```hcl
resource "aws_security_group" "web" {
  name = "web-security-group"
  
  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }
}
```

### For Expressions
```hcl
locals {
  instance_ips = {
    for instance in aws_instance.web :
    instance.tags["Name"] => instance.private_ip
  }
}
```

This style guide should be regularly updated as HashiCorp releases new versions and the Terraform ecosystem evolves.