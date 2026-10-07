# shot_page.ps1 - photograph any page of this project in a real (headless) Chrome.
#
# Rules learned the hard way on the earlier games: an ABSOLUTE --screenshot
# path, a FRESH --user-data-dir (or Chrome hands off to the desktop browser
# and caches yesterday's modules), and enough virtual time for the module
# graph and fonts to land.
#
#   tools\shot_page.ps1 -Url "/?shot=zoo" -Out <dir> -Name zoo
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Out = $env:TEMP,
  [string]$Name = 'page',
  [int]$W = 1280,
  [int]$H = 720,
  [int]$Budget = 16000
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { throw "no Chrome at $chrome" }

$live = $false
try { Invoke-WebRequest -Uri "http://127.0.0.1:8745/" -UseBasicParsing -TimeoutSec 3 | Out-Null; $live = $true } catch { }
$srv = $null
if (-not $live) {
  $srv = Start-Process -FilePath 'python' -ArgumentList '-m', 'http.server', '8745' -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
}

$ud = Join-Path $env:TEMP ("am_cud_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
try {
  $png = Join-Path (Resolve-Path $Out) "$Name.png"
  if (Test-Path $png) { Remove-Item $png -Force }
  $a = @('--headless=new', "--user-data-dir=$ud", '--no-first-run', '--incognito',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    "--virtual-time-budget=$Budget", "--window-size=$W,$H",
    "--screenshot=$png", "http://127.0.0.1:8745$Url")
  $p = Start-Process -FilePath $chrome -ArgumentList $a -NoNewWindow -Wait -PassThru
  if (Test-Path $png) { "$png  $([int]((Get-Item $png).Length/1024))KB" }
  else { "NO IMAGE (chrome exit $($p.ExitCode))" }
} finally {
  if ($srv) { try { Stop-Process -Id $srv.Id -Force -ErrorAction Stop } catch { } }
  if (Test-Path $ud) { try { Remove-Item $ud -Recurse -Force -ErrorAction Stop } catch { } }
}
