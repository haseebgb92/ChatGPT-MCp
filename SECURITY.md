# Security

ChatGPT MCP Bridge can expose local files, shell commands, and an authenticated Chrome session to an MCP client. Treat those capabilities as powerful local access.

## Reporting a vulnerability

Please report security issues privately to the repository owner rather than opening a public issue with exploit details or credentials.

## Safe-use guidance

- Never commit OpenAI Runtime API keys.
- Use different tunnel IDs for Local MCP and Web MCP.
- Prefer read-only roots where possible.
- Enable write access only for folders you intend ChatGPT to modify.
- Restricted shell is a convenience guard, not an OS sandbox.
- Full shell should be treated as code execution with your current user privileges.
- Chrome MCP can act inside logged-in browser sessions.
- Review consequential actions before allowing them to proceed.
- Revoke any API key that is accidentally pasted into a chat, issue, log, or commit.

The application attempts to redact OpenAI-style `sk-` keys from its runtime logs and uses Electron `safeStorage` when persistent key storage is enabled.
