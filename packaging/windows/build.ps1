# Build the Windows TOVA process and installer.
# LM Studio is not bundled. The packaged app listens on 127.0.0.1:8000.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

$env:VITE_TOVA_API_URL = ""
pnpm --filter @tova/web build

if (-not (Test-Path (Join-Path $Root "apps\web\dist\index.html"))) {
  throw "Web build did not produce apps/web/dist/index.html"
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "dist\windows") | Out-Null

uv run --directory apps/api --with pyinstaller pyinstaller `
  --noconfirm `
  --distpath (Join-Path $Root "dist\windows") `
  --workpath (Join-Path $Root "dist\windows\build") `
  (Join-Path $Root "packaging\windows\tova.spec")

$Inno = @(
  "${env:LocalAppData}\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Inno) {
  Write-Host "tova.exe built. Install Inno Setup 6 to compile packaging/windows/tova.iss"
  exit 0
}

& $Inno (Join-Path $Root "packaging\windows\tova.iss")
