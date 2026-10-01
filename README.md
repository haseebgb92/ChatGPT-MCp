# ChatGPT MCP Bridge

Cross-platform system-tray manager that connects **ChatGPT Web** to your own computer through **OpenAI Secure MCP Tunnel**.

It provides two independent MCP connections:

- **Local MCP** — browse/search local folders, optionally create/edit files, and optionally run terminal commands.
- **Web MCP** — control your existing Chrome session with `chrome-devtools-mcp`, including navigation, tabs, clicks, typing, screenshots, DevTools inspection, and optional coordinate/vision tools.

Designed for **Linux** and **Windows**.

> This project does not create OpenAI tunnels or API keys for you. You supply your own Runtime API key and tunnel IDs.

## Why this exists

ChatGPT Web normally cannot directly reach `localhost`, your filesystem, or your desktop Chrome session. ChatGPT MCP Bridge keeps the local MCP servers on your machine and uses OpenAI Secure MCP Tunnel as the outbound connection.

```text
ChatGPT Web
   |
   +-- Local Files plugin -- Secure MCP Tunnel -- ChatGPT MCP Bridge -- Local MCP
   |                                                      |
   |                                                      +-- files
   |                                                      +-- folders
   |                                                      +-- optional shell
   |
   +-- Chrome plugin ----- Secure MCP Tunnel -- ChatGPT MCP Bridge -- Chrome DevTools MCP
                                                                  |
                                                                  +-- your existing Chrome
```

## Features

### Local MCP

- Add one or more allowed folders.
- Read-only or read/write mode per folder.
- List and inspect files.
- Read UTF-8 text files.
- Recursive filename/content search.
- Create folders.
- Create or replace text files.
- Optional terminal execution.
- Restricted shell mode by default.
- Optional full-shell mode for trusted machines/workflows.
- Path traversal and symlink escape protections for filesystem tools.

### Web / Chrome MCP

Uses `chrome-devtools-mcp` and can attach to the Chrome session you already use.

- Existing tabs and authenticated sessions.
- Navigate/open/close/select tabs.
- Click, hover, type, fill forms, keyboard input.
- Screenshots and accessibility snapshots.
- Console and network inspection.
- Performance/Lighthouse tooling.
- Optional `--experimentalVision` coordinate-based browser tools.
- Optional usage-statistics opt-out.

### Desktop app

- Linux and Windows.
- System tray/taskbar controls.
- Start/stop Local MCP independently.
- Start/stop Web MCP independently.
- Restart running servers.
- Optional launch at OS login.
- Optional auto-start for either MCP.
- Runtime logs.
- OS-backed encrypted Runtime API-key storage through Electron `safeStorage`.
- Detects an existing full `tunnel-client` on PATH or uses the bundled binary in packaged builds.

## Requirements

For development/source use:

- Node.js 24+
- npm
- A full OpenAI `tunnel-client` on PATH, unless you provide one manually.

For Web MCP:

- Google Chrome
- Chrome remote debugging enabled at:

```text
chrome://inspect/#remote-debugging
```

For ChatGPT:

- Access to Developer Mode / custom MCP apps using Secure MCP Tunnel.
- A Runtime API key with the tunnel permissions required by your OpenAI Platform organization.
- One tunnel ID for Local MCP.
- A **different** tunnel ID for Web MCP if both will run at the same time.

## Quick start from source

### Linux

```bash
git clone https://github.com/haseebgb92/ChatGPT-MCp.git
cd ChatGPT-MCp
npm install
npm start
```

### Windows

```powershell
git clone https://github.com/haseebgb92/ChatGPT-MCp.git
cd ChatGPT-MCp
npm install
npm start
```

## First-time setup

Open **ChatGPT MCP Bridge** and configure:

1. **Runtime API key**
2. **Local MCP tunnel ID**
3. **Web MCP tunnel ID**
4. One or more local folders
5. Read-only/read-write permission per folder
6. Whether Local MCP may write files
7. Whether Local MCP may execute shell commands
8. Whether Chrome coordinate/vision tools are enabled

Save your settings, then turn on the servers from the dashboard or tray.

In ChatGPT Web, create two Tunnel-based developer apps/plugins using the corresponding tunnel IDs.

Suggested names:

- `Local Files`
- `Chrome`

Use different tunnel IDs for the two connections.

## Runtime API key

The Runtime API key is used by the local `tunnel-client` process to authenticate to OpenAI's tunnel control plane.

Do **not** commit API keys to this repository.

When **Remember API key securely** is enabled, ChatGPT MCP Bridge uses Electron's OS-backed `safeStorage`. If secure storage is unavailable, the app refuses to silently save the key as plaintext.

## Local folder permissions

Each configured root has a mode:

```text
read-only
read-write
```

Filesystem operations are restricted to configured roots.

Shell access is intentionally separate because a shell-capable process is not a true filesystem sandbox.

## Shell modes

### Restricted shell

Designed for normal development commands while blocking obvious destructive/system-level commands such as `sudo`, `shutdown`, `mkfs`, and dangerous recursive-force root deletes.

Examples of intended commands:

```bash
npm install
npm run build
git status
git diff
git pull
git push
python script.py
adb devices
```

### Full shell

Full shell executes Bash on Linux or PowerShell on Windows with the privileges of the current user.

**Full shell is powerful and is not an OS sandbox. Only enable it on a machine and MCP connection you trust.**

## Chrome / Web MCP

The Web MCP launches the bundled `chrome-devtools-mcp` package using `--autoConnect`.

Enable Chrome remote debugging first:

```text
chrome://inspect/#remote-debugging
```

When **Coordinate/vision tools** is enabled, the app adds:

```text
--experimentalVision
```

This exposes coordinate-based browser interactions in supported Chrome DevTools MCP versions.

## Building installers

The repository includes GitHub Actions at:

```text
.github/workflows/build.yml
```

It builds:

### Linux

- AppImage
- Debian `.deb`

### Windows

- NSIS `.exe` installer

The workflow also builds and bundles the full OpenAI `tunnel-client` from the pinned source release.

Run the workflow manually from **Actions → Build installers**, or push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Artifacts will appear on the workflow run.

## Local builds

Install dependencies:

```bash
npm install
```

Validate JavaScript:

```bash
npm run check
```

Linux:

```bash
npm run dist:linux
```

Windows:

```powershell
npm run dist:win
```

Build output is written to `dist/`.

## Tray controls

The tray menu provides:

- Local MCP: ON/OFF
- Web MCP: ON/OFF
- Open Dashboard
- Restart Running Servers
- Quit

Closing the main window hides the app to the tray instead of stopping active servers.

## Security notes

- Never commit Runtime API keys.
- Use separate tunnel IDs for Local and Web MCP.
- Prefer read-only roots unless write access is required.
- Enable shell only when needed.
- Full shell should be treated as local-user-equivalent code execution.
- Chrome MCP can act inside logged-in browser sessions; review consequential actions before allowing them.
- The app redacts OpenAI-style `sk-` keys from its runtime logs.

## Project structure

```text
.
├── .github/workflows/build.yml
├── assets/
├── bundled/
│   └── local-mcp/
├── src/
│   ├── main.js
│   ├── preload.js
│   └── renderer/
├── .gitignore
├── LICENSE
├── package.json
└── README.md
```

## Current status

**v0.1.0**

The initial release focuses on making Local MCP and Chrome MCP easy to run from one tray app on Linux and Windows.

Planned improvements include better first-run diagnostics, easier tunnel health visibility, installer/release automation, and further hardening of shell controls.

## License

MIT License.

## Credits

- OpenAI Secure MCP Tunnel / `tunnel-client`
- Model Context Protocol
- Chrome DevTools MCP
- Electron

Built by **Advertpreneur**.
