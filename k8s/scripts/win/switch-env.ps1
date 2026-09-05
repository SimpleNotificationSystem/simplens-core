<#
.SYNOPSIS
    Switches the active SimpleNS application environment (Master, Development, Local, or All).
    Ensures that multiple environments do not contend on shared Kafka consumer groups.

.PARAMETER Env
    The environment to activate: 'master', 'development', 'local', 'all', or 'status'.

.PARAMETER PullLatest
    If specified, pulls the latest images from GHCR (for master/development) or rebuilds local images (for local) before running.
#>
param(
    [ValidateSet("master", "development", "local", "all", "status")]
    [string]$Env = "status",

    [switch]$PullLatest,
    [switch]$NoCache
)

$Namespace = "simplens"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Status {
    Write-Host "`n--- Current SimpleNS Pod Status ---" -ForegroundColor Cyan
    kubectl get pods -n $Namespace -o wide
    Write-Host "`n--- App Deployments Replica Counts ---" -ForegroundColor Cyan
    kubectl get deployments -n $Namespace -l "app.kubernetes.io/name in (app-master, app-development, app-local)"
}

function Sync-ToKind {
    param([string[]]$Images)
    if (Get-Command kind -ErrorAction SilentlyContinue) {
        $rawClusters = (kind get clusters 2>$null)
        if ($rawClusters) {
            $clusters = ($rawClusters -split "`r?`n") | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() }
            $targetCluster = $null
            $currentContext = (kubectl config current-context 2>$null)
            if ($currentContext -and $currentContext -like "kind-*") {
                $contextCluster = $currentContext.Substring(5)
                if ($clusters -contains $contextCluster) {
                    $targetCluster = $contextCluster
                }
            }
            if (-not $targetCluster) {
                if ($clusters -contains "simplens") {
                    $targetCluster = "simplens"
                } elseif ($clusters.Count -eq 1) {
                    $targetCluster = $clusters[0]
                }
            }
            if ($targetCluster) {
                foreach ($img in $Images) {
                    Write-Host "[Kind] Loading image '$img' into cluster '$targetCluster'..." -ForegroundColor Cyan
                    kind load docker-image $img --name $targetCluster
                }
            }
        }
    }
}

function Pull-DevelopmentImages {
    Write-Host "`n[Pull] Pulling latest development images from GHCR..." -ForegroundColor Cyan
    docker pull ghcr.io/simplenotificationsystem/simplens-core:development
    docker pull ghcr.io/simplenotificationsystem/simplens-dashboard:development
    Write-Host "[OK] Latest development images pulled." -ForegroundColor Green
    Sync-ToKind @("ghcr.io/simplenotificationsystem/simplens-core:development", "ghcr.io/simplenotificationsystem/simplens-dashboard:development")
}

function Pull-MasterImages {
    Write-Host "`n[Pull] Pulling latest master images from GHCR..." -ForegroundColor Cyan
    docker pull ghcr.io/simplenotificationsystem/simplens-core:latest
    docker pull ghcr.io/simplenotificationsystem/simplens-dashboard:latest
    Write-Host "[OK] Latest master images pulled." -ForegroundColor Green
    Sync-ToKind @("ghcr.io/simplenotificationsystem/simplens-core:latest", "ghcr.io/simplenotificationsystem/simplens-dashboard:latest")
}

switch ($Env) {
    "master" {
        if ($PullLatest) {
            Pull-MasterImages
        }
        Write-Host "Activating 'master' environment (GHCR master branch)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=1
        kubectl scale deployment app-development -n $Namespace --replicas=0
        kubectl scale deployment app-local -n $Namespace --replicas=0
        if ($PullLatest) {
            kubectl rollout restart deployment app-master -n $Namespace
            Write-Host "Waiting for app-master rollout to complete..." -ForegroundColor Cyan
            kubectl rollout status deployment app-master -n $Namespace --timeout=120s
        }
        Write-Host "[OK] Switched to 'master' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30100" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30102" -ForegroundColor White
    }
    "development" {
        if ($PullLatest) {
            Pull-DevelopmentImages
        }
        Write-Host "Activating 'development' environment (GHCR dev branch)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=0
        kubectl scale deployment app-development -n $Namespace --replicas=1
        kubectl scale deployment app-local -n $Namespace --replicas=0
        if ($PullLatest) {
            kubectl rollout restart deployment app-development -n $Namespace
            Write-Host "Waiting for app-development rollout to complete..." -ForegroundColor Cyan
            kubectl rollout status deployment app-development -n $Namespace --timeout=120s
        }
        Write-Host "[OK] Switched to 'development' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30200" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30202" -ForegroundColor White
    }
    "local" {
        if ($PullLatest) {
            Write-Host "`n[Build] Rebuilding local images..." -ForegroundColor Cyan
            $buildArgs = @()
            if ($NoCache) { $buildArgs += "-NoCache" }
            & "$ScriptDir/build-local.ps1" @buildArgs
        }
        Write-Host "Activating 'local' environment (locally built image)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=0
        kubectl scale deployment app-development -n $Namespace --replicas=0
        kubectl scale deployment app-local -n $Namespace --replicas=1
        if ($PullLatest) {
            Write-Host "Restarting deployment app-local..." -ForegroundColor Cyan
            kubectl rollout restart deployment app-local -n $Namespace
            Write-Host "Waiting for app-local rollout to complete..." -ForegroundColor Cyan
            kubectl rollout status deployment app-local -n $Namespace --timeout=120s
        }
        Write-Host "[OK] Switched to 'local' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30300" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30302" -ForegroundColor White
    }
    "all" {
        if ($PullLatest) {
            Pull-MasterImages
            Pull-DevelopmentImages
        }
        Write-Host "Scaling all environments to 1 replica..." -ForegroundColor Yellow
        Write-Warning "Notice: All 3 app environments share the same Kafka broker. Because consumer group IDs are shared, consumers will balance partitions across environments."
        kubectl scale deployment app-master -n $Namespace --replicas=1
        kubectl scale deployment app-development -n $Namespace --replicas=1
        kubectl scale deployment app-local -n $Namespace --replicas=1
        if ($PullLatest) {
            kubectl rollout restart deployment app-master -n $Namespace
            kubectl rollout restart deployment app-development -n $Namespace
        }
        Write-Host "[OK] All environments scaled to 1!" -ForegroundColor Green
    }
    "status" {
        Show-Status
        return
    }
}

Show-Status
