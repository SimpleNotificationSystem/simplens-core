import path from 'path';
import fs from 'fs/promises';
import { spinner } from './ui.js';
import { writeFile } from './utils.js';
import type { OSType } from './validators.js';

export interface ControlScriptOptions {
    hasInfra?: boolean;
}

/**
 * Builds the Bash control script content for Linux/macOS.
 */
export function buildBashControlScript(options: ControlScriptOptions = {}): string {
    return `#!/usr/bin/env bash
set -e

SHOW_HELP=false
TARGET_INFRA=false
TARGET_APP=false
STOP_MODE=false
REMOVE_VOLUMES=false

for arg in "$@"; do
  case "$arg" in
    --infra)
      TARGET_INFRA=true
      ;;
    --app)
      TARGET_APP=true
      ;;
    --stop)
      STOP_MODE=true
      ;;
    -v|--volumes)
      REMOVE_VOLUMES=true
      ;;
    -h|--help)
      SHOW_HELP=true
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Run with -h or --help for usage."
      exit 1
      ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then
  echo "Usage: ./simplens.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  (no args)       Start both infra and app services"
  echo "  --infra         Operate on infrastructure services only"
  echo "  --app           Operate on application services only"
  echo "  --stop          Stop services instead of starting"
  echo "  -v, --volumes   Remove volumes when stopping (--stop -v)"
  echo "  -h, --help      Show this help message"
  exit 0
fi

# Detect docker compose / docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Error: Neither 'docker compose' nor 'docker-compose' was found." >&2
  exit 1
fi

# Determine targets
if [ "$TARGET_INFRA" = false ] && [ "$TARGET_APP" = false ]; then
  TARGET_INFRA=true
  TARGET_APP=true
fi

HAS_INFRA_FILE=false
if [ -f "docker-compose.infra.yaml" ]; then
  HAS_INFRA_FILE=true
fi

HAS_APP_FILE=false
if [ -f "docker-compose.yaml" ]; then
  HAS_APP_FILE=true
fi

if [ "$STOP_MODE" = true ]; then
  COMPOSE_ACTION="down"
  if [ "$REMOVE_VOLUMES" = true ]; then
    COMPOSE_ACTION="down -v"
  fi

  if [ "$TARGET_APP" = true ] && [ "$HAS_APP_FILE" = true ]; then
    echo "Stopping SimpleNS app services..."
    $COMPOSE_CMD -f docker-compose.yaml $COMPOSE_ACTION
  fi

  if [ "$TARGET_INFRA" = true ] && [ "$HAS_INFRA_FILE" = true ]; then
    echo "Stopping SimpleNS infra services..."
    $COMPOSE_CMD -f docker-compose.infra.yaml $COMPOSE_ACTION
  fi
else
  COMPOSE_ACTION="up -d"

  if [ "$TARGET_INFRA" = true ] && [ "$HAS_INFRA_FILE" = true ]; then
    echo "Starting SimpleNS infra services..."
    $COMPOSE_CMD -f docker-compose.infra.yaml $COMPOSE_ACTION
  elif [ "$TARGET_INFRA" = true ] && [ "$HAS_INFRA_FILE" = false ]; then
    echo "Warning: docker-compose.infra.yaml not found." >&2
  fi

  if [ "$TARGET_APP" = true ] && [ "$HAS_APP_FILE" = true ]; then
    echo "Starting SimpleNS app services..."
    $COMPOSE_CMD -f docker-compose.yaml $COMPOSE_ACTION
  fi
fi
`;
}

/**
 * Builds the PowerShell control script content for Windows.
 * Supports both standard PowerShell parameters (-Infra, -App, -Stop, -v)
 * and CLI-style flags (--infra, --app, --stop, -v).
 */
export function buildPowerShellControlScript(options: ControlScriptOptions = {}): string {
    return `<#
.SYNOPSIS
  SimpleNS Control Script for Windows PowerShell
.DESCRIPTION
  Starts and stops SimpleNS infrastructure and application services.
.EXAMPLE
  .\\simplens.ps1
  .\\simplens.ps1 -Infra
  .\\simplens.ps1 -App
  .\\simplens.ps1 -Stop
  .\\simplens.ps1 -Stop -v
#>
[CmdletBinding()]
param(
    [switch]$Infra,
    [switch]$App,
    [switch]$Stop,
    [Alias("v")][switch]$Volumes,
    [Alias("h")][switch]$Help,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

# Parse any double-dash CLI style arguments passed via RemainingArgs
if ($RemainingArgs) {
    foreach ($arg in $RemainingArgs) {
        switch ($arg) {
            "--infra" { $Infra = $true }
            "--app" { $App = $true }
            "--stop" { $Stop = $true }
            "-v" { $Volumes = $true }
            "--volumes" { $Volumes = $true }
            "-h" { $Help = $true }
            "--help" { $Help = $true }
            default {
                Write-Host "Unknown option: $arg" -ForegroundColor Red
                Write-Host "Run with -h or --help for usage."
                exit 1
            }
        }
    }
}

if ($Help) {
    Write-Host "Usage: .\\simplens.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  (no args)    Start both infra and app services"
    Write-Host "  --infra, -Infra       Operate on infrastructure services only"
    Write-Host "  --app, -App           Operate on application services only"
    Write-Host "  --stop, -Stop         Stop services instead of starting"
    Write-Host "  -v, --volumes         Remove volumes when stopping (--stop -v)"
    Write-Host "  -h, --help            Show this help message"
    exit 0
}

# Resolve Docker Compose command (support docker compose and docker-compose)
$ComposeCmd = $null
try {
    $null = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ComposeCmd = "docker-compose-plugin"
    }
} catch {}

if (-not $ComposeCmd) {
    try {
        $null = docker-compose --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ComposeCmd = "docker-compose-standalone"
        }
    } catch {}
}

if (-not $ComposeCmd) {
    Write-Error "Neither 'docker compose' nor 'docker-compose' was found. Please install Docker Compose."
    exit 1
}

function Invoke-Compose {
    param(
        [string]$File,
        [string[]]$ComposeArgs
    )
    $allArgs = @()
    if ($ComposeCmd -eq "docker-compose-plugin") {
        $allArgs = @("compose")
    }
    if ($File -and (Test-Path $File)) {
        $allArgs += @("-f", $File)
    }
    $allArgs += $ComposeArgs

    if ($ComposeCmd -eq "docker-compose-plugin") {
        & docker $allArgs
    } else {
        & docker-compose $allArgs
    }
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$composeArgs = if ($Stop) {
    if ($Volumes) { @("down", "-v") } else { @("down") }
} else {
    @("up", "-d")
}

$hasInfraFile = Test-Path "docker-compose.infra.yaml"
$hasAppFile = Test-Path "docker-compose.yaml"

# Determine targets
$targetInfra = $false
$targetApp = $false

if ($Infra -and -not $App) {
    $targetInfra = $true
} elseif ($App -and -not $Infra) {
    $targetApp = $true
} else {
    $targetInfra = $true
    $targetApp = $true
}

if ($Stop) {
    # Stop app first, then infra
    if ($targetApp -and $hasAppFile) {
        Write-Host "Stopping SimpleNS app services..." -ForegroundColor Cyan
        Invoke-Compose -File "docker-compose.yaml" -ComposeArgs $composeArgs
    }
    if ($targetInfra -and $hasInfraFile) {
        Write-Host "Stopping SimpleNS infra services..." -ForegroundColor Cyan
        Invoke-Compose -File "docker-compose.infra.yaml" -ComposeArgs $composeArgs
    }
} else {
    # Start infra first, then app
    if ($targetInfra -and $hasInfraFile) {
        Write-Host "Starting SimpleNS infra services..." -ForegroundColor Cyan
        Invoke-Compose -File "docker-compose.infra.yaml" -ComposeArgs $composeArgs
    } elseif ($targetInfra -and -not $hasInfraFile -and $Infra) {
        Write-Warning "docker-compose.infra.yaml not found in current directory."
    }
    if ($targetApp -and $hasAppFile) {
        Write-Host "Starting SimpleNS app services..." -ForegroundColor Cyan
        Invoke-Compose -File "docker-compose.yaml" -ComposeArgs $composeArgs
    }
}
`;
}

/**
 * Generates the OS-appropriate control script in the target directory.
 * On Windows, writes `simplens.ps1`.
 * On Linux/macOS, writes `simplens.sh` with executable permissions (0o755).
 *
 * @returns The filename of the created script (e.g. 'simplens.ps1' or 'simplens.sh').
 */
export async function generateControlScript(
    targetDir: string,
    options: { os: OSType; hasInfra?: boolean }
): Promise<string> {
    const isWindows = options.os === 'windows';
    const filename = isWindows ? 'simplens.ps1' : 'simplens.sh';
    const filePath = path.join(targetDir, filename);

    const s = spinner();
    s.start(`Generating ${filename}...`);

    const content = isWindows
        ? buildPowerShellControlScript(options)
        : buildBashControlScript(options);

    await writeFile(filePath, content);

    if (!isWindows) {
        try {
            await fs.chmod(filePath, 0o755);
        } catch {
            // Ignore chmod errors on systems that don't support POSIX modes
        }
    }

    s.stop(`Generated ${filename}`);
    return filename;
}
