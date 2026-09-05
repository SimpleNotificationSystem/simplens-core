<#
.SYNOPSIS
    Kubernetes Chaos & Crash Test Script for SimpleNS
    Simulates container failures, pod evictions, and infrastructure disruptions
    against running Kubernetes pods (app-local and simplens-infra).

.PARAMETER Requests
    Number of background test requests to send during each chaos wave (default: 300).

.PARAMETER Wave
    Specific wave to run: 'all', 'app', 'infra', 'pod', 'cascade' (default: 'all').
#>
param(
    [int]$Requests = 300,
    [ValidateSet("all", "app", "infra", "pod", "cascade")]
    [string]$Wave = "all"
)

$ErrorActionPreference = "Continue"
$Namespace = "simplens"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

function Log-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Log-Crash($msg) { Write-Host "[CRASH] $msg" -ForegroundColor Red }
function Log-Recover($msg) { Write-Host "[RECOVER] $msg" -ForegroundColor Green }
function Log-Wave($num, $title) {
    Write-Host "`n================================================================" -ForegroundColor Magenta
    Write-Host "  [WAVE $num] $title" -ForegroundColor Magenta
    Write-Host "================================================================`n" -ForegroundColor Magenta
}

# Start background load using load-test.js
function Start-BackgroundLoad([int]$count) {
    Log-Info "Starting background load ($count requests) against API..."
    $job = Start-Job -ScriptBlock {
        param($root, $n)
        Set-Location $root
        node "$root/scripts/load-test.js" -n $n -c 25 -ch mock -p mock -h docker
    } -ArgumentList $RootDir, $count
    Start-Sleep -Seconds 2
    return $job
}

# 1. Kill a specific container inside app-local pod
function Kill-AppContainer([string]$containerName) {
    Log-Crash "Killing container '$containerName' in pod 'app-local'..."
    kubectl exec -n $Namespace deploy/app-local -c $containerName -- kill 1 2>$null
}

# 2. Kill a specific container inside simplens-infra pod
function Kill-InfraContainer([string]$containerName) {
    Log-Crash "Killing container '$containerName' in pod 'simplens-infra'..."
    if ($containerName -eq "redis") {
        kubectl exec -n $Namespace deploy/simplens-infra -c redis -- redis-cli shutdown nosave 2>$null
    } elseif ($containerName -eq "mongo") {
        kubectl exec -n $Namespace deploy/simplens-infra -c mongo -- mongosh --eval "db.adminCommand({shutdown: 1, force: true})" 2>$null
    } else {
        kubectl exec -n $Namespace deploy/simplens-infra -c $containerName -- kill 1 2>$null
    }
}

# 3. Wait for app pod ready
function Wait-AppReady {
    Log-Info "Waiting for app-local pod to return to Ready state..."
    kubectl wait --namespace $Namespace --for=condition=ready pod -l app.kubernetes.io/name=app-local --timeout=60s 2>$null
}

# 4. Wait for infra pod ready
function Wait-InfraReady {
    Log-Info "Waiting for simplens-infra pod to return to Ready state..."
    kubectl wait --namespace $Namespace --for=condition=ready pod -l app.kubernetes.io/name=simplens-infra --timeout=90s 2>$null
}

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  SimpleNS Kubernetes Native Chaos & Resilience Test" -ForegroundColor Yellow
Write-Host "  Target Cluster: Kind | Namespace: $Namespace" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

# Wave 1: Application Container Failures
if ($Wave -eq "all" -or $Wave -eq "app") {
    Log-Wave "1" "INDIVIDUAL APP CONTAINER CRASHES UNDER LOAD"
    $loadJob = Start-BackgroundLoad $Requests

    Start-Sleep -Seconds 3
    Kill-AppContainer "notification-processor"
    Start-Sleep -Seconds 5

    Kill-AppContainer "worker"
    Start-Sleep -Seconds 5

    Kill-AppContainer "delayed-processor"

    Log-Info "Waiting for containers to self-heal and load to complete..."
    Wait-AppReady
    $loadJob | Wait-Job | Receive-Job
    $loadJob | Remove-Job -Force
}

# Wave 2: Infrastructure Disruptions (Kafka / Redis)
if ($Wave -eq "all" -or $Wave -eq "infra") {
    Log-Wave "2" "INFRASTRUCTURE DISRUPTIONS (Redis & Kafka)"
    $loadJob = Start-BackgroundLoad $Requests

    Start-Sleep -Seconds 3
    Kill-InfraContainer "redis"
    Start-Sleep -Seconds 6

    Kill-InfraContainer "kafka"
    Start-Sleep -Seconds 8

    Wait-InfraReady
    Wait-AppReady
    $loadJob | Wait-Job | Receive-Job
    $loadJob | Remove-Job -Force
}

# Wave 3: Entire Pod Eviction / Hard Kill
if ($Wave -eq "all" -or $Wave -eq "pod") {
    Log-Wave "3" "FULL APP-LOCAL POD EVICTION"
    $loadJob = Start-BackgroundLoad $Requests

    Start-Sleep -Seconds 3
    Log-Crash "Force-deleting the entire 'app-local' pod!"
    kubectl delete pod -n $Namespace -l app.kubernetes.io/name=app-local --now 2>$null

    Log-Info "Kubelet is recreating the pod..."
    Wait-AppReady
    $loadJob | Wait-Job | Receive-Job
    $loadJob | Remove-Job -Force
}

# Wave 4: Cascading Failure
if ($Wave -eq "all" -or $Wave -eq "cascade") {
    Log-Wave "4" "CASCADING CHAOS (Infra + App simultaneous death)"
    $loadJob = Start-BackgroundLoad $Requests

    Start-Sleep -Seconds 3
    Kill-InfraContainer "redis"
    Kill-AppContainer "worker"
    Kill-AppContainer "notification-processor"

    Start-Sleep -Seconds 6
    Log-Crash "Evicting app pod while Redis is recovering..."
    kubectl delete pod -n $Namespace -l app.kubernetes.io/name=app-local --now 2>$null

    Wait-InfraReady
    Wait-AppReady
    $loadJob | Wait-Job | Receive-Job
    $loadJob | Remove-Job -Force
}

Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  [OK] Kubernetes Chaos Test Complete!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "Verify system status:" -ForegroundColor Cyan
Write-Host "  - Pod status:        kubectl get pods -n $Namespace" -ForegroundColor White
Write-Host "  - Recovery Logs:     kubectl logs -n $Namespace deploy/app-local -c recovery" -ForegroundColor White
Write-Host "  - Dashboard Alerts:  http://localhost:3002" -ForegroundColor White
