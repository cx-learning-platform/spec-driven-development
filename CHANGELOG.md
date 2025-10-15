# Changelog

All notable changes to the "Spec Driven Development" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2025-10-15

### UI/UX Improvements
- **Renamed "AWS Setup" to "Configurations"** - More descriptive tab name reflecting broader configuration options
- **Updated "Help & Support" to "Create Feature"** - Clearer indication of the tab's purpose for feature submission

### Enhanced Error Handling
- **Improved Salesforce API Error Reporting** - Now displays specific error codes and detailed messages instead of generic HTTP errors
- **Enhanced Error Parsing** - Better handling of array-based Salesforce error responses with comprehensive error extraction
- **Advanced Debug Logging** - Added JSON-formatted error logging and raw error output for easier troubleshooting
- **User-Friendly Error Messages** - Displays actionable error information (e.g., "STORAGE_LIMIT_EXCEEDED: storage limit exceeded")

### Bug Fixes
- **Error Message Display** - Fixed issue where generic "HTTP 400: Bad Request" was shown instead of specific Salesforce error details
- **Error Logging Enhancement** - Added multiple logging levels for better debugging and error tracking

---

## [1.0.0] - 2025-01-08

### Initial Release - Intelligent Development Enhancement with Enterprise Integration

#### 📚 Core Development Features
- **Language-Specific Instructions** - Comprehensive best practices for Go (5 guides), Python, Terraform, Bash, and software requirements
- **Smart Context Analysis** - Automatic detection of project technologies, frameworks, and patterns
- **Development Prompts** - Contextual prompts for code review, effort estimation, security scanning, and linting
- **Workspace Integration** - "Add Workspace Guidelines" command creates complete resource structure
- **Multi-Level Commands** - File-level and folder-level analysis and instruction application

#### 🏢 Enterprise Integration System
- **AWS Secrets Manager Integration** - Secure credential management using AWS CLI configuration
- **Salesforce API Integration** - Direct REST API connectivity with Feature__c objects
- **Dynamic Field Discovery** - Automatic Salesforce object structure analysis using describe APIs
- **Initiative & Epic Management** - Smart filtering with relationship-based data loading
- **JIRA Task Management** - Update tasks with structured effort estimation

#### 🎯 Project Management Capabilities
- **Effort Estimation Parser** - Intelligent parsing of time estimates from multiple formats (hours, days, weeks, story points, sprints)
- **Feature Submission Workflow** - Complete feature lifecycle with Salesforce integration
- **Real-time Status Monitoring** - Live connection status for AWS and Salesforce
- **Audit Trail Management** - Comprehensive logging and feature history tracking

#### 🎨 User Interface & Experience
- **Three-Tab Management Panel** - AWS Setup, Manage Features, and My Task List
- **Progressive Data Loading** - Load initiatives first, then filter epics based on selection
- **Connection Status Indicators** - Real-time visual feature for all connection states
- **Modern Webview Interface** - Clean, responsive UI with comprehensive error handling
- **Context Menu Integration** - Right-click commands for folders and files

#### 🛠️ Available Commands
- **Development Commands**: Analyze Code & Apply Instructions (`Ctrl+Shift+V A`), Apply Contextual Prompts (`Ctrl+Shift+V P`)
- **Workspace Commands**: Add Workspace Guidelines, Analyze Folder & Apply Instructions, Apply Folder Prompts
- **Enterprise Commands**: Connect to AWS, Submit Feature, Update JIRA Issue, Parse Copilot Estimation
- **Management Commands**: Open Panel, Refresh AWS Connection, View/Export/Clear Feature History

#### 📁 Resource Structure Created
- **Instructions** (9 files): Language-specific best practices including Go (5 comprehensive guides), Python, Terraform, Bash, and software requirements
- **Prompts** (5 files): Smart development prompts for Go review, effort estimation, security scanning, linting, and Jenkins CI/CD
- **How-to Guides** (4 files): Complete workflow documentation for development processes and integrations
- **VS Code Configuration**: MCP server configurations and workspace settings

#### 🧠 Intelligent Technology Detection
- **Language Recognition** - Automatic detection of Go, Python, Terraform, JavaScript, TypeScript, and Bash
- **Framework Detection** - Recognizes Gin, Echo, Fiber (Go), Django, Flask, FastAPI (Python), and more
- **Pattern Analysis** - Identifies coding patterns, architectural decisions, and project structures
- **Smart Resource Selection** - Contextual instruction and prompt recommendations based on detected technologies

#### ⚙️ Configuration & Settings
- **Basic Settings**: Auto-apply instructions, contextual prompts, notifications, and gitignore management
- **Enterprise Settings**: AWS profile/region configuration, Salesforce secret management
- **Keyboard Shortcuts**: `Ctrl+Shift+V A` (Analyze & Apply), `Ctrl+Shift+V P` (Contextual Prompts)
- **Configurable Work Hours**: Customizable time calculations for effort estimation (HOURS_PER_DAY, etc.)

#### 🏗️ Technical Architecture
- **TypeScript-based** - Full VS Code Extension API integration with modern development practices
- **Service-Oriented Design** - Separate services for AWS, Salesforce, feature, estimation, and notifications
- **Context Analysis Engine** - Intelligent project analysis and technology detection
- **Resource Management System** - Efficient file operations and workspace integration
- **Enterprise Security Model** - AWS Secrets Manager integration with secure credential handling

#### 🔧 Core Services Implementation
- **AWSService** - AWS CLI integration with Secrets Manager access and connection management
- **FeatureService** - Salesforce API integration with dynamic field discovery and form validation
- **JiraService** - Salesforce authentication using OAuth 2.0 with task management capabilities
- **EstimationParser** - Multi-format parsing engine for effort estimation (hours, days, weeks, story points)
- **NotificationManager** - Comprehensive user notification and status management system

#### 📊 Performance & Compatibility
- **VS Code Compatibility** - Requires VS Code 1.74.0 or higher
- **Multi-Platform Support** - Windows, macOS, and Linux compatibility
- **Optimized Package** - Webpack bundling for fast loading and minimal memory footprint
- **Language Support** - 6+ languages with comprehensive instruction sets and smart prompts
- **Enterprise Ready** - Production-ready with comprehensive error handling and audit trails

#### 🛡️ Security Features
- **Local Processing** - Core development features process data locally without external dependencies
- **Secure Credential Management** - AWS Secrets Manager integration, no local credential storage
- **Enterprise Security** - Follows AWS and Salesforce security best practices
- **Audit Trails** - Comprehensive logging for all operations and feature submissions
- **Privacy by Design** - No telemetry collection, open-source transparency

---

## Future Roadmap

### Planned Enhancements
- **Multi-Org Support** - Support for multiple Salesforce orgs with organization switching
- **Advanced Analytics** - Dashboard for tracking development metrics and feature trends
- **Custom Templates** - User-defined instruction and prompt templates
- **Integration Expansion** - Additional enterprise system integrations (Azure DevOps, Jira Cloud)
- **Collaboration Features** - Team-based instruction sharing and management
- **AI Enhancement** - Integration with additional AI coding assistants beyond GitHub Copilot

### Community & Contributions
- **Open Source** - Full source code available for community contributions
- **Issue Tracking** - GitHub Issues for bug reports and feature requests
- **Documentation** - Comprehensive guides and API documentation
- **Extension Ecosystem** - Planned integration with other VS Code extensions
- **Feature Loop** - Direct feature channel through the extension's Salesforce integration

---

## Notes

- This initial release provides a complete development enhancement and enterprise integration solution
- All features have been tested across multiple project types and enterprise environments
- The extension is designed for seamless integration with existing development workflows
- Backward compatibility will be maintained in future updates
- Community feature and contributions are actively encouraged for continuous improvement
