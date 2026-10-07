# publish.ps1 - upload this folder to GitHub Pages in one commit.
#
#   Right-click this file -> "Run with PowerShell"   (or: .\tools\publish.ps1)
#
# It asks for a GitHub token in a hidden prompt (or uses GITHUB_TOKEN for
# this one run); the token is never written anywhere. The first run creates
# the repository and switches GitHub Pages on. Files are only added or
# replaced, never deleted. Test pages (names starting with _) stay local.
param(
  [string]$Name = 'aftermind',
  [string]$Branch = 'main',
  [string]$Message = 'Update the game'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (Get-Command node -ErrorAction SilentlyContinue) { node tools/stamp.mjs }

$auto = [bool]$env:GITHUB_TOKEN
if ($auto) { $token = $env:GITHUB_TOKEN }
else {
  $sec = Read-Host 'Paste your GitHub token (it will not be shown)' -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
$token = $token -replace '[\x00-\x20\x7F]', ''
if ($token.Length -lt 20) { Write-Host "That did not look like a token." -ForegroundColor Yellow; if (-not $auto) { Read-Host 'Press Enter to close' }; exit 1 }
$h = @{ Authorization = "Bearer $token"; 'User-Agent' = 'aftermind-publish'; Accept = 'application/vnd.github+json' }

$me = (Invoke-RestMethod 'https://api.github.com/user' -Headers $h).login
$Repo = "$me/$Name"
$api = "https://api.github.com/repos/$Repo"

# first run: make the repository (with one commit so it has a branch)
$exists = $true
try { Invoke-RestMethod $api -Headers $h | Out-Null } catch { $exists = $false }
if (-not $exists) {
  Write-Host "Creating $Repo ..."
  Invoke-RestMethod 'https://api.github.com/user/repos' -Method Post -Headers $h -ContentType 'application/json' -Body (@{ name = $Name; description = 'AFTERMIND - first-person sci-fi survival horror in a city taken by machines. Co-op for 1-4 players.'; auto_init = $true; private = $false } | ConvertTo-Json) | Out-Null
  Start-Sleep -Seconds 3
}

$ref = Invoke-RestMethod "$api/git/ref/heads/$Branch" -Headers $h
$head = Invoke-RestMethod "$api/git/commits/$($ref.object.sha)" -Headers $h
$remote = @{}
foreach ($e in (Invoke-RestMethod "$api/git/trees/$($head.tree.sha)?recursive=1" -Headers $h).tree) { if ($e.type -eq 'blob') { $remote[$e.path] = $e.sha } }

$sha1 = [Security.Cryptography.SHA1]::Create()
$entries = @()
Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.claude\\|\\\.git\\' -and $_.Name -notlike '_*' } | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
  $bytes = [IO.File]::ReadAllBytes($_.FullName)
  $hdr = [Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)`0")
  $sha = ([BitConverter]::ToString($sha1.ComputeHash($hdr + $bytes)) -replace '-', '').ToLower()
  if ($remote[$rel] -eq $sha) { return }
  Write-Host "  uploading $rel"
  $blob = Invoke-RestMethod "$api/git/blobs" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ content = [Convert]::ToBase64String($bytes); encoding = 'base64' } | ConvertTo-Json)
  $script:entries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha }
}
# GitHub Pages must not run Jekyll over the folder
if (-not $remote.ContainsKey('.nojekyll')) {
  $blob = Invoke-RestMethod "$api/git/blobs" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ content = ''; encoding = 'utf-8' } | ConvertTo-Json)
  $entries += @{ path = '.nojekyll'; mode = '100644'; type = 'blob'; sha = $blob.sha }
}
if ($entries.Count) {
  $tree = Invoke-RestMethod "$api/git/trees" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ base_tree = $head.tree.sha; tree = $entries } | ConvertTo-Json -Depth 5)
  $commit = Invoke-RestMethod "$api/git/commits" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ message = $Message; tree = $tree.sha; parents = @($ref.object.sha) } | ConvertTo-Json)
  Invoke-RestMethod "$api/git/refs/heads/$Branch" -Method Patch -Headers $h -ContentType 'application/json' -Body (@{ sha = $commit.sha } | ConvertTo-Json) | Out-Null
  Write-Host "$($entries.Count) files uploaded."
} else { Write-Host 'Nothing has changed.' }

# switch GitHub Pages on (once)
try { Invoke-RestMethod "$api/pages" -Headers $h | Out-Null }
catch { Invoke-RestMethod "$api/pages" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ source = @{ branch = $Branch; path = '/' } } | ConvertTo-Json) | Out-Null; Write-Host 'GitHub Pages switched on.' }
$token = $null
Write-Host "`nPlay at: https://$($me.ToLower()).github.io/$Name/  (Pages takes a minute or two to update)" -ForegroundColor Green
if (-not $auto) { Read-Host 'Press Enter to close' }
