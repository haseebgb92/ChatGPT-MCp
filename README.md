# ChatGPT MCP Bridge

Cross-platform system-tray manager that connects **ChatGPT Web** to your own computer through **OpenAI Secure MCP Tunnel**.

It provides two independent MCP connections:

- **Local MCP** — browse/search local folders, optionally create/edit files, and optionally run terminal commands.
- **Web MCP** — control your existing Chrome session with `chrome-devtools-mcp`, including navigation, tabs, clicks, typing, screenshots, DevTools inspection, and optional coordinate/vision tools.

Designed for **Linux** and **Windows**.

> ChatGPT MCP Bridge does not create OpenAI tunnels or API keys for you. You create those in your own OpenAI Platform account and enter them into the app.

## What gets installed

The packaged Linux and Windows installers include the runtime pieces needed by ChatGPT MCP Bridge:

- Desktop tray app
- Local MCP server
- Chrome DevTools MCP
- Electron/Node runtime
- Full OpenAI `tunnel-client`

On supported Linux systems, the one-command installer also installs required system packages and installs Google Chrome Stable automatically if Chrome/Chromium is not already present.

You do **not** need to manually install Node.js, npm, Go, the MCP SDK, Chrome DevTools MCP, or `tunnel-client` when using a packaged release.

## Linux — one-command install

Current Linux packages target **Debian / Ubuntu / Linux Mint on amd64/x86_64**.

Run:

```bash
curl -fsSL -H "Accept: application/vnd.github.raw+json" "https://api.github.com/repos/haseebgb92/ChatGPT-MCp/contents/install-linux.sh?ref=main" | bash
```

The installer:

1. installs required Linux packages;
2. detects Chrome/Chromium;
3. installs Google Chrome Stable if no supported browser is found;
4. downloads the newest ChatGPT MCP Bridge `.deb` from GitHub Releases;
5. installs the app and package dependencies.

If you already have the browser you want and do not want the installer to install Chrome:

```bash
curl -fsSL -H "Accept: application/vnd.github.raw+json" "https://api.github.com/repos/haseebgb92/ChatGPT-MCp/contents/install-linux.sh?ref=main" | SKIP_CHROME=1 bash
```

After installation, open **ChatGPT MCP Bridge** from the Linux applications menu.

### Manual Linux install

You can also download the newest `.deb` from:

https://github.com/haseebgb92/ChatGPT-MCp/releases/latest

Then install it with:

```bash
sudo apt install ./ChatGPT-MCP-Bridge*.deb
```

## Windows install

Download the newest Windows `.exe` installer from:

https://github.com/haseebgb92/ChatGPT-MCp/releases/latest

Run the installer normally. The packaged Windows build includes the Local MCP, Chrome DevTools MCP, Electron/Node runtime, and OpenAI `tunnel-client.exe`.

## OpenAI setup — where to get the tunnel IDs and Runtime API key

You need **three values**:

```text
1 Runtime API key
1 Local MCP tunnel ID
1 Web/Chrome MCP tunnel ID
```

Use a different tunnel ID for Local MCP and Web MCP if you want both running at the same time.

### 1. Create the Local MCP tunnel

Open OpenAI Platform:

https://platform.openai.com/settings/organization/tunnels

Create a new tunnel, for example:

```text
Name: Local Files
```

Copy the generated tunnel ID. It looks like:

```text
tunnel_0123456789abcdef0123456789abcdef
```

Enter that value into **Local tunnel ID** in ChatGPT MCP Bridge.

### 2. Create the Web / Chrome tunnel

On the same Tunnels page:

https://platform.openai.com/settings/organization/tunnels

Create another tunnel, for example:

```text
Name: Chrome
```

Copy that second tunnel ID and enter it into **Web tunnel ID** in ChatGPT MCP Bridge.

Do not reuse the Local tunnel ID when Local MCP and Web MCP will run simultaneously.

### 3. Create the Runtime API key

Open:

https://platform.openai.com/settings/organization/api-keys

Create a **Runtime API key**.

For least privilege, use a restricted key whose principal has:

```text
Tunnels: Read
Tunnels: Use
```

The runtime key is the value used by `tunnel-client doctor` and `tunnel-client run`.

Do **not** use an OpenAI Admin API key as the long-running tunnel Runtime API key.

Paste the Runtime API key into **Runtime API key** in ChatGPT MCP Bridge.

When **Remember API key securely** is enabled, the app stores it using Electron `safeStorage` / your operating system's secure credential encryption instead of writing the secret directly into the normal settings file.

## ChatGPT setup

Open ChatGPT's connector/app settings:

https://chatgpt.com/#settings/Connectors

Enable Developer Mode/custom MCP apps if your account/workspace requires it.

Create the Local app/connector:

```text
Name: Local Files
Connection: Tunnel
Tunnel: <your Local tunnel ID>
```

Create the browser app/connector:

```text
Name: Chrome
Connection: Tunnel
Tunnel: <your Web tunnel ID>
```

Start the matching MCP server in ChatGPT MCP Bridge before scanning/refeshing its tools.

OpenAI's current developer-mode documentation notes that local/private MCP servers are not connected directly by ChatGPT; Secure MCP Tunnel is the supported way to connect a developer machine or private-network MCP server without exposing it publicly.

## First-time setup in the app

Open **ChatGPT MCP Bridge** and configure:

1. Runtime API key
2. Local tunnel ID
3. Web tunnel ID
4. One or more local folders
5. Read-only/read-write mode per folder
6. Whether Local MCP can write files
7. Whether Local MCP can run terminal commands
8. Whether Web MCP coordinate/vision tools are enabled
9. Optional auto-start at login

Save your settings.

Then use:

```text
Local MCP   ON
Web MCP     ON
```

You can also start/stop each server directly from the system tray.

## Chrome setup

Web MCP uses `chrome-devtools-mcp` with `--autoConnect`.

Open Chrome:

```text
chrome://inspect/#remote-debugging
```

Enable remote debugging for your local Chrome profile.

When **Coordinate/vision tools** is enabled, ChatGPT MCP Bridge launches Chrome DevTools MCP with:

```text
--experimentalVision
```

This allows supported coordinate-based browser tools in addition to normal DOM/snapshot-based clicking and typing.

## Architecture

```text
ChatGPT Web
   |
   +-- Local Files app ---- Secure MCP Tunnel ---- ChatGPT MCP Bridge
   |                                                   |
   |                                                   +-- Local MCP
   |                                                       +-- files
   |                                                       +-- folders
   |                                                       +-- optional shell
   |
   +-- Chrome app --------- Secure MCP Tunnel ---- ChatGPT MCP Bridge
                                                       |
                                                       +-- Chrome DevTools MCP
                                                           +-- existing Chrome
```

## Features

### Local MCP

- Multiple allowed local roots.
- Read-only/read-write mode per folder.
- List files and folders.
- Inspect file metadata.
- Read UTF-8 text files.
- Recursive filename/content search.
- Create folders.
- Create or replace text files.
- Optional terminal execution.
- Restricted shell mode.
- Optional full shell mode.
- Filesystem path traversal/symlink checks for file tools.

### Web / Chrome MCP

- Uses the existing Chrome session.
- Existing tabs and authenticated sessions.
- Navigate/open/close/select tabs.
- Click, hover, type, fill forms and keyboard input.
- Screenshots and accessibility snapshots.
- Console and network inspection.
- Performance/Lighthouse tooling.
- Optional coordinate/vision tools.
- Optional usage-statistics opt-out.

### Desktop app

- Linux and Windows.
- System tray/taskbar controls.
- Start/stop Local MCP independently.
- Start/stop Web MCP independently.
- Restart running servers.
- Optional launch at OS login.
- Optional MCP auto-start.
- Runtime logs.
- Secure Runtime API-key storage.
- Bundled full OpenAI `tunnel-client` in packaged releases.

## Shell modes

### Restricted shell

Designed for common development work while blocking several obvious destructive/system-level commands.

Examples:

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

Restricted shell is a guardrail, not a complete OS sandbox.

### Full shell

Full shell executes Bash on Linux or PowerShell on Windows with the current user's privileges.

**Full shell should be treated as local-user-equivalent code execution. Enable it only for a machine and MCP connection you trust.**

## Build from source

Source builds are mainly for contributors. Packaged releases are easier for normal use.

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

A source/development run expects a full `tunnel-client` either on PATH or selected in the app's Advanced settings.

## Building installers

GitHub Actions is configured in:

```text
.github/workflows/build.yml
```

A version tag builds and publishes:

### Linux

- `.deb`
- `.AppImage`

### Windows

- NSIS `.exe`

The build workflow also compiles and bundles the full OpenAI `tunnel-client`.

Create a release build with:

```bash
git tag v0.1.0
git push origin v0.1.0
```

When both platform builds succeed, GitHub Actions publishes the generated installers to the matching GitHub Release.

## Local development builds

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

## Security notes

- Never commit Runtime API keys.
- Use a Restricted Runtime API key with only the permissions you need.
- Use separate tunnel IDs for Local and Web MCP.
- Prefer read-only roots unless write access is required.
- Enable shell only when needed.
- Full shell is not a sandbox.
- Chrome MCP can act inside logged-in browser sessions.
- Review consequential actions before allowing them.
- The app redacts OpenAI-style `sk-` keys from runtime logs.

See [SECURITY.md](SECURITY.md).

## Project structure

```text
.
├── .github/workflows/build.yml
├── assets/
├── bundled/
│   └── local-mcp/
├── install-linux.sh
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

The first release focuses on making Local MCP and Chrome MCP simple to run from a tray app on Linux and Windows.

## License

MIT License.

## Credits

- OpenAI Secure MCP Tunnel / `tunnel-client`
- Model Context Protocol
- Chrome DevTools MCP
- Electron

Built by **Advertpreneur**.
