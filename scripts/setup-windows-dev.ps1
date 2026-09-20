#requires -Version 5.1
<#
Run from the cloned repository:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows-dev.ps1
All application data stays local. No Windows service is registered.
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$MongoPort = 27018,
    [ValidateRange(1024, 65535)][int]$AppPort = 3000,
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($env:OS -ne 'Windows_NT') { throw 'Run this script in native Windows PowerShell, not WSL/macOS/Linux.' }
if ($MongoPort -eq $AppPort) { throw 'MongoPort and AppPort must be different.' }
$machineArch = $env:PROCESSOR_ARCHITECTURE
if ($machineArch -ne 'AMD64' -or -not [Environment]::Is64BitProcess) {
    throw 'MongoDB Windows requires x64 Windows and 64-bit PowerShell; ARM64/32-bit are not supported by this script.'
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $PSScriptRoot 'windows-dev.cjs'
$StateRoot = Join-Path $ProjectRoot '.data\windows-dev'
$LogRoot = Join-Path $StateRoot 'logs'
$DownloadRoot = Join-Path $StateRoot 'downloads'
$DbRoot = Join-Path $StateRoot 'mongo-data'
$MongoVersion = '7.0.43'
# Source: https://downloads.mongodb.org/current.json and the official .zip.sha256.
$MongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoVersion.zip"
$MongoSha256 = '09b7893dc07fbb6d67d4c2690f6d1fa5b3039a0b3b5de34fb1d9096d55a2230f'
$MongoHome = Join-Path $StateRoot "mongodb-$MongoVersion"
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Executable" }
}

function Get-HelperInfo {
    param([string]$Command = 'info')
    $arguments = @($Helper, $Command)
    if ($Command -eq 'configure') { $arguments += @("--mongo-port=$MongoPort", "--app-port=$AppPort") }
    $result = & $NodeExe @arguments
    if ($LASTEXITCODE -ne 0) { throw "Local configuration command '$Command' failed." }
    return ($result | ConvertFrom-Json)
}

function Test-LocalPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}

function Assert-PortOwner {
    param([int]$Port, [int]$ExpectedProcessId)
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
        Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0') })
    if ($listeners.Count -eq 0 -or @($listeners | Where-Object { $_.OwningProcess -ne $ExpectedProcessId }).Count -gt 0) {
        throw "Port $Port does not belong exclusively to the expected project process. No database initialization will continue."
    }
}

function Save-ProcessRecord {
    param([string]$Name, [System.Diagnostics.Process]$Process, [string]$Executable, [string]$Marker)
    $record = @{ processId = $Process.Id; executable = $Executable; marker = $Marker; createdAt = [DateTime]::UtcNow.ToString('o') }
    [IO.File]::WriteAllText((Join-Path $StateRoot "$Name-process.json"), ($record | ConvertTo-Json), $Utf8)
}

function Get-OwnedProcess {
    param([string]$Name, [string]$Executable, [string]$Marker)
    $recordFile = Join-Path $StateRoot "$Name-process.json"
    if (-not (Test-Path -LiteralPath $recordFile)) { return $null }
    $record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.executable -ne $Executable -or $record.marker -ne $Marker) { return $null }
    $processId = [int]$record.processId
    $instance = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($null -eq $instance -or $instance.ExecutablePath -ne $Executable -or -not $instance.CommandLine) { return $null }
    if ($instance.CommandLine.IndexOf($Marker, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
    return (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Get-Download {
    param([string]$Url, [string]$Destination)
    $partial = "$Destination.partial"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -UseBasicParsing -OutFile $partial -TimeoutSec 600
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}

function Ensure-VcRuntime {
    param([switch]$Force)
    $runtime = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
    $runtimeDll = Join-Path $env:WINDIR 'System32\vcruntime140_1.dll'
    if (-not $Force -and $null -ne $runtime -and $runtime.Installed -eq 1 -and (Test-Path -LiteralPath $runtimeDll)) { return }
    Write-Host '[setup] Installing the Microsoft Visual C++ x64 runtime. Windows may show a UAC prompt.'
    $installer = Join-Path $DownloadRoot 'vc_redist.x64.exe'
    Get-Download 'https://aka.ms/vc14/vc_redist.x64.exe' $installer
    $signature = Get-AuthenticodeSignature -FilePath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw 'Microsoft runtime signature verification failed; the installer was not executed.'
    }
    $install = Start-Process -FilePath $installer -ArgumentList '/install /passive /norestart' -Verb RunAs -PassThru -Wait
    if ($install.ExitCode -eq 3010) { throw 'The runtime was installed but Windows requires a restart. Restart Windows and rerun this script.' }
    if ($install.ExitCode -notin @(0, 1638)) { throw "Visual C++ runtime installation failed (exit $($install.ExitCode))." }
}

function Install-LocalMongo {
    $stampFile = Join-Path $MongoHome 'neon-install.json'
    if (Test-Path -LiteralPath $stampFile) {
        $stamp = Get-Content -LiteralPath $stampFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $exe = [IO.Path]::GetFullPath((Join-Path $MongoHome $stamp.executable))
        if ($stamp.archiveSha256 -ne $MongoSha256 -or -not $exe.StartsWith("$MongoHome\", [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected MongoDB install metadata: $stampFile"
        }
        if (Test-Path -LiteralPath $exe) {
            if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -eq $stamp.executableSha256) { return $exe }
            throw 'The local mongod.exe differs from its verified installation. Inspect it before reinstalling.'
        }
    }

    $archive = Join-Path $DownloadRoot "mongodb-$MongoVersion.zip"
    if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $MongoSha256) {
        Write-Host "[setup] Downloading MongoDB $MongoVersion from fastdl.mongodb.org ..."
        Get-Download $MongoUrl $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $MongoSha256) {
        throw 'MongoDB SHA256 verification failed. No downloaded executable was run.'
    }
    # The directory contains binaries only; the database lives in the separate mongo-data directory.
    New-Item -ItemType Directory -Path $MongoHome -Force | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $MongoHome -Force
    $candidates = @(Get-ChildItem -LiteralPath $MongoHome -Recurse -Filter mongod.exe -File)
    if ($candidates.Count -ne 1) { throw 'Expected exactly one mongod.exe in the official ZIP.' }
    $exe = $candidates[0].FullName
    $stamp = @{ archiveSha256 = $MongoSha256; executable = $exe.Substring($MongoHome.Length + 1); executableSha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash }
    [IO.File]::WriteAllText($stampFile, ($stamp | ConvertTo-Json), $Utf8)
    return $exe
}

function Start-LocalMongo {
    param([string]$Executable)
    $mongoProcess = Get-OwnedProcess 'mongo' $Executable $DbRoot
    if ($null -eq $mongoProcess) {
        if (Test-LocalPort $MongoPort) { throw "Port $MongoPort is occupied by a process not owned by this setup. It will not be used or stopped." }
        Write-Host "[setup] Starting local MongoDB on 127.0.0.1:$MongoPort ..."
        $mongoLog = Join-Path $LogRoot 'mongo.log'
        $arguments = "--bind_ip 127.0.0.1 --port $MongoPort --dbpath `"$DbRoot`" --logpath `"$mongoLog`" --logappend"
        $mongoProcess = Start-Process -FilePath $Executable -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $LogRoot 'mongo.stdout.log') -RedirectStandardError (Join-Path $LogRoot 'mongo.stderr.log')
        Save-ProcessRecord 'mongo' $mongoProcess $Executable $DbRoot
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        $mongoProcess.Refresh()
        if ($mongoProcess.HasExited) { throw "MongoDB exited. Inspect $LogRoot\mongo.log and mongo.stderr.log." }
        if (Test-LocalPort $MongoPort) {
            Assert-PortOwner $MongoPort $mongoProcess.Id
            Invoke-Checked $NodeExe @($Helper, 'ping')
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "MongoDB did not become ready within 60 seconds. Inspect $LogRoot."
}

function Start-LocalApp {
    param($Info)
    $appProcess = Get-OwnedProcess 'app' $NodeExe $Helper
    if ($null -eq $appProcess) {
        if (Test-LocalPort $AppPort) { throw "App port $AppPort is occupied by another process. It will not be stopped." }
        Write-Host '[setup] Starting the Next.js / Express / Socket.IO development server ...'
        $appProcess = Start-Process -FilePath $NodeExe -ArgumentList "`"$Helper`" serve" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $LogRoot 'app.stdout.log') -RedirectStandardError (Join-Path $LogRoot 'app.stderr.log')
        Save-ProcessRecord 'app' $appProcess $NodeExe $Helper
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ([DateTime]::UtcNow -lt $deadline) {
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw "The development server exited. Inspect $LogRoot\app.stderr.log." }
        $health = $null
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/healthz" -TimeoutSec 3 } catch { }
        if ($null -ne $health -and $health.status -eq 'ok') {
            Assert-PortOwner $AppPort $appProcess.Id
            if ($health.releaseId -ne $Info.releaseId) { throw 'The health endpoint belongs to a different application instance.' }
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "The development server did not become ready within 120 seconds. Inspect $LogRoot."
}

$oldLocation = Get-Location
$setupLock = $null
try {
    Set-Location -LiteralPath $ProjectRoot
    $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeVersion = & $NodeExe --version
    if ($LASTEXITCODE -ne 0) { throw 'Unable to execute node.exe.' }
    $nodeParts = $nodeVersion.TrimStart('v').Split('.')
    $nodeArch = & $NodeExe -p process.arch
    if ($LASTEXITCODE -ne 0 -or [int]$nodeParts[0] -lt 20 -or ([int]$nodeParts[0] -eq 20 -and [int]$nodeParts[1] -lt 9) -or $nodeArch -ne 'x64') {
        throw 'Use x64 Node.js >=20.9; Node.js 24 is recommended.'
    }
    foreach ($directory in @($StateRoot, $LogRoot, $DownloadRoot, $DbRoot)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $setupLock = [IO.File]::Open((Join-Path $StateRoot 'setup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $info = Get-HelperInfo 'configure'
    Write-Host '[setup] Installing the locked project dependencies with pnpm 10.30.2 ...'
    # npm.cmd avoids PowerShell's npm.ps1 execution policy and needs no global pnpm installation.
    Invoke-Checked $NpmExe @('exec', '--yes', '--package=pnpm@10.30.2', '--', 'pnpm', 'install', '--frozen-lockfile')
    Ensure-VcRuntime
    $MongoExe = Install-LocalMongo
    try { Invoke-Checked $MongoExe @('--version') } catch {
        Write-Host '[setup] MongoDB could not launch. Updating the Microsoft runtime before retrying once ...'
        Ensure-VcRuntime -Force
        Invoke-Checked $MongoExe @('--version')
    }
    Start-LocalMongo $MongoExe
    Invoke-Checked $NodeExe @($Helper, 'seed')
    if (-not $NoStart) { Start-LocalApp $info }
    Write-Host ''
    Write-Host '[setup] Ready.'
    Write-Host "App:          $($info.appUrl)"
    Write-Host "Admin:        $($info.adminUrl)"
    Write-Host "Admin user:   $($info.username)"
    Write-Host "Credentials:  $($info.credentialsFile)"
    Write-Host "MongoDB:      127.0.0.1:$MongoPort / $($info.database) (local development only)"
    Write-Host "Logs:         $LogRoot"
    if ($NoStart) { Write-Host 'Start the app in the foreground: node scripts/windows-dev.cjs serve' }
} finally {
    if ($null -ne $setupLock) { $setupLock.Dispose() }
    Set-Location -LiteralPath $oldLocation.Path
}
