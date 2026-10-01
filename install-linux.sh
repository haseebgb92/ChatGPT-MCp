#!/usr/bin/env bash
set -euo pipefail

REPO="haseebgb92/ChatGPT-MCp"
API="https://api.github.com/repos/$REPO/releases/latest"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(uname -s)" != "Linux" ]]; then
  die "This installer is for Linux."
fi

ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
if [[ "$ARCH" != "amd64" ]]; then
  die "The current Linux package supports Debian/Ubuntu/Linux Mint amd64 only. Detected: ${ARCH:-unknown}"
fi

if ! command -v apt-get >/dev/null 2>&1; then
  die "This installer currently supports Debian/Ubuntu/Linux Mint systems using apt."
fi

if ! command -v sudo >/dev/null 2>&1; then
  die "sudo is required for system installation."
fi

say "Installing system prerequisites"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git build-essential xz-utils libsecret-1-0 gnome-keyring

if [[ "${SKIP_CHROME:-0}" != "1" ]] && \
   ! command -v google-chrome >/dev/null 2>&1 && \
   ! command -v google-chrome-stable >/dev/null 2>&1 && \
   ! command -v chromium >/dev/null 2>&1 && \
   ! command -v chromium-browser >/dev/null 2>&1; then
  say "Chrome/Chromium not found; installing Google Chrome Stable"
  curl -fL "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" \
    -o "$TMP/google-chrome.deb"
  sudo apt-get install -y "$TMP/google-chrome.deb"
fi

say "Checking for a published ChatGPT MCP Bridge release"
RELEASE_JSON="$(curl -fsSL \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "$API" 2>/dev/null || true)"

DEB_URL=""
if [[ -n "$RELEASE_JSON" ]]; then
  DEB_URL="$(printf '%s\n' "$RELEASE_JSON" \
    | grep -oE '"browser_download_url":[[:space:]]*"[^"]+\.deb"' \
    | head -n 1 \
    | sed -E 's/^"browser_download_url":[[:space:]]*"([^"]+)"$/\1/' || true)"
fi

if [[ -n "$DEB_URL" ]]; then
  say "Downloading latest published .deb"
  curl -fL "$DEB_URL" -o "$TMP/chatgpt-mcp-bridge.deb"
else
  say "No published .deb release found; building the current main branch automatically"

  NODE_MAJOR=""
  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  fi

  if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 24 )); then
    say "Using existing Node.js $(node --version)"
  else
    say "Node.js 24+ not found; downloading a temporary Node.js 24 runtime"
    curl -fsSL https://nodejs.org/dist/index.tab -o "$TMP/node-index.tab"
    NODE_VERSION="$(awk 'NR>1 && $1 ~ /^v24\./ { print $1; exit }' "$TMP/node-index.tab")"
    [[ -n "$NODE_VERSION" ]] || die "Could not determine the latest Node.js 24 release."
    say "Using Node.js $NODE_VERSION"
    curl -fL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" -o "$TMP/node.tar.xz"
    mkdir -p "$TMP/node"
    tar -xJf "$TMP/node.tar.xz" -C "$TMP/node" --strip-components=1
    export PATH="$TMP/node/bin:$PATH"
  fi

  GO_OK=0
  if command -v go >/dev/null 2>&1; then
    GO_VER="$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//' || true)"
    GO_MAJOR="$(printf '%s' "$GO_VER" | cut -d. -f1)"
    GO_MINOR="$(printf '%s' "$GO_VER" | cut -d. -f2)"
    if [[ "$GO_MAJOR" =~ ^[0-9]+$ && "$GO_MINOR" =~ ^[0-9]+$ ]] && { (( GO_MAJOR > 1 )) || (( GO_MAJOR == 1 && GO_MINOR >= 27 )); }; then
      GO_OK=1
      say "Using existing $(go version)"
    fi
  fi

  if (( GO_OK == 0 )); then
    say "Go 1.27+ not found; downloading a temporary Go toolchain"
    curl -fsSL 'https://go.dev/VERSION?m=text' -o "$TMP/go-version.txt"
    GO_VERSION="$(sed -n '1p' "$TMP/go-version.txt" | tr -d '\r')"
    [[ "$GO_VERSION" =~ ^go[0-9]+\.[0-9]+ ]] || die "Could not determine the current Go release."
    say "Using $GO_VERSION"
    curl -fL "https://go.dev/dl/${GO_VERSION}.linux-amd64.tar.gz" -o "$TMP/go.tar.gz"
    mkdir -p "$TMP/go"
    tar -xzf "$TMP/go.tar.gz" -C "$TMP/go" --strip-components=1
    export PATH="$TMP/go/bin:$PATH"
  fi

  say "Downloading ChatGPT MCP Bridge source"
  git clone --depth 1 "https://github.com/$REPO.git" "$TMP/app"
  cd "$TMP/app"

  say "Installing application dependencies"
  npm install

  mkdir -p vendor/tunnel-client
  if command -v tunnel-client >/dev/null 2>&1 && tunnel-client help >/dev/null 2>&1; then
    say "Using existing full tunnel-client from $(command -v tunnel-client)"
    cp "$(command -v tunnel-client)" vendor/tunnel-client/tunnel-client
  else
    say "Building bundled OpenAI tunnel-client"
    git clone --depth 1 --branch v0.0.15 https://github.com/openai/tunnel-client.git "$TMP/tunnel-client"
    (
      cd "$TMP/tunnel-client"
      go build -o "$TMP/app/vendor/tunnel-client/tunnel-client" ./cmd/client
    )
  fi
  chmod +x vendor/tunnel-client/tunnel-client

  say "Validating application"
  npm run check

  say "Building Linux .deb"
  npm run dist:linux:deb

  BUILT_DEB="$(find dist -maxdepth 1 -type f -name '*.deb' -print -quit)"
  [[ -n "$BUILT_DEB" ]] || die "The Linux build completed without producing a .deb file."
  cp "$BUILT_DEB" "$TMP/chatgpt-mcp-bridge.deb"
fi

say "Installing ChatGPT MCP Bridge and package dependencies"
sudo apt-get install -y "$TMP/chatgpt-mcp-bridge.deb"

say "Installation complete"
printf '%s\n' \
  "Open 'ChatGPT MCP Bridge' from your applications menu." \
  "" \
  "The installed app contains:" \
  "  - Local MCP server" \
  "  - Chrome DevTools MCP" \
  "  - Electron/Node runtime" \
  "  - OpenAI tunnel-client" \
  "" \
  "You only need to enter your own Runtime API key and two tunnel IDs." \
  "Tunnel IDs: https://platform.openai.com/settings/organization/tunnels" \
  "Runtime API keys: https://platform.openai.com/settings/organization/api-keys" \
  "ChatGPT app/connector settings: https://chatgpt.com/#settings/Connectors"
