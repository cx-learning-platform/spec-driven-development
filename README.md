# Spec Driven Development

> **🎯 Intelligent Development Workflow Enhancement with Enterprise Integration**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)

## 🚀 What Does This Extension Do?

**Spec Driven Development** is a comprehensive VS Code extension that combines intelligent development resources with enterprise-grade task management and project integration capabilities.

---

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **VS Code** (v1.74.0 or higher)
- **Git**
- **AWS CLI** 

---

### 🚀 **Development Setup**

**Vidcast:** [Setup & Usage Video](https://app.vidcast.io/share/9e062996-a2fc-424d-96de-fe637c2b49c3)


**Step 0: Connect to AWS Development Account**
```
Windows:
> .\duo-sso_windows_amd64 -duo-idp -session-duration 3600 -factor push

Mac:
> duo-sso  -session-duration 3600

Then, Select the `532054877749` account with `developer` role.
```

**Step 1: Clone and Install**
```bash
git clone <your-git-repo-link>
cd spec-driven-development
npm install
```

**Step 2: Compile the Extension**
```bash
npm run compile
```

**Step 3: Run the Extension**
```bash
npm run package

code --install-extension spec-driven-development-1.0.0.vsix 

```

---

## To uninstall the extension
```bash
code --uninstall-extension Gen-Ai-publisher.spec-driven-development
and using Command Palette (Ctrl+Shift+P) and select "Developer: Reload Window".
```

---

## 🛠️ Troubleshooting

### ❌ **AWS Connection Issues**

If AWS connection fails, check the following in order:

**1. Verify AWS CLI is installed:**
```bash
aws --version
```
If not installed, see [AWS CLI Setup](#️-aws-cli-setup-required-for-enterprise-features) above.

**2. Check AWS credentials are configured:**
```bash
aws configure list
```
Should show your credentials/profile configuration.

**3. Test AWS connection:**
```bash
aws sts get-caller-identity
```
Should return your account ID, user ARN, and user ID.

**4. If using SSO, ensure you're logged in:**
```bash
aws sso login --profile default
```
Your SSO session may have expired. Re-authenticate via browser.

**5. Verify Secrets Manager access:**
```bash
aws secretsmanager list-secrets --max-results 1
```
Should list secrets (or empty list if none exist). If error, check IAM permissions.

**6. Check your AWS profile:**
- VS Code may not detect the correct profile
- Set environment variable: `AWS_PROFILE=your-profile-name`
- Or update `~/.aws/config` to set `[default]` profile

**7. Check region configuration:**
```bash
aws configure get region
```
Ensure the region matches where your Secrets Manager secrets are stored.

---

### 🔄 **Panel & Connection Issues**

**"Connect to AWS" button shows error:**
1. Click the **"Connect to AWS"** button again in the Configurations tab
2. The connection may have timed out or failed silently
3. If error persists, check AWS credentials using steps above

**Panel not updating after configuration changes:**
1. Close the Spec Driven Development panel
2. Reopen it by clicking the status bar item or using Command Palette
3. This refreshes the panel state

**AWS connection succeeds but Salesforce fails:**
1. Verify your Salesforce credentials are stored in AWS Secrets Manager
2. Check the secret name matches the extension configuration
3. Click **"Connect to AWS"** again to re-fetch credentials
4. Review detailed error message in the panel

**Changes not reflecting in Extension Development Host:**
1. Run `npm run compile` in the main VS Code window
2. In the Extension Development Host window, press `Ctrl+R` to reload
3. Or close the Extension Development Host and press `Fn+F5` again

---

### ❓ **Other Common Issues**

| Issue | Solution |
|-------|----------|
| Extension not loading | Check VS Code version (requires 1.74.0+), restart VS Code |
| Task import conflicts | Tasks with duplicate IDs - delete existing tasks or use different IDs |
| Salesforce integration errors | Check AWS Secrets Manager permissions and secret format. Review detailed error messages in panel |
| Auto-populate not working | Ensure workspace has Git repository with remote configured. Check Output panel for Git detection logs |
| Storage limit exceeded | Salesforce error indicating data storage limits reached. Contact Salesforce admin to increase storage quota |
| Webview panel not displaying | Restart VS Code, check for extension conflicts |
| Git repository not detected | Initialize Git repo with `git init` and add remote with `git remote add origin <url>` |

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
├── .spec-driven-development/
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

---

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

---

### 🔍 **Debug Information**
1. Open VS Code Output panel (`View > Output`)
2. Select "Spec Driven Development" from dropdown
3. Check for error messages and warnings

---

## 📊 Extension Information

### 📦 **Package Details**
- **Extension ID**: `spec-driven-development`
- **Publisher**: Gen-Ai-publisher
- **Version**: 1.0.0
- **License**: MIT
- **VS Code Compatibility**: 1.74.0+

### 🔗 **Quick Links**
- **Repository**: [GitHub](https://github.com/cx-learning-platform/spec-driven-development)
- **Issues**: [Report Issues](https://github.com/cx-learning-platform/spec-driven-development/issues)
- **License**: [MIT License](LICENSE)

---

<div align="center">

**🎯 Spec Driven Development** • **Intelligent Task Management & Development Enhancement**

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-007ACC.svg)](https://code.visualstudio.com/)

**Streamline your development workflow with intelligent task management and enterprise integration.** 🚀

</div>
