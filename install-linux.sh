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
  die "The current release supports Debian/Ubuntu/Linux Mint amd64 only. Detected: ${ARCH:-unknown}"
fi

if ! command -v apt-get >/dev/null 2>&1; then
  die "This installer currently supports Debian/Ubuntu/Linux Mint systems using apt."
fi

if ! command -v sudo >/dev/null 2>&1; then
  die "sudo is required for system installation."
fi

say "Installing system prerequisites"
sudo apt-get update
sudo apt-get install -y ca-certificates curl libsecret-1-0 gnome-keyring

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

say "Finding latest ChatGPT MCP Bridge release"
RELEASE_JSON="$(curl -fsSL \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "$API")" || die "Could not read the latest GitHub release."

DEB_URL="$(printf '%s\n' "$RELEASE_JSON" \
  | grep -oE '"browser_download_url":[[:space:]]*"[^"]+\.deb"' \
  | head -n 1 \
  | sed -E 's/^"browser_download_url":[[:space:]]*"([^"]+)"$/\1/')" || true

if [[ -z "$DEB_URL" ]]; then
  die "No .deb installer is attached to the latest release yet. Open https://github.com/$REPO/actions and build/tag a release first."
fi

say "Downloading ChatGPT MCP Bridge"
curl -fL "$DEB_URL" -o "$TMP/chatgpt-mcp-bridge.deb"

say "Installing ChatGPT MCP Bridge and required package dependencies"
sudo apt-get install -y "$TMP/chatgpt-mcp-bridge.deb"

say "Installation complete"
printf '%s\n' \
  "Open 'ChatGPT MCP Bridge' from your applications menu." \
  "The packaged app already contains:" \
  "  - Local MCP server" \
  "  - Chrome DevTools MCP" \
  "  - Node/Electron runtime" \
  "  - OpenAI tunnel-client" \
  "" \
  "You only need to enter your own Runtime API key and two tunnel IDs." \
  "Tunnel IDs: https://platform.openai.com/settings/organization/tunnels" \
  "Runtime API keys: https://platform.openai.com/settings/organization/api-keys" \
  "ChatGPT app/connector settings: https://chatgpt.com/#settings/Connectors"
