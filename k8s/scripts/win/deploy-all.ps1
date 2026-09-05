<#
.SYNOPSIS
    Deploys the complete SimpleNS Kubernetes stack (Infra Pod + App Pods) to the local cluster.

.PARAMETER ActiveEnv
    The initial active app environment to run: 'master', 'development', or 'local' (default: 'local').
#>
param(
    [ValidateSet("master", "development", "local", "all")]
    [string]$ActiveEnv = "local"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$K8sDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RootDir = Split-Path -Parent $K8sDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Deploying SimpleNS Multi-Env Kubernetes  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Namespace
Write-Host "`n[1/7] Applying namespace..." -ForegroundColor Yellow
kubectl apply -f "$K8sDir/base/namespace.yaml"

# 2. ConfigMap
Write-Host "`n[2/7] Applying simplens configuration ConfigMap..." -ForegroundColor Yellow
kubectl apply -f "$K8sDir/base/configmap-simplens.yaml"

# 3. Environment Variables Secret (.env injection)
Write-Host "`n[3/7] Injecting .env file into Kubernetes Secret 'app-env'..." -ForegroundColor Yellow
$EnvPath = "$RootDir/.env"
if (-not (Test-Path $EnvPath)) {
    Write-Warning ".env file not found at '$EnvPath'. Falling back to '.env.example'."
    $EnvPath = "$RootDir/.env.example"
}
# Create or update Secret idempotently using --dry-run
kubectl create secret generic app-env --from-env-file="$EnvPath" --namespace simplens --dry-run=client -o yaml | kubectl apply -f -
Write-Host "[OK] Secret 'app-env' created/updated from $EnvPath" -ForegroundColor Green

# 4. Persistent Volumes
Write-Host "`n[4/7] Applying persistent volume claims..." -ForegroundColor Yellow
kubectl apply -f "$K8sDir/infra/pvc-infra.yaml"

# 5. Infrastructure Pod & Services
Write-Host "`n[5/7] Deploying infrastructure pod (Mongo, Kafka, Redis, Loki, Grafana, Kafka-UI)..." -ForegroundColor Yellow
kubectl apply -f "$K8sDir/infra/pod-infra.yaml"
kubectl apply -f "$K8sDir/infra/services-infra.yaml"

Write-Host "`nWaiting for infrastructure pod to be ready..." -ForegroundColor Cyan
kubectl wait --namespace simplens --for=condition=ready pod -l app.kubernetes.io/name=simplens-infra --timeout=120s

# 6. App Deployments
Write-Host "`n[6/7] Deploying application environments (Master, Development, Local)..." -ForegroundColor Yellow
kubectl apply -f "$K8sDir/apps/app-master.yaml"
kubectl apply -f "$K8sDir/apps/app-development.yaml"
kubectl apply -f "$K8sDir/apps/app-local.yaml"

# 7. Set Active Environment
Write-Host "`n[7/7] Activating '$ActiveEnv' environment..." -ForegroundColor Yellow
& "$ScriptDir/switch-env.ps1" -Env $ActiveEnv

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!                     " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Active App Environment: $ActiveEnv" -ForegroundColor Cyan
Write-Host "`nAccess URLs (on localhost via port-forward):" -ForegroundColor White
Write-Host "  - Active Dashboard:  http://localhost:3002  (or 30302 for Local)" -ForegroundColor White
Write-Host "  - Active API:        http://localhost:3000  (or 30300 for Local)" -ForegroundColor White
Write-Host "  - Kafka UI:          http://localhost:8080" -ForegroundColor White
Write-Host "  - Grafana:           http://localhost:3001  (admin / admin)" -ForegroundColor White
Write-Host "`nStart port-forwarding by running:" -ForegroundColor DarkGray
Write-Host "  ./k8s/scripts/win/port-forward.ps1" -ForegroundColor DarkGray
Write-Host "`nTo switch testing environments, run:" -ForegroundColor DarkGray
Write-Host "  ./k8s/scripts/win/switch-env.ps1 -Env master" -ForegroundColor DarkGray
Write-Host "  ./k8s/scripts/win/switch-env.ps1 -Env development" -ForegroundColor DarkGray
Write-Host "  ./k8s/scripts/win/switch-env.ps1 -Env local" -ForegroundColor DarkGray
