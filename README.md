# Spec Driven Development

> **🎯 Intelligent Development Workflow Enhancement with Enterprise Integration**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)

## 🚀 What Does This Extension Do?

**Spec Driven Development** is a comprehensive VS Code extension that combines intelligent development resources with enterprise-grade task management and project integration capabilities.

## 🎯 Core Features

### 📚 **Development Resources & Guidelines**
- **Intelligent Context Analysis** - Automatically detects your project's technologies and frameworks
- **Language-Specific Instructions** - Comprehensive best practices for Go, Python, Terraform, Bash, and more
- **Smart Development Prompts** - Contextual prompts for code review, estimation, security scanning, and linting
- **Workspace Guidelines** - Automatically adds development resources to your workspace

### 🏢 **Enterprise Integration**
- **AWS Integration** - Secure credential management using your AWS CLI configuration
- **Salesforce Task System** - Direct integration with Salesforce for task submission and tracking
- **JIRA Task Management** - Complete task lifecycle from creation to completion
- **Initiative & Epic Management** - Smart filtering and relationship-based dropdowns
- **Git-Based Auto-Population** - Automatically detects repository and populates Initiative/Epic fields
- **Enhanced Error Handling** - Detailed Salesforce API error messages with actionable information

### 🎯 **Task Management**
- **WIP Tasks** - Work-in-progress task tracking with edit, delete, and completion actions
- **Running Tasks** - View and monitor active tasks with real-time updates
- **Done Tasks** - Completed task management with restore functionality
- **TaskMaster Import** - Import tasks from JSON files with duplicate detection
- **Task Search & Filtering** - Find tasks by ID, name, or description across all categories
- **Pagination Support** - Navigate through large task lists with configurable page sizes
- **Real-Time Status Updates** - Live task counts and status synchronization

---

## ⚙️ Configuration & Setup

### 🎯 **Quick Start** (No Configuration Required)
1. Install the extension from VS Code Marketplace
2. Click the "Spec Driven Development" status bar item to open the panel
3. Use "Import from TaskMaster" to start managing tasks immediately
4. Access development resources via context menu commands

### 🏢 **Enterprise Integration Setup** (Optional)

#### **VS Code Settings**
```json
{
  "specDrivenDevelopment.awsProfile": "",
  "specDrivenDevelopment.awsRegion": "",
  "specDrivenDevelopment.salesforceSecretName": "salesforce"
}
```

#### **AWS Prerequisites**
1. **AWS CLI configured**: `aws configure`
2. **IAM permissions for Secrets Manager**:
   ```json
   {
     "Effect": "Allow",
     "Action": ["secretsmanager:GetSecretValue", "secretsmanager:ListSecrets"],
     "Resource": "*"
   }
   ```

#### **Salesforce Credentials in AWS Secrets Manager**
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
│   │   ├── vibe-workflow.md
│   │   ├── vs-copilot-how-to-instructions.md
│   │   ├── vs-copilot-how-to-mcp-server.md
│   │   └── vs-copilot-how-to-prompts.md
│   └── .vscode/               # ⚙️ VS Code Workspace Settings
│       └── mcp.json           # MCP server configurations
└── your-existing-code/        # Your project files remain unchanged
```

**Note**: The extension adds resources to your workspace but never modifies your existing code files.

---

## 🎯 Quick Start Guide

### 1. **Install the Extension**
Install from the VS Code Marketplace or use the Command Palette (`Ctrl+Shift+P` → "Extensions: Install Extensions")

### 2. **Access the Panel**
- Click the "Spec Driven Development" status bar item, or
- Use Command Palette: "Spec Driven Development: Open Panel"

### 3. **Task Management** (Core Feature)
- **My Task List Tab**: View and manage tasks across three categories:
  - **WIP Tickets**: Work-in-progress tasks with Edit, Delete, Done actions
  - **Tickets List**: All Tickets with View option
  - **Done Tickets**: Completed tasks with View options
- **Import Tasks**: Use "Import from TaskMaster" to load tasks from JSON files
- **Search & Filter**: Find tasks by ID, name, or description across all categories
- **Pagination**: Navigate large task lists with Previous/Next controls

### 4. **Enterprise Features** (Optional Setup)
- **Configurations Tab**: Ensure AWS CLI is configured with Secrets Manager access
- **Salesforce Integration**: Store Salesforce credentials in AWS Secrets Manager
- **Connect**: Use the Configurations tab to establish connections
- **Auto-Population**: Click "Auto-Populate from Git" to automatically detect and populate Initiative/Epic fields based on your workspace repository

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
| **Open Panel** | Access the main management interface with task management |
| **Connect to AWS** | Establish AWS Secrets Manager connection |
| **Submit Feature** | Submit features to Salesforce with JIRA integration |
| **Auto-Populate from Git** | Automatically detect repository and populate Initiative/Epic fields |
| **Import from TaskMaster** | Import tasks from JSON files with duplicate detection |
| **Task Actions** | Edit, Delete, Complete (Done), View, and Restore tasks |
| **Search Tasks** | Find tasks across WIP, Running, and Done categories |
| **Paginate Tasks** | Navigate through large task lists with Previous/Next controls |

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
- **Salesforce API Integration** - Direct REST API connectivity with dynamic field discovery and enhanced error reporting
- **Git Service Integration** - Automatic repository detection from VS Code Git extension
- **Smart Auto-Population** - Chain Git → Application → Initiative → Epic for intelligent form filling
- **JIRA Task Management** - Update tasks with effort estimation and status tracking
- **Feature Workflow** - Complete feature lifecycle from submission to tracking
- **Enhanced Error Messages** - Detailed Salesforce error codes with actionable information (e.g., STORAGE_LIMIT_EXCEEDED)

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

### 🔧 **Task Management Workflow**
```text
1. Import tasks: Use "Import from TaskMaster" with JSON file
2. Work with WIP tasks: Edit details, estimate hours, track progress
3. Complete tasks: Click "Done" to move from WIP to Done status
4. Monitor progress: Use search to find specific tasks across categories
5. Navigate pages: Use Previous/Next buttons for large task lists
6. Restore if needed: Move completed tasks back to active status
7. Enterprise sync: Tasks integrate with Salesforce and JIRA systems
```

### 🎯 **Git-Based Auto-Population Workflow**
```text
1. Open workspace with a Git repository
2. Navigate to "Manage Features" tab
3. Click "Auto-Populate from Git" button
4. Extension automatically:
   - Detects repository name from Git remote URL
   - Queries Salesforce for matching Application
   - Loads related Initiatives from the Application
   - Filters Epics based on Initiative's Jira Team
   - Pre-populates Initiative and Epic dropdowns
5. Select from pre-filtered options or manually choose
6. Complete remaining form fields and submit
```

### **📁 TaskMaster JSON Format**
```json
[
  {
    "id": 1,
    "title": "Implement User Authentication",
    "description": "Add secure login functionality",
    "status": "",
    "priority": "Major-P3",
    "type": "story",
    "workType": "RTB",
    "estimation": "16",
    "acceptanceCriteria": "Users can securely log in and out"
  }
]
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

## 🎯 Extension Interface

The extension provides a three-tab interface:

### 📋 **Configurations Tab**
- **AWS Connection Status** - Real-time connection monitoring with visual indicators
- **Secret Validation** - Automatic Salesforce credential verification
- **Connection Management** - Connect, refresh, and troubleshoot AWS integration
- **Error Details** - Enhanced error messages showing specific Salesforce API error codes and descriptions

### 🎯 **Manage Features Tab**
- **Feature Creation** - Submit new features to Salesforce with comprehensive field validation
- **Git-Based Auto-Population** - Automatically detect repository and populate Initiative/Epic fields
- **TaskMaster Import** - Import tasks from JSON files with duplicate detection
- **Initiative & Epic Management** - Smart filtering with relationship-based dropdowns
- **Sprint Details** - Dynamically loaded sprint options with recommended selections
- **Validation & Feedback** - Real-time form validation with detailed error messages
- **Duplicate Detection** - Prevents duplicate TaskMaster submissions

### 📊 **My Task List Tab**
- **Task Categories**:
  - **WIP Tickets** - Active work with Edit, Delete, Done actions and full field editing
  - **Tickets List** - Running tasks with View capability showing all task details
  - **Done Tickets** - Completed tasks with View and Restore options
- **Advanced Search** - Find tasks by ticket ID, name, or description across all fields
- **Pagination Controls** - Navigate through large task lists with Previous/Next buttons
- **Configurable Page Size** - Adjust number of tasks displayed per page (default: 20)
- **Real-time Updates** - Live task status, count updates, and synchronization
- **Task Actions**:
  - **Edit**: Modify all task fields including description, hours, dates, and criteria
  - **Delete**: Remove tasks with confirmation (WIP tasks only)
  - **Done**: Mark tasks complete and move to Done category
  - **View**: Display full task details in modal
  - **Restore**: Move completed tasks back to WIP status
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
- **`src/services/awsService.ts`** - AWS Secrets Manager integration with secure credential handling
- **`src/services/jiraService.ts`** - Salesforce/JIRA ticket management and authentication
- **`src/services/feedbackService.ts`** - Salesforce API integration with auto-population logic
- **`src/services/taskService.ts`** - Complete task lifecycle management (WIP, Running, Done)
- **`src/services/gitService.ts`** - Git repository detection using VS Code Git extension API
- **`src/services/estimationParser.ts`** - Intelligent effort estimation parsing
- **`src/services/notificationManager.ts`** - Consolidated notification system with progress indicators
- **`src/services/taskMasterService.ts`** - TaskMaster JSON import with duplicate detection

### 🎨 **User Interface**
- **`src/ui/webviewPanel.ts`** - Main extension panel and UI
- **`src/ui/instructionsProvider.ts`** - Instructions tree view provider
- **`src/ui/promptsProvider.ts`** - Prompts tree view provider
- **`media/`** - HTML, CSS, and JavaScript for webview interface

---

## 🛠️ Troubleshooting

### ❓ **Common Issues**

| Issue | Solution |
|-------|----------|
| Extension not loading | Check VS Code version (requires 1.74.0+), restart VS Code |
| AWS authentication failed | Verify `aws configure` and test with `aws sts get-caller-identity` |
| Task import conflicts | Tasks with duplicate IDs - delete existing tasks or use different IDs |
| Salesforce integration errors | Check AWS Secrets Manager permissions and secret format. Review detailed error messages in panel |
| Auto-populate not working | Ensure workspace has Git repository with remote configured. Check Output panel for Git detection logs |
| Storage limit exceeded | Salesforce error indicating data storage limits reached. Contact Salesforce admin to increase storage quota |
| Webview panel not displaying | Restart VS Code, check for extension conflicts |
| Git repository not detected | Initialize Git repo with `git init` and add remote with `git remote add origin <url>` |

### 🔍 **Debug Information**
1. Open VS Code Output panel (`View > Output`)
2. Select "Spec Driven Development" from dropdown
3. Check for error messages and warnings

## Pre Requisites:
```
Node >= v23.10.0
npm  >= 10.9.2
```

```bash
# Clone and setup
git clone git@github.com:cx-learning-platform/spec-driven-development.git
cd spec-driven-development
npm install
npm run compile
# Press F5 in VS Code to launch test instance
```

---

## 📊 Extension Information

### 📦 **Package Details**
- **Extension ID**: `spec-driven-development`
- **Publisher**: Gen-Ai-publisher
- **Version**: 1.0.0
- **License**: MIT
- **VS Code Compatibility**: 1.74.0+

### ✨ **Key Features**
- ✅ **Task Management System** - Complete WIP to Done workflow with pagination
- ✅ **Git-Based Auto-Population** - Automatic repository detection and form filling
- ✅ **TaskMaster JSON Import** - Import tasks with duplicate detection
- ✅ **Advanced Search & Filter** - Find tasks across all categories with real-time results
- ✅ **AWS Secrets Manager Integration** - Enterprise credential management
- ✅ **Salesforce API Integration** - Direct task and feature management with enhanced error reporting
- ✅ **GitService Integration** - Repository detection via VS Code Git extension
- ✅ **NotificationManager** - Consolidated progress and status notifications
- ✅ **Development Resources** - Language-specific best practices
- ✅ **Multi-Platform Support** - Windows, macOS, and Linux compatible

### 🔗 **Quick Links**
- **Repository**: [GitHub](https://github.com/Relanto-LKM-POC/spec-driven-development)
- **Issues**: [Report Issues](https://github.com/Relanto-LKM-POC/spec-driven-development/issues)
- **License**: [MIT License](LICENSE)

---

<div align="center">

**🎯 Spec Driven Development** • **Intelligent Task Management & Development Enhancement**

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)

**Streamline your development workflow with intelligent task management and enterprise integration.** 🚀

</div>