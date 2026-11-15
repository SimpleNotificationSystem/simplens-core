param (
    [string]$Container = "all",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# 1. Dependency change safety check
$gitDiff = git status --porcelain package.json package-lock.json 2>$null
if ($gitDiff) {
    Write-Warning "Dependency files (package.json / package-lock.json) have been modified!"
    Write-Warning "Do NOT use hot-copy when dependencies have changed. An image rebuild is required:"
    Write-Warning "podman build --build-arg PORT=3000 --build-arg NODE_ENV=development -t simplens-core:local ."
    $confirmation = Read-Host "Are you sure you want to proceed without rebuilding the image? (y/N)"
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Host "Aborted."
        exit 1
    }
}

# 2. Build local TypeScript project
if (-not $SkipBuild) {
    Write-Host "[1/3] Compiling TypeScript (npm run build)..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. Aborting container update."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "[1/3] Skipping build step (-SkipBuild requested)..." -ForegroundColor Yellow
}

if (-not (Test-Path -Path "dist")) {
    Write-Error "The dist/ directory does not exist. Please run 'npm run build' first."
    exit 1
}

# 3. Identify target containers
Write-Host "[2/3] Resolving target Podman containers..." -ForegroundColor Cyan

$runningCoreContainers = @(podman ps --filter "ancestor=simplens-core:local" --format "{{.Names}}" 2>$null)

if ($runningCoreContainers.Count -eq 0) {
    # Fallback to name pattern if image tag differs
    $runningCoreContainers = @(podman ps --filter "name=simplens-.*-local" --format "{{.Names}}" 2>$null | Where-Object { $_ -ne "simplens-dashboard-local" })
}

if ($runningCoreContainers.Count -eq 0) {
    Write-Error "No running SimpleNS core containers found. Make sure your local compose environment is running (e.g. podman-compose -f docker-compose/docker-compose.local.yaml up -d)."
    exit 1
}

$targets = @()
if ($Container -eq "all" -or [string]::IsNullOrWhiteSpace($Container)) {
    $targets = $runningCoreContainers
} else {
    # Check if user specified short name (e.g. 'api') or full container name ('simplens-api-local')
    foreach ($c in $runningCoreContainers) {
        if ($c -eq $Container -or $c -like "*$Container*") {
            $targets += $c
        }
    }
    if ($targets.Count -eq 0) {
        Write-Error "Specified container '$Container' not found among running core containers: $($runningCoreContainers -join ', ')"
        exit 1
    }
}

# 4. Copy dist/ and restart target containers
Write-Host "[3/3] Copying compiled code and restarting containers..." -ForegroundColor Cyan

foreach ($target in $targets) {
    Write-Host "-> Updating $target..." -ForegroundColor Green
    
    # Copy dist into /app/dist/
    podman cp dist/. "${target}:/app/dist/"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to copy dist/ to $target"
        continue
    }

    # Restart container
    podman restart $target | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Successfully restarted $target" -ForegroundColor Green
    } else {
        Write-Warning "   Failed to restart $target"
    }
}

Write-Host "`nAll target containers updated successfully!" -ForegroundColor Cyan
