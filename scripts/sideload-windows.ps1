<#
.SYNOPSIS
    Sideloads the Tasaciones Excel add-in into Excel Desktop on Windows via a
    Trusted Add-in Catalog. Mirrors what "File > Options > Trust Center >
    Trusted Add-in Catalogs" does in the Excel UI, but is idempotent and
    scriptable from a single command.

.DESCRIPTION
    Microsoft Excel Desktop on Windows does NOT expose an "Upload My Add-in"
    button (only Office on the web does). The officially documented way to
    sideload an add-in only manifest on Windows desktop is to register a folder
    as a Trusted Add-in Catalog in the Windows registry:

        HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{<GUID>}

    and drop the manifest XML in that folder. The catalog then shows up in
    "Home > Add-ins > More Add-ins > SHARED FOLDER" inside Excel.

    Reference:
        https://learn.microsoft.com/en-us/office/dev/add-ins/testing/
        create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins
        (last updated 2026-06-09, verified 2026-07-16)

    This script is idempotent. It writes a small marker file (.sideload.json)
    inside the catalog folder so re-running it reuses the same GUID and does
    not create duplicate catalog entries.

    No admin rights required: HKCU is per-user.

.PARAMETER ManifestPath
    Path to the manifest XML to sideload. Defaults to <repo>\manifest.prod.xml
    which points at https://complemento-excel.vercel.app/ — no local dev server
    needed. Override to .\manifest.xml if you want to test against a local
    `npm run dev` server.

.PARAMETER CatalogPath
    Local folder to use as the Trusted Catalog. Defaults to
    <user>\Documents\TasacionesManifest\. The folder is created if it does not
    exist. The folder is shared with Excel via the \\localhost\C$\... admin
    share (no manual sharing needed).

.PARAMETER Uninstall
    Removes the registry entry and the catalog folder.

.PARAMETER PassThru
    After applying the change, prints the registry path, catalog UNC, and a
    short how-to-verify snippet.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1

    # Sideload manifest.prod.xml (production bundle on Vercel) into a local
    # trusted catalog for the current user.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -ManifestPath .\manifest.xml

    # Sideload the dev manifest (points to https://localhost:3000). Make sure
    # `npm run dev` is running before opening Excel.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\sideload-windows.ps1 -Uninstall

    # Remove the registry entry and the catalog folder.

.NOTES
    Tested on Windows 11 + Microsoft 365 Excel (16.0.x), July 2026.
#>

[CmdletBinding()]
param(
    [string]$ManifestPath,
    [string]$CatalogPath,
    [switch]$Uninstall,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

if ($env:OS -ne 'Windows_NT') {
    throw "This script targets Excel Desktop on Windows. Detected OS='$($env:OS)'; aborting."
}

$RepoRoot = (Resolve-Path -Path "$PSScriptRoot\..").Path

if (-not $ManifestPath) {
    $ManifestPath = Join-Path $RepoRoot "manifest.prod.xml"
}
if (-not $CatalogPath) {
    $CatalogPath = Join-Path $env:USERPROFILE "Documents\TasacionesManifest"
}

$resolved = Resolve-Path -LiteralPath $ManifestPath -ErrorAction SilentlyContinue
if (-not $resolved) {
    throw "Manifest not found at: $ManifestPath"
}
$ManifestPath = [System.IO.Path]::GetFullPath($resolved.Path)

$ManifestFileName = Split-Path -Path $ManifestPath -Leaf
$MarkerFile       = Join-Path $CatalogPath ".sideload.json"
$RegRoot          = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs"

function Write-Info($message) {
    Write-Host "[sideload] " -ForegroundColor Cyan -NoNewline
    Write-Host $message
}

function Write-Warn($message) {
    Write-Host "[sideload] " -ForegroundColor Yellow -NoNewline
    Write-Host $message
}

function Format-Unc([string]$localPath) {
    # C:\Users\gabri\Documents\TasacionesManifest  ->  \\localhost\C$\Users\gabri\Documents\TasacionesManifest
    # Uses the built-in admin share on Windows; no manual folder sharing required.
    if ($localPath -match '^([A-Za-z]):\\(.*)$') {
        return "\\localhost\$($Matches[1])$\$($Matches[2])"
    }
    return $localPath
}

function Read-SideloadMarker() {
    if (Test-Path -LiteralPath $MarkerFile) {
        try {
            return Get-Content -LiteralPath $MarkerFile -Raw | ConvertFrom-Json
        } catch {
            Write-Warn "Marker file is unreadable; treating as fresh install."
        }
    }
    return $null
}

function Write-SideloadMarker($data) {
    # Write UTF-8 without BOM so the marker is portable.
    [System.IO.File]::WriteAllText($MarkerFile, ($data | ConvertTo-Json -Depth 4))
}

function Get-RegEntryForCatalog([string]$catalogUrl) {
    if (-not (Test-Path -LiteralPath $RegRoot)) {
        return $null
    }
    Get-ChildItem -LiteralPath $RegRoot -ErrorAction SilentlyContinue |
        Where-Object {
            (Get-ItemProperty -LiteralPath $_.PSPath -Name "Url" -ErrorAction SilentlyContinue).Url -eq $catalogUrl
        } |
        Select-Object -First 1
}

function Remove-CatalogEntry([string]$guid) {
    $path = Join-Path $RegRoot $guid
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
        Write-Info "Removed registry entry: $path"
    } else {
        Write-Info "No registry entry for $guid (already clean)."
    }
}

if ($Uninstall) {
    Write-Info "Uninstalling sideloaded catalog..."
    if (Test-Path -LiteralPath $CatalogPath) {
        $marker = Read-SideloadMarker
        if ($marker -and $marker.guid) {
            Remove-CatalogEntry $marker.guid
        } else {
            $unc = Format-Unc $CatalogPath
            $entry = Get-RegEntryForCatalog $unc
            if ($entry) {
                Remove-CatalogEntry $entry.PSChildName
            } else {
                Write-Warn "No matching registry entry found for $unc."
            }
        }
        Remove-Item -LiteralPath $CatalogPath -Recurse -Force
        Write-Info "Removed catalog folder: $CatalogPath"
    } else {
        Write-Info "Catalog folder already absent: $CatalogPath"
    }
    Write-Info "Done. Restart Excel to apply."
    return
}

# ---------- Install path ----------

if (-not (Test-Path -LiteralPath $CatalogPath)) {
    New-Item -ItemType Directory -Path $CatalogPath -Force | Out-Null
    Write-Info "Created catalog folder: $CatalogPath"
}

$catalogUnc = Format-Unc $CatalogPath

# Reuse or mint GUID.
$marker = Read-SideloadMarker
$existingEntry = Get-RegEntryForCatalog $catalogUnc
if ($existingEntry) {
    $guid = $existingEntry.PSChildName.Trim('{}')
    Write-Info "Reusing existing catalog entry: {$guid}"
} elseif ($marker -and $marker.guid) {
    $guid = $marker.guid
    Write-Info "Reusing GUID from marker: {$guid}"
} else {
    $guid = [guid]::NewGuid().ToString()
    Write-Info "Generated fresh GUID: {$guid}"
}

# Copy manifest into the catalog.
$destManifest = Join-Path $CatalogPath $ManifestFileName
Copy-Item -LiteralPath $ManifestPath -Destination $destManifest -Force
Write-Info "Manifest copied to: $destManifest"

# Write / refresh registry.
$regKey = Join-Path $RegRoot "{$guid}"
if (-not (Test-Path -LiteralPath $regKey)) {
    New-Item -Path $regKey -Force | Out-Null
}
New-ItemProperty -Path $regKey -Name "Id"    -Value "{$guid}" -PropertyType String  -Force | Out-Null
New-ItemProperty -Path $regKey -Name "Url"   -Value $catalogUnc -PropertyType String  -Force | Out-Null
New-ItemProperty -Path $regKey -Name "Flags" -Value 1          -PropertyType DWord   -Force | Out-Null

# Refresh marker.
Write-SideloadMarker ([PSCustomObject]@{
    guid         = $guid
    catalogPath  = $CatalogPath
    catalogUnc   = $catalogUnc
    manifestSrc  = $ManifestPath
    manifestFile = $ManifestFileName
    installedAt  = (Get-Date).ToString("o")
})

Write-Info "Registry key: $regKey"
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host " Sideloaded OK." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Close Excel completely (every window)."
Write-Host "  2. Reopen Excel."
Write-Host "  3. Home > Add-ins > More Add-ins > SHARED FOLDER."
Write-Host "  4. Pick 'Tasaciones' > Add."
Write-Host "  5. The 'Abrir Tasaciones' button appears on the Home ribbon."
Write-Host ""

if ($PassThru) {
    Write-Host "Debug:" -ForegroundColor Yellow
    Write-Host "  Key   : reg.exe query `"$regKey`""
    Write-Host "  Folder: explorer `"$CatalogPath`""
}

Write-Warn "If 'SHARED FOLDER' tab is missing, ensure the catalog URL is reachable and Excel was fully closed (check Task Manager for any EXCEL.EXE processes)."
