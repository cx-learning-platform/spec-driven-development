# Vibe Workflow

This document outlines the recommended workflow for using the Vibe system.

## Steps

1. **Clone the repository**  
   Run `git clone <repo-url>`

2. **Install dependencies**  
   - Use `npm install` or `yarn install` in the project root.

3. **Configure environment variables**  
   - Copy `.env.example` to `.env` and update values as needed.

4. **Start the MCP server**  
   - Run `npm run start:server` or equivalent.

5. **Start the client**  
   - Run `npm run start:client` or equivalent.

6. **Access the UI**  
   - Open [http://localhost:3000](http://localhost:3000) in your browser.

## Notes

- Ensure Node.js and npm are correctly installed and in your PATH.
- For any issues, check the logs in the `logs/` directory or run with `DEBUG=*`.