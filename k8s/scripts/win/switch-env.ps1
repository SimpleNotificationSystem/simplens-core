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

    [switch]$PullLatest
)

$Namespace = "simplens"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Status {
    Write-Host "`n--- Current SimpleNS Pod Status ---" -ForegroundColor Cyan
    kubectl get pods -n $Namespace -o wide
    Write-Host "`n--- App Deployments Replica Counts ---" -ForegroundColor Cyan
    kubectl get deployments -n $Namespace -l "app.kubernetes.io/name in (app-master, app-development, app-local)"
}

function Pull-DevelopmentImages {
    Write-Host "`n[Pull] Pulling latest development images from GHCR..." -ForegroundColor Cyan
    docker pull ghcr.io/simplenotificationsystem/simplens-core:development
    docker pull ghcr.io/simplenotificationsystem/simplens-dashboard:development
    Write-Host "[OK] Latest development images pulled." -ForegroundColor Green
}

function Pull-MasterImages {
    Write-Host "`n[Pull] Pulling latest master images from GHCR..." -ForegroundColor Cyan
    docker pull ghcr.io/simplenotificationsystem/simplens-core:latest
    docker pull ghcr.io/simplenotificationsystem/simplens-dashboard:latest
    Write-Host "[OK] Latest master images pulled." -ForegroundColor Green
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
        }
        Write-Host "[OK] Switched to 'development' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30200" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30202" -ForegroundColor White
    }
    "local" {
        if ($PullLatest) {
            Write-Host "`n[Build] Rebuilding local images..." -ForegroundColor Cyan
            & "$ScriptDir/build-local.ps1"
        }
        Write-Host "Activating 'local' environment (locally built image)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=0
        kubectl scale deployment app-development -n $Namespace --replicas=0
        kubectl scale deployment app-local -n $Namespace --replicas=1
        if ($PullLatest) {
            kubectl rollout restart deployment app-local -n $Namespace
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
