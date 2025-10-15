# VS Code MCP Server Guide

## Overview
Model Context Protocol (MCP) servers extend VS Code Copilot with specialized tools and capabilities. This guide covers setup, configuration, and usage of MCP servers.

## Prerequisites
- Latest VS Code with GitHub Copilot access
- MCP support enabled: `chat.mcp.enabled = true` (default)

## Setup Process

### Step 1: Enable MCP Support
1. Open VS Code Settings (`Ctrl+,`)
2. Search: `chat.mcp.enabled`
3. ✅ Ensure this is enabled

### Step 2: Create Configuration File
Create `.vscode/mcp.json` in your workspace root:

```json
{
  "servers": {},
  "inputs": []
}
```

### Step 3: Add Servers
Add server configurations to the `servers` object.

## Configuration Format

### Basic Structure
```json
"server-name": {
  "command": "uvx|npx|npm",
  "args": ["package-args"],
  "env": {"ENV_VAR": "value"},
  "disabled": false,
  "autoApprove": ["tool-names"],
  "type": "stdio"
}
```

### Required Fields
- **type**: `"stdio"` for local servers, `"http"/"sse"` for remote
- **command**: Execution command (`uvx`, `npx`, `npm`, `python`, `node`)
- **args**: Command arguments array

### Optional Fields
- **env**: Environment variables object
- **disabled**: Disable server (default: `false`)
- **autoApprove**: Auto-approve specific tools array

## Example Configurations

### Task Management
```json
"task-master-ai": {
  "command": "npx",
  "args": ["-y", "--package=task-master-ai", "task-master-ai"],
  "env": {"MISTRAL_API_KEY": "${input:mistral-key}"},
  "type": "stdio"
}
```

### AWS Services
```json
"AWS API MCP Server": {
  "command": "uvx",
  "args": ["awslabs.aws-api-mcp-server@latest"],
  "env": {
    "AWS_REGION": "us-east-1",
    "AWS_PROFILE": "default"
  },
  "type": "stdio"
}
```

### Terraform/Infrastructure
```json
"Terraform MCP Server": {
  "command": "uvx",
  "args": ["--from", "awslabs.terraform-mcp-server", "python", "-m", "awslabs.terraform_mcp_server.server"],
  "env": {"FASTMCP_LOG_LEVEL": "ERROR"},
  "type": "stdio"
}
```

### Kubernetes/EKS
```json
"EKS MCP Server": {
  "command": "uvx",
  "args": ["--from", "awslabs.eks-mcp-server", "python", "-m", "awslabs.eks_mcp_server.server"],
  "env": {"AWS_REGION": "us-east-1"},
  "autoApprove": ["list_k8s_resources", "get_pod_logs"],
  "type": "stdio"
}
```

## Input Variables (Sensitive Data)
```json
{
  "inputs": [
    {
      "id": "mistral-key",
      "description": "Mistral API Key",
      "type": "promptString",
      "password": true
    }
  ]
}
```

## Usage

### Step 1: Start Agent Mode
1. Open Chat view (`Ctrl+Alt+I`)
2. Select **Agent mode** from dropdown
3. Click **Tools** button to see available MCP tools

### Step 2: Use Tools
- **Automatic**: Tools are invoked automatically based on your prompt
- **Manual**: Reference tools with `#tool-name` in your prompt
- **Direct**: Use MCP prompts with `/mcp.servername.promptname`

### Step 3: Manage Tools
- Select/deselect tools in the Tools picker
- Maximum 128 tools per request
- Use tool sets to group related tools

## Management Commands

| Action | Command |
|--------|---------|
| View servers | `MCP: Show Installed Servers` |
| List servers | `MCP: List Servers` |
| Reset tools | `MCP: Reset Cached Tools` |
| Open config | `MCP: Open Workspace Configuration` |
| Browse resources | `MCP: Browse Resources` |

## Best Practices
- Use `autoApprove` only for trusted, read-only operations
- Set `FASTMCP_LOG_LEVEL` to `"ERROR"` for production
- Store sensitive data in input variables, not hardcoded
- Use descriptive server names with camelCase
- Test servers individually before adding multiple

## Troubleshooting
- **Server not starting**: Check command syntax and PATH
- **Permission issues**: Verify AWS credentials/profiles
- **Tool not available**: Run `MCP: Reset Cached Tools`
- **Too many tools**: Reduce selection or enable virtual tools
- **View logs**: Use `MCP: List Servers` → Select server → Show Output

**💡 Pro Tip:** Start with essential servers, use autoApprove carefully, and leverage tool sets for better organization!