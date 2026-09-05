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
    [switch]$LoadKind,
    [switch]$NoCache
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$K8sDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RootDir = Split-Path -Parent $K8sDir

$BuildFlags = if ($NoCache) { "--no-cache" } else { "" }

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Building Local SimpleNS Docker Images   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Build simplens-core:local
Write-Host "`n[1/2] Building simplens-core:local from root Dockerfile..." -ForegroundColor Yellow
docker build -t simplens-core:local -f "$RootDir/Dockerfile" "$RootDir" $BuildFlags
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build simplens-core:local"
}
Write-Host "[OK] simplens-core:local built successfully!" -ForegroundColor Green

# 2. Build simplens-dashboard:local
Write-Host "`n[2/2] Building simplens-dashboard:local from dashboard/Dockerfile..." -ForegroundColor Yellow
docker build -t simplens-dashboard:local -f "$RootDir/dashboard/Dockerfile" "$RootDir/dashboard" $BuildFlags
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build simplens-dashboard:local"
}
Write-Host "[OK] simplens-dashboard:local built successfully!" -ForegroundColor Green

# 3. Load into Kind if requested or if Kind cluster is detected
$TargetKindCluster = $ClusterName
$ShouldLoadKind = $LoadKind.IsPresent

if (-not $ShouldLoadKind) {
    if (Get-Command kind -ErrorAction SilentlyContinue) {
        $rawClusters = (kind get clusters 2>$null)
        if ($rawClusters) {
            $clusters = ($rawClusters -split "`r?`n") | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() }

            # Check if current kubectl context indicates a kind cluster
            $currentContext = (kubectl config current-context 2>$null)
            if ($currentContext -and $currentContext -like "kind-*") {
                $contextCluster = $currentContext.Substring(5)
                if ($clusters -contains $contextCluster) {
                    $TargetKindCluster = $contextCluster
                    $ShouldLoadKind = $true
                }
            }

            if (-not $ShouldLoadKind) {
                if ($clusters -contains $ClusterName) {
                    $TargetKindCluster = $ClusterName
                    $ShouldLoadKind = $true
                } elseif ($clusters.Count -eq 1) {
                    $TargetKindCluster = $clusters[0]
                    $ShouldLoadKind = $true
                }
            }
        }
    }
}

if ($ShouldLoadKind) {
    Write-Host "`n[Kind] Loading images into Kind cluster '$TargetKindCluster'..." -ForegroundColor Cyan
    kind load docker-image simplens-core:local --name $TargetKindCluster
    kind load docker-image simplens-dashboard:local --name $TargetKindCluster
    Write-Host "[OK] Images loaded into Kind cluster '$TargetKindCluster'!" -ForegroundColor Green
} else {
    Write-Host "`nNote: If using Docker Desktop Kubernetes, local Docker images are shared automatically." -ForegroundColor DarkGray
    Write-Host "If using Kind, pass -LoadKind or run: kind load docker-image simplens-core:local --name $ClusterName" -ForegroundColor DarkGray
}

# 4. Clean up dangling images to avoid duplicate <none>:<none> images in Docker
Write-Host "`nCleaning up dangling Docker images..." -ForegroundColor Cyan
docker image prune -f --filter "dangling=true" 2>$null | Out-Null
Write-Host "[OK] Dangling images cleaned up." -ForegroundColor Green

Write-Host "`nAll images are ready for Kubernetes!" -ForegroundColor Green
