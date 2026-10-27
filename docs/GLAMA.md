# MCP Bridge on Glama

[Glama listing](https://glama.ai/mcp/servers/haseebgb92/ChatGPT-MCp) · [GitHub releases](https://github.com/haseebgb92/ChatGPT-MCp/releases/latest) · [Getting started](../README.md#quick-start)

## How to use this project

**MCP Bridge is a local desktop application, not a remote MCP connector.** Install it on the Linux or Windows computer that owns the files, authorized shell, and Chrome profile you want to work with. Configure approved roots and permissions in the desktop app, create your own outbound OpenAI Secure MCP Tunnel connections, and connect those tunnels in ChatGPT. The application must be running for local tools to be available.

The bundled MCP server exposes read-only file discovery by default. Optional write and terminal tools are controlled by local configuration and disabled unless explicitly enabled. Its shell tool executes with the local user's rights and is **not an OS sandbox**; do not turn it on for an untrusted client.

## Glama discovery and scoring

The root [`glama.json`](../glama.json) follows Glama's official schema and lists the repository's GitHub maintainer. Glama may need a new **Claim ownership** action or repository sync before indexing changes. The claimed listing is already author-verified; this file provides independent machine-readable ownership metadata.

Glama's **Build / Make Release** mechanism executes a containerized copy of an MCP server on Glama infrastructure. That container cannot access the installer's local desktop, the user's approved file roots, or their authenticated Chrome profile. We intentionally do **not** publish a misleading Glama-hosted release or a public shell-enabled container. GitHub installer releases are separate and do not satisfy Glama's hosted-release requirement.

Consequently, Glama may continue showing **No Glama release**, **No recent Glama usage**, and unscored server coherence / Tool Definition Quality Score until it supports a suitable local-only introspection workflow. Improving these indicators must not require moving the user's private data or credentials to a public container.

## Keeping the listing accurate

1. Push the current README, `glama.json`, and MCP tool descriptions to GitHub.
2. From the Glama admin page, use **Claim ownership** or repository sync to refresh metadata after a change.
3. Verify that the public listing reflects the latest release and that deployment is explicitly marked local-only.
4. Add only genuinely related servers through Glama's **Related Servers** interface.
5. Never submit a real Runtime API key, tunnel ID, local folder path, Chrome session, or browser cookie as a Glama build setting.

Please do not use public browser simulations to manufacture usage numbers or publish unprotected write/shell tools simply to raise a discovery score.

For security guidance see [SECURITY.md](../SECURITY.md).
