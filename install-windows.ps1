$ErrorActionPreference = "Stop"

$Repo = "haseebgb92/ChatGPT-MCp"
$RepoUrl = "https://github.com/$Repo.git"
$TempRoot = Join-Path $env:TEMP ("chatgpt-mcp-bridge-" + [Guid]::NewGuid().ToString("N"))
$AppDir = Join-Path $TempRoot "app"
$TunnelDir = Join-Path $TempRoot "tunnel-client"

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Require-Winget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is required. Install/update 'App Installer' from Microsoft Store, then run this command again."
    }
}

function Ensure-Package([string]$Command, [string]$WingetId, [string]$Label) {
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-Step "Using existing $Label"
        return
    }
    Require-Winget
    Write-Step "Installing $Label"
    winget install --id $WingetId -e --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install $Label."
    }
    Refresh-Path
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "$Label was installed but '$Command' is not visible yet. Close PowerShell, reopen it, and rerun this installer."
    }
}

try {
    Write-Step "Preparing Windows prerequisites"
    Ensure-Package "git" "Git.Git" "Git"
    Ensure-Package "node" "OpenJS.NodeJS.LTS" "Node.js LTS"
    Ensure-Package "go" "GoLang.Go" "Go"

    $nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
    if ($nodeMajor -lt 24) {
        throw "Node.js 24+ is required. Detected: $(node --version)"
    }

    $goText = (go version)
    if ($goText -notmatch "go(\d+)\.(\d+)") {
        throw "Could not determine Go version."
    }
    $goMajor = [int]$Matches[1]
    $goMinor = [int]$Matches[2]
    if (($goMajor -lt 1) -or ($goMajor -eq 1 -and $goMinor -lt 27)) {
        throw "Go 1.27+ is required. Detected: $goText"
    }

    New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

    Write-Step "Downloading ChatGPT MCP Bridge source"
    git clone --depth 1 $RepoUrl $AppDir
    if ($LASTEXITCODE -ne 0) { throw "Could not clone ChatGPT MCP Bridge." }

    Write-Step "Installing application dependencies"
    Push-Location $AppDir
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

    Write-Step "Building bundled OpenAI tunnel-client"
    git clone --depth 1 --branch v0.0.15 https://github.com/openai/tunnel-client.git $TunnelDir
    if ($LASTEXITCODE -ne 0) { throw "Could not clone OpenAI tunnel-client." }

    New-Item -ItemType Directory -Path (Join-Path $AppDir "vendor\tunnel-client") -Force | Out-Null
    Push-Location $TunnelDir
    go build -o (Join-Path $AppDir "vendor\tunnel-client\tunnel-client.exe") ./cmd/client
    if ($LASTEXITCODE -ne 0) { throw "Could not build OpenAI tunnel-client." }
    Pop-Location

    Write-Step "Validating application"
    Push-Location $AppDir
    npm run check
    if ($LASTEXITCODE -ne 0) { throw "Application validation failed." }

    Write-Step "Building Windows installer"
    npm run dist:win
    if ($LASTEXITCODE -ne 0) { throw "Windows installer build failed." }

    $Installer = Get-ChildItem (Join-Path $AppDir "dist") -Filter "*.exe" -File |
        Where-Object { $_.Name -notmatch "uninstaller" } |
        Sort-Object Length -Descending |
        Select-Object -First 1

    if (-not $Installer) {
        throw "Build completed without producing a Windows installer."
    }

    Write-Step "Launching ChatGPT MCP Bridge installer"
    Write-Host "Installer: $($Installer.FullName)"
    Start-Process -FilePath $Installer.FullName -Wait

    Write-Step "Done"
    Write-Host "Open 'ChatGPT MCP Bridge' from the Windows Start menu."
    Write-Host ""
    Write-Host "Then add:"
    Write-Host "  Runtime API key: https://platform.openai.com/settings/organization/api-keys"
    Write-Host "  Tunnel IDs:      https://platform.openai.com/settings/organization/tunnels"
    Write-Host "  ChatGPT plugins:  https://chatgpt.com/#settings/Connectors"
}
finally {
    while ((Get-Location).Path.StartsWith($TempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Pop-Location -ErrorAction SilentlyContinue
    }
    if (Test-Path $TempRoot) {
        Remove-Item -Recurse -Force $TempRoot -ErrorAction SilentlyContinue
    }
}
