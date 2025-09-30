---
description: Detect and flag secrets or sensitive information in code, and provide secure handling recommendations.
mode: ask
model:
tools: []
inputVariables: []
---

# Secrets Detection Prompt

## Purpose
Identify and flag potential secrets, credentials, or sensitive information in code.  
Provide safe handling recommendations without altering application logic.

---

## Detection Rules
Flag the following if found in code:
- API keys, access tokens, session tokens  
- Hardcoded usernames or passwords  
- Private keys or certificates (`.pem`, `.crt`, `.key`)  
- Database connection strings or DSNs  
- Cloud provider credentials (AWS, GCP, Azure, etc.)  

---

## Recommendations
When secrets are detected, suggest safer handling practices:
- Use **environment variables** instead of hardcoding  
- Store secrets in a **`.env` file** (excluded from version control)  
- Integrate a **secrets manager** (e.g., AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager)  
- Rotate credentials regularly and follow the principle of least privilege  

---

## Important Notes
- Do **not** modify or remove application logic  
- Only highlight risks and recommend remediations  
- Output should clearly separate **Findings** and **Recommendations** for clarity  
