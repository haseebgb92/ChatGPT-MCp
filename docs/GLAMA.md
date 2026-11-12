# MCP Bridge on Glama

[Glama listing](https://glama.ai/mcp/servers/haseebgb92/ChatGPT-MCp) · [GitHub releases](https://github.com/haseebgb92/ChatGPT-MCp/releases/latest) · [Getting started](../README.md#quick-start)

## How to use this project

**MCP Bridge is a local desktop application, not a remote MCP connector.** Install it on the Linux or Windows computer that owns the files, authorized shell, and Chrome profile you want to work with. Configure approved roots and permissions in the desktop app, create your own outbound OpenAI Secure MCP Tunnel connections, and connect those tunnels in ChatGPT. The application must be running for local tools to be available.

The bundled MCP server exposes read-only file discovery by default. Optional write and terminal tools are controlled by local configuration and disabled unless explicitly enabled. Its shell tool executes with the local user's rights and is **not an OS sandbox**; do not turn it on for an untrusted client.

## Glama discovery and scoring

The root [`glama.json`](../glama.json) follows Glama's official schema and lists the repository's GitHub maintainer. Glama may need a new **Claim ownership** action or repository sync before indexing changes. The claimed listing is already author-verified; this file provides independent machine-readable ownership metadata.

**Hosted release v0.1.0 was published to Glama on October 27, 2026** after a successful Glama-managed Docker build and real MCP `tools/list` inspection. The hosted sample provides five read-only tools against two bundled public Markdown documents. It does not access the user's desktop, files, Chrome, shell, local network, or credentials.

The separate **full desktop MCP Bridge** continues to require installation and approved local tunnel connections. The Glama-hosted edition is a limited, public protocol demonstration, never a substitute for desktop access. GitHub installer releases are not Glama releases.

Glama's Tool Definition Quality Score and server coherence may be evaluated after publication. Recent usage and related-server signals are separate and must reflect genuine activity; no simulated usage or private data disclosure is appropriate just to raise a score.

## Keeping the listing accurate

1. Keep the Glama listing and README explicit about the **limited hosted demonstration** versus the **full locally installed desktop app**.
2. Use Glama's **Sync Server** after future GitHub changes; keep the pinned commit field empty when building from the latest checked-in source.
3. Run and inspect a fresh Glama build test before publishing a replacement hosted release.
4. Add only genuinely related servers, and let real usage metrics accumulate naturally.
5. Never submit Runtime API keys, tunnel IDs, personal folder paths, Chrome sessions or browser cookies as Glama build settings.

Please do not use public browser simulations to manufacture usage numbers or publish unprotected write/shell tools simply to raise a discovery score.

For security guidance see [SECURITY.md](../SECURITY.md).
