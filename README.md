# Spec Driven Development

> **🎯 Intelligent Development Workflow Enhancement with Enterprise Integration**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)

## 🚀 What Does This Extension Do?

**Spec Driven Development** is a comprehensive VS Code extension that combines intelligent development resources with enterprise-grade Feature and project management capabilities.

## 🎯 Core Features

The extension provides three main capabilities:

### 📚 **Development Resources & Guidelines**
- **Intelligent Context Analysis** - Automatically detects your project's technologies and frameworks
- **Language-Specific Instructions** - Comprehensive best practices for Go, Python, Terraform, Bash, and more
- **Smart Development Prompts** - Contextual prompts for code review, estimation, security scanning, and linting
- **Workspace Guidelines** - Automatically adds development resources to your workspace

### � **Enterprise Integration**
- **AWS Integration** - Secure credential management using your AWS CLI configuration
- **Salesforce Feature System** - Direct integration with Salesforce for feature submission
- **JIRA Task Management** - Update and track JIRA tasks with effort estimation
- **Initiative & Epic Management** - Smart filtering and relationship-based dropdowns

### 🎯 **Project Management**
- **Feature History Tracking** - Complete audit trail of submitted feature
- **Real-time Status Monitoring** - Live connection status for AWS and Salesforce
- **Enhanced Error Reporting** - Detailed Salesforce API error messages with specific error codes for faster troubleshooting
- **Enterprise-grade Logging** - Comprehensive error reporting and diagnostics

---

## 🎯 Quick Start Guide

### 1. **Install the Extension**
Install from the VS Code Marketplace or use the Command Palette (`Ctrl+Shift+P` → "Extensions: Install Extensions")

### 2. **Development Resources** (Works Immediately)
- Right-click any folder → "Add Workspace Guidelines"
- Use "Analyze Code & Apply Instructions" command
- Access comprehensive language-specific best practices

### 3. **Access the Panel**
- Click the "Spec Driven Development" status bar item, or
- Use Command Palette: "Spec Driven Development: Open Panel"

### 4. **Enterprise Features** (Optional Setup)
- **Configurations Tab**: Ensure AWS CLI is configured with Secrets Manager access
- **Salesforce Integration**: Store Salesforce credentials in AWS Secrets Manager
- **Connect**: Use the Configurations tab to establish connections

---

## 📚 Available Commands & Features

### 🎯 **Development Commands**
| Command | Shortcut | Description |
|---------|----------|-------------|
| **Analyze Code & Apply Instructions** | `Ctrl+Shift+V A` | Apply contextual coding instructions to current file |
| **Apply Contextual Prompts** | `Ctrl+Shift+V P` | Get smart prompts for your current context |
| **Add Workspace Guidelines** | Right-click menu | Add development resources to workspace |
| **Analyze Folder & Apply Instructions** | Right-click menu | Apply instructions at folder level |
| **Apply Folder Prompts** | Right-click menu | Get contextual prompts for folder |

### 🏢 **Enterprise Commands**
| Command | Description |
|---------|-------------|
| **Open Panel** | Access the main management interface |
| **Connect to AWS** | Establish AWS Secrets Manager connection |
| **Submit Feature** | Submit Feature to Salesforce with JIRA integration |
| **Update JIRA Issue** | Update JIRA tasks with effort estimation |
| **Parse Copilot Estimation** | Extract effort estimates from GitHub Copilot Chat |

### 📚 **Development Resources Created**

When you use "Add Workspace Guidelines", the extension creates:

#### **Language-Specific Instructions** (`resources/instructions/`)
- **Go** (5 comprehensive guides):
  - `go.best-practices.instructions.md` - Coding standards and style guidelines
  - `go.development.instructions.md` - Development workflows and patterns  
  - `go.design-architecture.instructions.md` - Architectural patterns and system design
  - `go.otel-observability-logging-metrics.instructions.md` - OpenTelemetry and observability
  - `go.power-user-guide.instructions.md` - Advanced optimization techniques
- **Python** - `python.instructions.md` - PEP compliance, Django/Flask/FastAPI best practices
- **Terraform** - `terraform.instructions.md` - Infrastructure as Code for AWS, Azure, GCP
- **Bash** - `bash.instructions.md` - Secure shell scripting practices
- **Requirements** - `software.requirements.instructions.md` - Project planning standards

#### **Smart Development Prompts** (`resources/prompts/`)
- `go.review.prompt.md` - Automated Go code analysis and review
- `secrets-detection.prompt.md` - Security analysis and credential scanning
- `software.effort.estimation.prompt.md` - Comprehensive project estimation
- `linting.prompt.md` - Code formatting and quality standards
- `jenkins.estimation.prompt.md` - CI/CD pipeline optimization

#### **How-to Guides** (`resources/how-to-guides/`)
- Complete development workflow documentation
- GitHub Copilot integration guides
- MCP server setup instructions
- Prompt system usage guides

---

## 🎯 Extension Architecture & Capabilities

### 🧠 **Intelligent Context Analysis**
- **Automatic Language Detection** - Recognizes Go, Python, Terraform, JavaScript, TypeScript, and Bash
- **Framework Recognition** - Detects Django, Flask, FastAPI, OpenTelemetry, AWS services, and more
- **Smart Pattern Analysis** - Identifies coding patterns and architectural decisions
- **Project Structure Analysis** - Understands your project layout and dependencies

### 🛠️ **Development Tools**
- **Resource Management** - Automated creation and management of development resources
- **Contextual Instructions** - Dynamic application of best practices based on your code
- **Smart Prompts** - Context-aware development prompts and suggestions

### 🏢 **Enterprise Integration**
- **AWS Secrets Manager** - Secure credential management using your AWS CLI configuration
- **Salesforce API Integration** - Direct REST API connectivity with dynamic field discovery
- **JIRA Task Management** - Update tasks with effort estimation and status tracking
- **Feature Workflow** - Complete feature lifecycle from submission to tracking

---

## ⚙️ Configuration & Setup

### 🎯 **Basic Usage** (No Configuration Required)
The extension works immediately for development features:
- Language-specific instructions
- Smart prompts and code analysis
- Workspace resource management
- Contextual development guidance

### 🏢 **Enterprise Integration Setup** (Optional)

For AWS and Salesforce features, configure the following:

#### **VS Code Settings**
```json
{
  "specDrivenDevelopment.awsProfile": "",        // AWS CLI profile (empty = default)
  "specDrivenDevelopment.awsRegion": "",         // AWS region (empty = auto-detect)
  "specDrivenDevelopment.salesforceSecretName": "salesforce",
  "specDrivenDevelopment.salesforceSecretKeywords": ["salesforce", "sf", "crm"]
}
```

#### **AWS Prerequisites**
1. **AWS CLI installed and configured**
   ```bash
   aws configure
   # or use: aws configure --profile your-profile-name
   ```

2. **IAM permissions for Secrets Manager**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue",
           "secretsmanager:ListSecrets"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

#### **Salesforce Credentials in AWS Secrets Manager**
Store your Salesforce credentials as a JSON secret:
```json
{
  "username": "your-salesforce-username",
  "password": "your-salesforce-password",
  "client_id": "your-connected-app-client-id",
  "client_secret": "your-connected-app-client-secret"
}
```

### 📁 **Generated Project Structure**

When you use "Add Workspace Guidelines", the extension creates:
```
your-project/
├── .spec-driven-files/
│   ├── instructions/          # 📚 Contextual Coding Instructions
│   │   ├── go.best-practices.instructions.md
│   │   ├── go.development.instructions.md
│   │   ├── go.design-architecture.instructions.md
│   │   ├── go.otel-observability-logging-metrics.instructions.md
│   │   ├── go.power-user-guide.instructions.md
│   │   ├── python.instructions.md
│   │   ├── terraform.instructions.md
│   │   ├── bash.instructions.md
│   │   └── software.requirements.instructions.md
│   ├── prompts/               # 🎯 Smart Development Prompts
│   │   ├── go.review.prompt.md
│   │   ├── software.effort.estimation.prompt.md
│   │   ├── secrets-detection.prompt.md
│   │   ├── linting.prompt.md
│   │   └── jenkins.estimation.prompt.md
│   ├── how-to-guides/         # 📖 Development Workflow Guides
│   │   └── vibe-workflow.md
│   │   └── vs-copilot-how-to-instructions.md
│   │   └── vs-copilot-how-to-mcp-server.md
│   │   └── vs-copilot-how-to-prompts.md
│   └── .vscode/                   # ⚙️ VS Code Workspace Settings
│       └──  mcp.json              # MCP server configurations
└── your-existing-code/        # Your project files remain unchanged
```

**Note**: The extension adds resources to your workspace but never modifies your existing code files.

---

## 🌟 Real-World Examples

### **📊 Effort Estimation Parsing**
The extension intelligently parses time estimates from various formats:
```text
Input formats supported:
• "Backend API development will take 3-5 days, frontend integration 2 days"
• "Total Estimated Effort: 28-45 person-days"
• "Final Estimate: 40 hours (5 days)"
• "Development will take approximately 2-3 weeks"

↓ Extension processes with EstimationParser ↓

Output: Structured time estimates with configurable work hours
- Backend: 24-40 hours (HOURS_PER_DAY=8)
- Frontend: 16 hours
- Total: 40-56 hours
```

### **🔧 Enterprise Workflow**
```text
1. Developer gets task: "EPIC-DEVSECOPS-123: Implement user authentication"
2. Use "Add Workspace Guidelines" → Gets Go best practices, security guidelines
3. Code with enhanced context and instructions
4. Use "Edit" button in WIP Tickets sub-panel → Automatically update Salesforce data
5. Click "Done" → Complete feature loop with initiative/epic tracking
```

### **🔍 Smart Context Detection**
```go
package main

import (
    "github.com/gin-gonic/gin"        // ← Detects: Go + Gin framework
    "go.opentelemetry.io/otel"        // ← Detects: OpenTelemetry + observability
)

// Extension automatically provides:
// - go.best-practices.instructions.md
// - go.otel-observability-logging-metrics.instructions.md  
// - Contextual prompts for API development and monitoring
```

### **📚 Language-Specific Resources**
When working with different technologies, the extension provides targeted guidance:
- **Python projects** → Django/Flask best practices, PEP compliance
- **Terraform files** → Infrastructure as Code standards for AWS/Azure/GCP
- **Bash scripts** → Security practices, error handling, portability
- **Mixed projects** → Relevant instructions for all detected languages

## 🧠 Smart Detection & Intelligence

### 🔍 **Automatic Technology Detection**

| Category | Technologies Detected | Resources Provided |
|----------|----------------------|-------------------|
| **Languages** | Go, Python, JavaScript, TypeScript, Bash, Terraform | Language-specific instruction files and best practices |
| **Go Frameworks** | Gin, Echo, Fiber, gRPC, OTEL | Web framework patterns and observability guidelines |
| **Python Frameworks** | Django, Flask, FastAPI, pytest | Framework-specific development patterns |
| **Infrastructure** | AWS, Azure, GCP, Docker, Kubernetes | Cloud-specific Terraform practices and container guidelines |
| **Databases** | PostgreSQL, MongoDB, Redis | Database integration and query optimization patterns |
| **CI/CD** | Jenkins, GitHub Actions, GitLab CI | Pipeline optimization and estimation guides |
---

## 🏗️ Extension Architecture

Built with TypeScript and VS Code Extension API:

### 📁 **Core Components**
- **`src/extension.ts`** - Main extension entry point and command registration
- **`src/contextAnalyzer.ts`** - Intelligent project analysis and technology detection
- **`src/instructionManager.ts`** - Dynamic resource creation and management
- **`src/promptManager.ts`** - Smart prompt suggestions and contextual guidance
- **`src/resourceManager.ts`** - File system operations and resource management
- **`src/copilotIntegration.ts`** - GitHub Copilot enhancement integration

### 🔧 **Service Layer**
- **`src/services/awsService.ts`** - AWS Secrets Manager integration
- **`src/services/jiraService.ts`** - Salesforce/JIRA ticket management  
- **`src/services/FeatureService.ts`** - Salesforce/JIRA Feature system
- **`src/services/estimationParser.ts`** - Intelligent effort estimation parsing

### 🎨 **User Interface**
- **`src/ui/webviewPanel.ts`** - Main extension panel and UI
- **`src/ui/instructionsProvider.ts`** - Instructions tree view provider
- **`src/ui/promptsProvider.ts`** - Prompts tree view provider
- **`media/`** - HTML, CSS, and JavaScript for webview interface

---

##  Troubleshooting & FAQ

### ❓ **Common Issues & Solutions**

| Issue | Solution |
|-------|----------|
| Extension not loading | Check VS Code version (requires 1.74.0+), restart VS Code |
| AWS authentication failed | Verify `aws configure` is set up and test with `aws sts get-caller-identity` |
| Salesforce integration errors | Check AWS Secrets Manager permissions and secret format |
| "Add Workspace Guidelines" not working | Try right-clicking on a folder instead of a file |
| Webview panel not displaying | Restart VS Code, check for extension conflicts |

### 🔍 **Debug Information**

**Check Extension Logs:**
1. Open VS Code Output panel (`View > Output`)
2. Select "Spec Driven Development" from dropdown
3. Look for error messages and warnings

**Common Log Messages:**
- `AWS authentication failed` - Run `Configurations` to set up credentials
- `Salesforce credentials not available` - Check AWS Secrets Manager secret format
- `No active editor found` - Use context menu on folders/files instead

### 🛠️ **Manual Diagnostics**

```bash
# Test AWS CLI configuration
aws sts get-caller-identity

# List available secrets (requires permissions)
aws secretsmanager list-secrets

# Test specific secret access
aws secretsmanager get-secret-value --secret-id "salesforce"
```

### 🚀 **Development Setup** (For Contributors)

## Pre Requisites:
```
Node >= v23.10.0
npm  >= 10.9.2
```

```bash
# Clone and setup
git clone git@github.com:cx-learning-platform/spec-driven-development.git
cd spec-driven-development

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Development mode (auto-recompile)
npm run watch

# Test in Extension Development Host
# Press F5 in VS Code to launch test instance
```

---

## 🛡️ Security & Privacy

### 🔒 **Security Model**
- **Local Processing** - All code analysis and resource generation happens locally
- **Secure Credential Management** - Uses AWS Secrets Manager, no local credential storage
- **No Telemetry** - Extension doesn't collect or transmit usage data
- **Open Source** - Full transparency in all functionality

### 📊 **Data Handling**
- **Development Resources** - Created locally in your workspace
- **AWS Integration** - Credentials managed through your existing AWS CLI configuration  
- **Salesforce Integration** - Credentials retrieved from AWS Secrets Manager only
- **No External Dependencies** - Core features work without internet connectivity

### ⚠️ **Security Best Practices**
- Use minimal AWS IAM permissions for Secrets Manager access
- Regularly rotate Salesforce credentials and update secrets
- Review generated resources before committing to version control
- Use environment-specific Salesforce orgs (dev/staging/prod)

---

## 📊 Extension Information

### 📦 **Package Details**
- **Extension ID**: `spec-driven-development`
- **Publisher**: Gen-Ai-publisher
- **Version**: 1.0.1
- **License**: MIT
- **VS Code Compatibility**: 1.74.0+
- **Languages Supported**: Go, Python, Terraform, Bash, JavaScript, TypeScript

### ✨ **Feature Summary**
- ✅ **9 Language-Specific Instruction Sets** - Comprehensive best practices
- ✅ **5 Smart Development Prompts** - Context-aware development guidance
- ✅ **AWS Secrets Manager Integration** - Enterprise credential management
- ✅ **Salesforce API Integration** - Direct feature and task management
- ✅ **Intelligent Effort Estimation** - Multiple format parsing support
- ✅ **Multi-Platform Support** - Windows, macOS, and Linux compatible

---

## 📝 License & Information

### 📄 License
This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### �️ Built With
- **TypeScript** - Main development language
- **VS Code Extension API** - Core extension framework
- **Node.js** - Runtime environment
- **AWS SDK** - Cloud services integration
- **Webpack** - Bundle optimization

### � Dependencies
```json
{
  "@types/vscode": "^1.74.0",
  "node-fetch": "For HTTP requests",
  "aws-sdk": "For AWS Secrets Manager integration"
}
```

### 📋 Requirements
- **VS Code**: Version 1.74.0 or higher
- **Node.js**: For extension runtime
- **AWS CLI**: For AWS integration (optional)
- **Git**: For GitHub integration (optional)

---

<div align="center">

**🎯 Spec Driven Development** • **Intelligent Development Enhancement**

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)

**Enhance your development workflow with intelligent context analysis and comprehensive resources.** 🚀

</div>