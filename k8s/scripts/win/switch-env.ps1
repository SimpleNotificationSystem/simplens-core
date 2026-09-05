<#
.SYNOPSIS
    Switches the active SimpleNS application environment (Master, Development, Local, or All).
    Ensures that multiple environments do not contend on shared Kafka consumer groups.

.PARAMETER Env
    The environment to activate: 'master', 'development', 'local', 'all', or 'status'.
#>
param(
    [ValidateSet("master", "development", "local", "all", "status")]
    [string]$Env = "status"
)

$Namespace = "simplens"

function Show-Status {
    Write-Host "`n--- Current SimpleNS Pod Status ---" -ForegroundColor Cyan
    kubectl get pods -n $Namespace -o wide
    Write-Host "`n--- App Deployments Replica Counts ---" -ForegroundColor Cyan
    kubectl get deployments -n $Namespace -l "app.kubernetes.io/name in (app-master, app-development, app-local)"
}

switch ($Env) {
    "master" {
        Write-Host "Activating 'master' environment (GHCR master branch)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=1
        kubectl scale deployment app-development -n $Namespace --replicas=0
        kubectl scale deployment app-local -n $Namespace --replicas=0
        Write-Host "[OK] Switched to 'master' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30100" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30102" -ForegroundColor White
    }
    "development" {
        Write-Host "Activating 'development' environment (GHCR dev branch)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=0
        kubectl scale deployment app-development -n $Namespace --replicas=1
        kubectl scale deployment app-local -n $Namespace --replicas=0
        Write-Host "[OK] Switched to 'development' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30200" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30202" -ForegroundColor White
    }
    "local" {
        Write-Host "Activating 'local' environment (locally built image)..." -ForegroundColor Yellow
        kubectl scale deployment app-master -n $Namespace --replicas=0
        kubectl scale deployment app-development -n $Namespace --replicas=0
        kubectl scale deployment app-local -n $Namespace --replicas=1
        Write-Host "[OK] Switched to 'local' environment!" -ForegroundColor Green
        Write-Host "  API:       http://localhost:30300" -ForegroundColor White
        Write-Host "  Dashboard: http://localhost:30302" -ForegroundColor White
    }
    "all" {
        Write-Host "Scaling all environments to 1 replica..." -ForegroundColor Yellow
        Write-Warning "Notice: All 3 app environments share the same Kafka broker. Because consumer group IDs are shared, consumers will balance partitions across environments."
        kubectl scale deployment app-master -n $Namespace --replicas=1
        kubectl scale deployment app-development -n $Namespace --replicas=1
        kubectl scale deployment app-local -n $Namespace --replicas=1
        Write-Host "[OK] All environments scaled to 1!" -ForegroundColor Green
    }
    "status" {
        Show-Status
        return
    }
}

Show-Status
