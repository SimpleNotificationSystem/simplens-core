<#
.SYNOPSIS
    Switches between SimpleNS Docker Compose environments (local, dev, master).
    Ensures shared infrastructure is running while preventing container/port collisions.

.PARAMETER Env
    Environment to run: 'local', 'dev', 'master', 'status', 'down', 'infra-only', 'infra-down'.
    Default: 'status'

.PARAMETER Rebuild
    (Local only) Rebuilds the local Docker images from source code before starting.

.PARAMETER NoCache
    (Local only) Rebuilds local Docker images without using Docker cache.

.PARAMETER PullLatest
    (Dev/Master only) Pulls the latest images from GHCR before starting.
#>

param(
    [ValidateSet("local", "dev", "master", "status", "down", "infra-only", "infra-down")]
    [string]$Env = "status",

    [switch]$Rebuild,
    [switch]$NoCache,
    [switch]$PullLatest
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeDir = Split-Path -Parent $ScriptDir
$ProjectRoot = Split-Path -Parent $ComposeDir

$InfraCompose = Join-Path $ComposeDir "docker-compose.infra.yaml"
$LocalCompose = Join-Path $ComposeDir "docker-compose.local.yaml"
$DevCompose = Join-Path $ComposeDir "docker-compose.dev.yaml"
$MasterCompose = Join-Path $ComposeDir "docker-compose.master.yaml"

$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    $EnvFile = Join-Path $ProjectRoot ".env.example"
}

function Ensure-Network {
    $networkExists = docker network ls --filter "name=^simplens-infra$" --format "{{.Name}}"
    if (-not $networkExists) {
        Write-Host "[Network] Creating 'simplens-infra' bridge network..." -ForegroundColor Cyan
        docker network create simplens-infra | Out-Null
    }
}

function Ensure-InfraImages {
    Write-Host "[Infra] Verifying infrastructure Docker images..." -ForegroundColor Cyan
    $images = @()
    try {
        $rawImages = docker compose -p infra --env-file $EnvFile -f $InfraCompose config --images 2>$null
        if ($rawImages) {
            $images = ($rawImages -split "`r?`n") | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() }
        }
    } catch {}

    if (-not $images -or $images.Count -eq 0) {
        $images = @(
            "mongo:7.0",
            "apache/kafka-native",
            "kafbat/kafka-ui:main",
            "redis:7-alpine",
            "grafana/loki:2.9.0",
            "grafana/grafana:10.2.0"
        )
    }

    $missingImages = @()
    foreach ($img in $images) {
        $found = docker images -q $img 2>$null
        if (-not $found) {
            $missingImages += $img
        }
    }

    if ($missingImages.Count -gt 0) {
        Write-Host "[Infra] Found $($missingImages.Count) missing infrastructure image(s). Pulling..." -ForegroundColor Yellow
        foreach ($img in $missingImages) {
            Write-Host "[Pull] Pulling '$img'..." -ForegroundColor Cyan
            docker pull $img
        }
        Write-Host "[Infra] All required infrastructure images are downloaded." -ForegroundColor Green
    } else {
        Write-Host "[Infra] All infrastructure images are present locally." -ForegroundColor Green
    }
}

function Start-Infra {
    Ensure-Network
    Ensure-InfraImages
    Write-Host "`n[Infra] Starting shared infrastructure services..." -ForegroundColor Cyan
    docker compose -p infra --env-file $EnvFile -f $InfraCompose up -d
    Write-Host "[Infra] Infrastructure services are up and healthy." -ForegroundColor Green
}

function Stop-AppEnvironments {
    param([string]$Except = "")

    if ($Except -ne "local") {
        $localRunning = docker ps --filter "label=simplens.environment=local" --format "{{.ID}}"
        if ($localRunning) {
            Write-Host "[Stop] Stopping 'local' environment..." -ForegroundColor Yellow
            docker compose -p simplens-local --env-file $EnvFile -f $LocalCompose down
        }
    }
    if ($Except -ne "dev") {
        $devRunning = docker ps --filter "label=simplens.environment=dev" --format "{{.ID}}"
        if ($devRunning) {
            Write-Host "[Stop] Stopping 'dev' environment..." -ForegroundColor Yellow
            docker compose -p simplens-dev --env-file $EnvFile -f $DevCompose down
        }
    }
    if ($Except -ne "master") {
        $masterRunning = docker ps --filter "label=simplens.environment=master" --format "{{.ID}}"
        if ($masterRunning) {
            Write-Host "[Stop] Stopping 'master' environment..." -ForegroundColor Yellow
            docker compose -p simplens-master --env-file $EnvFile -f $MasterCompose down
        }
    }
}

function Show-Status {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host "             SimpleNS Container Status                      " -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    
    Write-Host "`n--- Infrastructure Containers (shared: infra) ---" -ForegroundColor Yellow
    docker ps --filter "network=simplens-infra" --filter "name=simplens-infra" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    Write-Host "`n--- Active Application Containers ---" -ForegroundColor Yellow
    docker ps --filter "network=simplens-infra" --filter "label=simplens.environment" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    Write-Host "`n--- Service URLs ---" -ForegroundColor Green
    Write-Host "  API Server:      http://localhost:3000/api/health" -ForegroundColor White
    Write-Host "  Dashboard:       http://localhost:3002" -ForegroundColor White
    Write-Host "  Kafka UI:        http://localhost:8081" -ForegroundColor White
    Write-Host "  Grafana:         http://localhost:3001  (User: admin / Pass: admin)" -ForegroundColor White
    Write-Host "============================================================`n" -ForegroundColor Cyan
}

switch ($Env) {
    "local" {
        Start-Infra
        Stop-AppEnvironments -Except "local"
        
        if ($Rebuild -or $NoCache) {
            Write-Host "`n[Build] Building local Docker images from source..." -ForegroundColor Cyan
            $buildArgs = @("compose", "-p", "simplens-local", "--env-file", $EnvFile, "-f", $LocalCompose, "build")
            if ($NoCache) { $buildArgs += "--no-cache" }
            docker @buildArgs
        }

        Write-Host "`n[Start] Starting 'local' environment..." -ForegroundColor Cyan
        docker compose -p simplens-local --env-file $EnvFile -f $LocalCompose up -d
        Write-Host "[OK] 'Local' environment is running!" -ForegroundColor Green
        Show-Status
    }

    "dev" {
        Start-Infra
        Stop-AppEnvironments -Except "dev"

        if ($PullLatest) {
            Write-Host "`n[Pull] Pulling latest development images from GHCR..." -ForegroundColor Cyan
            docker compose -p simplens-dev --env-file $EnvFile -f $DevCompose pull
        }

        Write-Host "`n[Start] Starting 'dev' environment (GHCR development branch)..." -ForegroundColor Cyan
        docker compose -p simplens-dev --env-file $EnvFile -f $DevCompose up -d
        Write-Host "[OK] 'Dev' environment is running!" -ForegroundColor Green
        Show-Status
    }

    "master" {
        Start-Infra
        Stop-AppEnvironments -Except "master"

        if ($PullLatest) {
            Write-Host "`n[Pull] Pulling latest master images from GHCR..." -ForegroundColor Cyan
            docker compose -p simplens-master --env-file $EnvFile -f $MasterCompose pull
        }

        Write-Host "`n[Start] Starting 'master' environment (GHCR latest release)..." -ForegroundColor Cyan
        docker compose -p simplens-master --env-file $EnvFile -f $MasterCompose up -d
        Write-Host "[OK] 'Master' environment is running!" -ForegroundColor Green
        Show-Status
    }

    "status" {
        Show-Status
    }

    "down" {
        Write-Host "`n[Down] Stopping all active application environments..." -ForegroundColor Yellow
        Stop-AppEnvironments
        Write-Host "[OK] All application containers stopped. Infrastructure remains active." -ForegroundColor Green
    }

    "infra-only" {
        Stop-AppEnvironments
        Start-Infra
        Write-Host "[OK] Infrastructure services are running." -ForegroundColor Green
    }

    "infra-down" {
        Write-Host "`n[Infra-Down] Stopping all applications and shared infrastructure..." -ForegroundColor Yellow
        Stop-AppEnvironments
        docker compose -p infra --env-file $EnvFile -f $InfraCompose down
        Write-Host "[OK] All SimpleNS containers stopped." -ForegroundColor Green
    }
}
