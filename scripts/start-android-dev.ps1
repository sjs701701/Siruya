$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$projectRootPath = $projectRoot.Path
$androidProjectPath = Join-Path $projectRootPath 'android'
$appLaunchComponent = 'com.platapp_codex/.MainActivity'

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host "== $Message =="
}

function Get-FirstExistingPath {
  param([string[]]$Paths)

  foreach ($path in $Paths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return $path
    }
  }

  return $null
}

function Find-AndroidStudio {
  $paths = @(
    "$env:ProgramFiles\Android\Android Studio\bin\studio64.exe",
    "$env:ProgramFiles\Android\Android Studio\bin\studio.exe",
    "${env:ProgramFiles(x86)}\Android\Android Studio\bin\studio64.exe",
    "${env:ProgramFiles(x86)}\Android\Android Studio\bin\studio.exe",
    "$env:LOCALAPPDATA\Programs\Android Studio\bin\studio64.exe",
    "$env:LOCALAPPDATA\Programs\Android Studio\bin\studio.exe"
  )

  $studio = Get-FirstExistingPath $paths
  if ($studio) {
    return $studio
  }

  $command = Get-Command studio64.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $command = Get-Command studio.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

function Find-AndroidSdk {
  $paths = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk"
  )

  return Get-FirstExistingPath $paths
}

function Find-JavaHome {
  $paths = @(
    $env:JAVA_HOME,
    "$env:ProgramFiles\Android\Android Studio\jbr",
    "${env:ProgramFiles(x86)}\Android\Android Studio\jbr",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
  )

  return Get-FirstExistingPath $paths
}

function Find-LocalGradle {
  $wrapperProperties = Join-Path $androidProjectPath 'gradle\wrapper\gradle-wrapper.properties'
  if (-not (Test-Path -LiteralPath $wrapperProperties)) {
    return $null
  }

  $distributionUrl = Select-String -LiteralPath $wrapperProperties -Pattern '^distributionUrl=' |
    Select-Object -First 1 |
    ForEach-Object { $_.Line.Split('=', 2)[1] }

  if (-not $distributionUrl) {
    return $null
  }

  $archiveName = [System.IO.Path]::GetFileName($distributionUrl.Replace('\:', ':'))
  $distributionName = $archiveName -replace '\.zip$', ''
  $distributionRoot = Join-Path $env:USERPROFILE ".gradle\wrapper\dists\$distributionName"

  if (-not (Test-Path -LiteralPath $distributionRoot)) {
    return $null
  }

  return Get-ChildItem -LiteralPath $distributionRoot -Recurse -Filter 'gradle.bat' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

function Get-AvdNames {
  param([string]$EmulatorPath)

  $names = @()

  try {
    $names = & $EmulatorPath -list-avds 2>$null |
      Where-Object { $_.Trim().Length -gt 0 } |
      ForEach-Object { $_.Trim() }
  } catch {
    $names = @()
  }

  if ($names.Count -eq 0) {
    $avdDir = Join-Path $env:USERPROFILE '.android\avd'
    if (Test-Path -LiteralPath $avdDir) {
      $names = Get-ChildItem -LiteralPath $avdDir -Filter '*.ini' |
        ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name) }
    }
  }

  return @($names | Sort-Object -Unique)
}

function Get-EmulatorSerial {
  param([string]$AdbPath)

  try {
    $devices = & $AdbPath devices 2>$null
  } catch {
    return $null
  }

  foreach ($line in $devices) {
    if ($line -match '^(emulator-\d+)\s+device$') {
      return $matches[1]
    }
  }

  return $null
}

function Get-AdbState {
  param(
    [string]$AdbPath,
    [string]$Serial
  )

  try {
    return (& $AdbPath -s $Serial get-state 2>$null).Trim()
  } catch {
    return ''
  }
}

function Get-DeviceAbi {
  param(
    [string]$AdbPath,
    [string]$Serial
  )

  try {
    $abi = (& $AdbPath -s $Serial shell getprop ro.product.cpu.abi 2>$null).Trim()
  } catch {
    $abi = ''
  }

  if ($abi) {
    return $abi
  }

  return 'x86_64'
}

function Wait-ForEmulatorSerial {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds = 180
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $serial = Get-EmulatorSerial $AdbPath
    if ($serial) {
      return $serial
    }

    Start-Sleep -Seconds 2
  }

  return $null
}

function Wait-ForDeviceReady {
  param(
    [string]$AdbPath,
    [string]$Serial,
    [int]$TimeoutSeconds = 240
  )

  & $AdbPath -s $Serial wait-for-device | Out-Null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $state = Get-AdbState $AdbPath $Serial
    $booted = ''
    $bootAnimation = ''

    if ($state -eq 'device') {
      $booted = (& $AdbPath -s $Serial shell getprop sys.boot_completed 2>$null).Trim()
      $bootAnimation = (& $AdbPath -s $Serial shell getprop init.svc.bootanim 2>$null).Trim()
    }

    if ($state -eq 'device' -and $booted -eq '1' -and $bootAnimation -eq 'stopped') {
      return $true
    }

    Start-Sleep -Seconds 3
  }

  return $false
}

function Start-Metro {
  $safeProjectRoot = $projectRootPath.Replace("'", "''")
  $safeSdkRoot = $sdkRoot.Replace("'", "''")
  $safeJavaHome = ''
  if ($javaHome) {
    $safeJavaHome = $javaHome.Replace("'", "''")
  }
  $safePlatformTools = (Join-Path $sdkRoot 'platform-tools').Replace("'", "''")
  $safeEmulatorTools = (Join-Path $sdkRoot 'emulator').Replace("'", "''")
  $javaCommand = ''
  if ($safeJavaHome) {
    $javaCommand = @"
`$env:JAVA_HOME = '$safeJavaHome'
`$env:PATH = '$safeJavaHome\bin;' + `$env:PATH
"@
  }

  $command = @"
`$Host.UI.RawUI.WindowTitle = 'Siruya Metro'
`$env:ANDROID_HOME = '$safeSdkRoot'
`$env:ANDROID_SDK_ROOT = '$safeSdkRoot'
`$env:PATH = '$safePlatformTools;$safeEmulatorTools;' + `$env:PATH
$javaCommand
Set-Location -LiteralPath '$safeProjectRoot'
npm.cmd start
"@

  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $command
  )
}

function Test-PortInUse {
  param([int]$Port)

  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Start-TerminalCommand {
  param(
    [string]$Title,
    [string]$Command
  )

  $safeProjectRoot = $projectRootPath.Replace("'", "''")
  $safeTitle = $Title.Replace("'", "''")
  $safeSdkRoot = $sdkRoot.Replace("'", "''")
  $safeJavaHome = ''
  if ($javaHome) {
    $safeJavaHome = $javaHome.Replace("'", "''")
  }
  $safePlatformTools = (Join-Path $sdkRoot 'platform-tools').Replace("'", "''")
  $safeEmulatorTools = (Join-Path $sdkRoot 'emulator').Replace("'", "''")
  $javaCommand = ''
  if ($safeJavaHome) {
    $javaCommand = @"
`$env:JAVA_HOME = '$safeJavaHome'
`$env:PATH = '$safeJavaHome\bin;' + `$env:PATH
"@
  }

  $fullCommand = @"
`$Host.UI.RawUI.WindowTitle = '$safeTitle'
`$env:ANDROID_HOME = '$safeSdkRoot'
`$env:ANDROID_SDK_ROOT = '$safeSdkRoot'
`$env:PATH = '$safePlatformTools;$safeEmulatorTools;' + `$env:PATH
$javaCommand
Set-Location -LiteralPath '$safeProjectRoot'
$Command
"@

  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $fullCommand
  )
}

Write-Step 'Opening Android Studio'
$studio = Find-AndroidStudio
if ($studio) {
  Start-Process -FilePath $studio -ArgumentList @($androidProjectPath)
} else {
  Write-Host 'Android Studio was not found in the usual install paths.'
}

Write-Step 'Finding Android SDK'
$sdkRoot = Find-AndroidSdk
if (-not $sdkRoot) {
  Write-Host 'Android SDK was not found. Open Android Studio once and finish SDK setup.'
  Read-Host 'Press Enter to close'
  exit 1
}

$javaHome = Find-JavaHome

$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'

if (-not (Test-Path -LiteralPath $emulator)) {
  Write-Host "Emulator tool was not found: $emulator"
  Read-Host 'Press Enter to close'
  exit 1
}

if (-not (Test-Path -LiteralPath $adb)) {
  Write-Host "ADB tool was not found: $adb"
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Step 'Starting Android emulator'
$avdNames = @(Get-AvdNames $emulator)
if ($avdNames.Count -eq 0) {
  Write-Host 'No virtual phone was found.'
  Write-Host 'Open Android Studio > Device Manager, create a virtual device, then run this file again.'
  Read-Host 'Press Enter to close'
  exit 1
}

$preferredAvd = $env:SIRUYA_AVD
if (-not $preferredAvd) {
  if ($avdNames -contains 'Pixel_7') {
    $preferredAvd = 'Pixel_7'
  } else {
    $preferredAvd = $avdNames[0]
  }
}

$serial = Get-EmulatorSerial $adb
if (-not $serial) {
  Write-Host "Starting virtual phone: $preferredAvd"
  Start-Process -FilePath $emulator -ArgumentList @('-avd', $preferredAvd)
  $serial = Wait-ForEmulatorSerial $adb
} else {
  Write-Host "Using running virtual phone: $serial"
}

if (-not $serial) {
  Write-Host 'The virtual phone did not start in time.'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "Waiting for virtual phone boot: $serial"
$ready = Wait-ForDeviceReady $adb $serial
if (-not $ready) {
  Write-Host 'The virtual phone started, but Android did not finish booting in time.'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host 'Virtual phone is ready.'

Write-Step 'Checking project dependencies'
if (-not (Test-Path -LiteralPath (Join-Path $projectRootPath 'node_modules'))) {
  Write-Host 'node_modules was not found. Running npm install first.'
  Push-Location $projectRootPath
  try {
    & npm.cmd install --cache C:\tmp\npm-cache
  } finally {
    Pop-Location
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Host 'npm install failed.'
    Read-Host 'Press Enter to close'
    exit $LASTEXITCODE
  }
}

Write-Step 'Starting React Native app'
if (-not (Test-PortInUse 8081)) {
  Start-Metro
  Start-Sleep -Seconds 8
} else {
  Write-Host 'Metro server already appears to be running on port 8081.'
}

& $adb -s $serial reverse tcp:8081 tcp:8081 | Out-Null

$deviceAbi = Get-DeviceAbi $adb $serial
$gradle = Find-LocalGradle
if (-not $gradle) {
  $gradle = Join-Path $androidProjectPath 'gradlew.bat'
}

$apkPath = Join-Path $androidProjectPath 'app\build\outputs\apk\debug\app-debug.apk'
$safeAndroidProjectPath = $androidProjectPath.Replace("'", "''")
$safeGradle = $gradle.Replace("'", "''")
$safeAdb = $adb.Replace("'", "''")
$safeApkPath = $apkPath.Replace("'", "''")
$safeSerial = $serial.Replace("'", "''")
$safeDeviceAbi = $deviceAbi.Replace("'", "''")
$safeAppLaunchComponent = $appLaunchComponent.Replace("'", "''")

$installCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$safeAndroidProjectPath'
& '$safeGradle' app:assembleDebug -PreactNativeDevServerPort=8081 -PreactNativeArchitectures=$safeDeviceAbi --no-daemon
if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
& '$safeAdb' -s '$safeSerial' install -r -d '$safeApkPath'
if (`$LASTEXITCODE -ne 0) {
  Write-Host 'Install failed. Clearing virtual phone cache and retrying once.'
  & '$safeAdb' -s '$safeSerial' shell pm trim-caches 999G | Out-Null
  & '$safeAdb' -s '$safeSerial' install -r -d '$safeApkPath'
  if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
}
& '$safeAdb' -s '$safeSerial' reverse tcp:8081 tcp:8081 | Out-Null
& '$safeAdb' -s '$safeSerial' shell am start -n '$safeAppLaunchComponent'
"@

Start-TerminalCommand 'Siruya Android App' $installCommand

Write-Host ''
Write-Host 'Startup commands were sent.'
Write-Host 'Keep the Metro terminal open while developing.'
