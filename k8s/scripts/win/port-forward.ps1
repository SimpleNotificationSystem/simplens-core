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

# Stop any existing kubectl port-forward processes reliably across PowerShell versions
Get-CimInstance Win32_Process -Filter "Name = 'kubectl.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*port-forward*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

function Test-PortInUse([int]$port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(200, $false)
        if ($success) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

$jobs = @()

# 1. Forward Kafka-UI (8080)
if (-not (Test-PortInUse 8080)) {
    $jobs += Start-Job -ScriptBlock {
        param($ns)
        while ($true) {
            kubectl port-forward -n $ns svc/kafka-ui 8080:8080 2>$null
            Start-Sleep -Milliseconds 800
        }
    } -ArgumentList $Namespace
}

# 2. Forward Grafana (3001 -> 3000)
if (-not (Test-PortInUse 3001)) {
    $jobs += Start-Job -ScriptBlock {
        param($ns)
        while ($true) {
            kubectl port-forward -n $ns svc/grafana 3001:3000 2>$null
            Start-Sleep -Milliseconds 800
        }
    } -ArgumentList $Namespace
}

# Helper function to check if a deployment is running
function Is-Running($deploymentName) {
    $replicas = (kubectl get deployment $deploymentName -n $Namespace -o jsonpath='{.spec.replicas}' 2>$null)
    return ($replicas -and [int]$replicas -gt 0)
}

# 3. Forward Local Environment (Ports 3000/3002 and NodePorts 30300/30302)
if (($Env -eq "all" -or $Env -eq "local") -and (Is-Running "app-local")) {
    $localPorts = @()
    if (-not (Test-PortInUse 3000)) { $localPorts += "3000:3000" }
    if (-not (Test-PortInUse 3002)) { $localPorts += "3002:3002" }
    if (-not (Test-PortInUse 30300)) { $localPorts += "30300:3000" }
    if (-not (Test-PortInUse 30302)) { $localPorts += "30302:3002" }

    if ($localPorts.Count -gt 0) {
        $pStr = $localPorts -join " "
        $jobs += Start-Job -ScriptBlock {
            param($ns, $p)
            while ($true) {
                Invoke-Expression "kubectl port-forward -n $ns svc/app-local $p 2>`$null"
                Start-Sleep -Milliseconds 800
            }
        } -ArgumentList $Namespace, $pStr
    }
    Write-Host "[+] Local App Access (Auto-reconnecting):" -ForegroundColor Green
    Write-Host "    - Dashboard: http://localhost:3002  (NodePort: http://localhost:30302)" -ForegroundColor White
    Write-Host "    - API:       http://localhost:3000  (NodePort: http://localhost:30300)" -ForegroundColor White
}

# 4. Forward Master Environment (Ports 30100/30102)
if (($Env -eq "all" -or $Env -eq "master") -and (Is-Running "app-master")) {
    $masterPorts = @()
    if (-not (Test-PortInUse 30100)) { $masterPorts += "30100:3000" }
    if (-not (Test-PortInUse 30102)) { $masterPorts += "30102:3002" }

    if ($masterPorts.Count -gt 0) {
        $pStr = $masterPorts -join " "
        $jobs += Start-Job -ScriptBlock {
            param($ns, $p)
            while ($true) {
                Invoke-Expression "kubectl port-forward -n $ns svc/app-master $p 2>`$null"
                Start-Sleep -Milliseconds 800
            }
        } -ArgumentList $Namespace, $pStr
    }
    Write-Host "[+] Master (Prod) App Access (Auto-reconnecting):" -ForegroundColor Green
    Write-Host "    - Dashboard: http://localhost:30102" -ForegroundColor White
    Write-Host "    - API:       http://localhost:30100" -ForegroundColor White
}

# 5. Forward Development Branch Environment (Ports 30200/30202)
if (($Env -eq "all" -or $Env -eq "development") -and (Is-Running "app-development")) {
    $devPorts = @()
    if (-not (Test-PortInUse 30200)) { $devPorts += "30200:3000" }
    if (-not (Test-PortInUse 30202)) { $devPorts += "30202:3002" }

    if ($devPorts.Count -gt 0) {
        $pStr = $devPorts -join " "
        $jobs += Start-Job -ScriptBlock {
            param($ns, $p)
            while ($true) {
                Invoke-Expression "kubectl port-forward -n $ns svc/app-development $p 2>`$null"
                Start-Sleep -Milliseconds 800
            }
        } -ArgumentList $Namespace, $pStr
    }
    Write-Host "[+] Development Branch App Access (Auto-reconnecting):" -ForegroundColor Green
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
