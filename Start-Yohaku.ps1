param([switch]$NoOpen, [string]$ShortcutDirectory, [int]$Port=0)
$ErrorActionPreference = 'Stop'
try {
    . (Join-Path $PSScriptRoot 'public/launcher-setup.ps1')
    $launch = Initialize-YohakuLauncher -Root $PSScriptRoot -NoOpen:$NoOpen
    if (!$launch) { exit 0 }
    $appDirectory = $launch.AppDirectory
    . (Join-Path $PSScriptRoot 'public/runtime/resolve.ps1')
    $runtime = Get-YohakuRuntime $PSScriptRoot
    $manager = Join-Path $PSScriptRoot 'updates/manager.mjs'
    if (!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $manager)) { throw 'ZIPをすべて展開してから開いてください。' }
    $managerOptions = @('start','--app',$appDirectory)
    if ($Port) { $managerOptions += @('--port',[string]$Port) }
    $raw = & $runtime --disable-warning=ExperimentalWarning $manager @managerOptions
    if ($LASTEXITCODE -ne 0) { throw '起動できませんでした。上のメッセージを確認してください。' }
    if (!$NoOpen -or $ShortcutDirectory) {
        try {
            $options = @{AppDirectory=$appDirectory; Quiet=$true}
            if ($ShortcutDirectory) { $options.ShortcutDirectory = $ShortcutDirectory }
            $null = & (Join-Path $PSScriptRoot 'Create-Shortcut.ps1') @options
        } catch {
            if ($NoOpen) { throw }
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.MessageBox]::Show(('本棚は開けます。デスクトップへの追加はできませんでした。' + "`n" + $_.Exception.Message), '自分図書館') | Out-Null
        }
    }
    $installation = Get-Content -LiteralPath (Join-Path $appDirectory 'installation.json') -Raw -Encoding UTF8 -Force | ConvertFrom-Json
    $localUrl = 'http://127.0.0.1:' + $installation.port
    if ($NoOpen) { $raw; exit 0 }
    if (!$NoOpen) {
        $browserPaths = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe')
        )
        $browserPath = $browserPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($browserPath) { Start-Process -FilePath $browserPath -ArgumentList @("--app=$localUrl/?view=library", '--no-first-run') }
        else { Start-Process ($localUrl + '/?view=library') }
    }
} catch {
    if ($NoOpen) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '余白 - 起動できませんでした') | Out-Null
    exit 1
}
