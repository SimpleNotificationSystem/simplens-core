<#
.SYNOPSIS
    Builds the local SimpleNS Core and Dashboard Docker images and loads them into Kind (if using Kind).

.PARAMETER ClusterName
    The name of the Kind cluster (default: "simplens").

.PARAMETER LoadKind
    Switch to load the built images into Kind using 'kind load docker-image'.
#>
param(
    [string]$ClusterName = "simplens",
    [switch]$LoadKind
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Building Local SimpleNS Docker Images   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Build simplens-core:local
Write-Host "`n[1/2] Building simplens-core:local from root Dockerfile..." -ForegroundColor Yellow
docker build -t simplens-core:local -f "$RootDir/Dockerfile" "$RootDir"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build simplens-core:local"
}
Write-Host "[OK] simplens-core:local built successfully!" -ForegroundColor Green

# 2. Build simplens-dashboard:local
Write-Host "`n[2/2] Building simplens-dashboard:local from dashboard/Dockerfile..." -ForegroundColor Yellow
docker build -t simplens-dashboard:local -f "$RootDir/dashboard/Dockerfile" "$RootDir/dashboard"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build simplens-dashboard:local"
}
Write-Host "[OK] simplens-dashboard:local built successfully!" -ForegroundColor Green

# 3. Load into Kind if requested or if Kind cluster is detected
$ShouldLoadKind = $LoadKind.IsPresent
if (-not $ShouldLoadKind) {
    if (Get-Command kind -ErrorAction SilentlyContinue) {
        $clusters = kind get clusters 2>$null
        if ($clusters -contains $ClusterName) {
            $ShouldLoadKind = $true
        }
    }
}

if ($ShouldLoadKind) {
    Write-Host "`n[Kind] Loading images into Kind cluster '$ClusterName'..." -ForegroundColor Cyan
    kind load docker-image simplens-core:local --name $ClusterName
    kind load docker-image simplens-dashboard:local --name $ClusterName
    Write-Host "[OK] Images loaded into Kind cluster!" -ForegroundColor Green
} else {
    Write-Host "`nNote: If using Docker Desktop Kubernetes, local Docker images are shared automatically." -ForegroundColor DarkGray
    Write-Host "If using Kind, pass -LoadKind or run: kind load docker-image simplens-core:local --name $ClusterName" -ForegroundColor DarkGray
}

Write-Host "`nAll images are ready for Kubernetes!" -ForegroundColor Green
