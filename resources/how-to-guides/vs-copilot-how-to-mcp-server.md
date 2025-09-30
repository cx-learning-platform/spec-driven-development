# VS Copilot: How to Use with MCP Server

This guide explains how to set up and use VS Copilot in conjunction with an MCP server.

## Prerequisites

- MCP server running (see `mcp.json` for configuration).
- VS Code with Copilot extension installed.

## Steps

1. Start the MCP server:
   ```
   npm run start:server
   ```
2. Ensure the server is accessible at the host and port specified in `mcp.json`.

3. Open VS Code and your project folder.

4. Use Copilot as usual; custom server APIs can be accessed from your codebase.

## Tips

- To change server settings, edit `mcp.json` and restart the server.
- Check the server logs for any errors if integration fails.