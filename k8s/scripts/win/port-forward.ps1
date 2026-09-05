<#
.SYNOPSIS
    Tunnels ports from the Kubernetes cluster to your Windows host machine (localhost).
    Supports forwarding for a specific environment OR all active environments simultaneously.

.PARAMETER Env
    The app environment to forward: 'all', 'local', 'master', or 'development' (default: 'all').
#>
param(
    [ValidateSet("all", "local", "master", "development")]
    [string]$Env = "all"
)

$Namespace = "simplens"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  SimpleNS Multi-Env Port Forwarding       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Stop any existing kubectl port-forward processes
Get-Process kubectl -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*port-forward*" } | Stop-Process -Force -ErrorAction SilentlyContinue

$jobs = @()

# 1. Forward Kafka-UI (8080)
$jobs += Start-Job -ScriptBlock {
    param($ns)
    kubectl port-forward -n $ns svc/kafka-ui 8080:8080
} -ArgumentList $Namespace

# 2. Forward Grafana (3001 -> 3000)
$jobs += Start-Job -ScriptBlock {
    param($ns)
    kubectl port-forward -n $ns svc/grafana 3001:3000
} -ArgumentList $Namespace

# Helper function to check if a deployment is running
function Is-Running($deploymentName) {
    $replicas = (kubectl get deployment $deploymentName -n $Namespace -o jsonpath='{.spec.replicas}' 2>$null)
    return ($replicas -and [int]$replicas -gt 0)
}

# 3. Forward Local Environment (Ports 30300/30302 and default 3000/3002)
if (($Env -eq "all" -or $Env -eq "local") -and (Is-Running "app-local")) {
    $jobs += Start-Job -ScriptBlock {
        param($ns)
        kubectl port-forward -n $ns svc/app-local 30300:3000 30302:3002 3000:3000 3002:3002
    } -ArgumentList $Namespace
    Write-Host "[+] Forwarding Local App:" -ForegroundColor Green
    Write-Host "    - Dashboard: http://localhost:30302  (also on http://localhost:3002)" -ForegroundColor White
    Write-Host "    - API:       http://localhost:30300  (also on http://localhost:3000)" -ForegroundColor White
}

# 4. Forward Master Environment (Ports 30100/30102)
if (($Env -eq "all" -or $Env -eq "master") -and (Is-Running "app-master")) {
    $jobs += Start-Job -ScriptBlock {
        param($ns)
        kubectl port-forward -n $ns svc/app-master 30100:3000 30102:3002
    } -ArgumentList $Namespace
    Write-Host "[+] Forwarding Master (Prod) App:" -ForegroundColor Green
    Write-Host "    - Dashboard: http://localhost:30102" -ForegroundColor White
    Write-Host "    - API:       http://localhost:30100" -ForegroundColor White
}

# 5. Forward Development Branch Environment (Ports 30200/30202)
if (($Env -eq "all" -or $Env -eq "development") -and (Is-Running "app-development")) {
    $jobs += Start-Job -ScriptBlock {
        param($ns)
        kubectl port-forward -n $ns svc/app-development 30200:3000 30202:3002
    } -ArgumentList $Namespace
    Write-Host "[+] Forwarding Development Branch App:" -ForegroundColor Green
    Write-Host "    - Dashboard: http://localhost:30202" -ForegroundColor White
    Write-Host "    - API:       http://localhost:30200" -ForegroundColor White
}

Start-Sleep -Seconds 2

Write-Host "`n[+] Infrastructure Services:" -ForegroundColor Green
Write-Host "    - Kafka UI:  http://localhost:8080" -ForegroundColor White
Write-Host "    - Grafana:   http://localhost:3001  (admin / admin)" -ForegroundColor White

Write-Host "`n[OK] Port forwarding is active! Press Ctrl+C to close all tunnels.`n" -ForegroundColor Cyan

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nClosing port tunnels..." -ForegroundColor Yellow
    $jobs | Stop-Job -ErrorAction SilentlyContinue
    $jobs | Remove-Job -ErrorAction SilentlyContinue
    Write-Host "[OK] Tunnels closed." -ForegroundColor Green
}
