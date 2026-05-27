# ─── Lamu Production Build Script ────────────────────────────────────────────
# Usage: .\build-prod.ps1 -ApiUrl https://api.lamuka.com
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiUrl
)

Write-Host "Building Lamu for production..." -ForegroundColor Cyan
Write-Host "  API URL: $ApiUrl" -ForegroundColor Yellow

$env:LAMU_API_URL = $ApiUrl

$updaterConfig = @{
    plugins = @{
        updater = @{
            endpoints = @("$ApiUrl/api/update")
        }
    }
} | ConvertTo-Json -Compress -Depth 5

Write-Host "  Updater endpoint: $ApiUrl/api/update" -ForegroundColor Yellow

npm run tauri build -- --config $updaterConfig

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild successful!" -ForegroundColor Green
    Write-Host "Installer: src-tauri/target/release/bundle/" -ForegroundColor Green
} else {
    Write-Host "`nBuild failed." -ForegroundColor Red
    exit 1
}
