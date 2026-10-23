param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
try {
    $runtime = Join-Path $PSScriptRoot 'runtime/node.exe'
    $manager = Join-Path $PSScriptRoot 'updates/manager.mjs'
    if (!(Test-Path -LiteralPath $runtime) -or !(Test-Path -LiteralPath $manager)) { throw 'ZIPをすべて展開してから開いてください。' }
    $raw = & $runtime --disable-warning=ExperimentalWarning $manager start --app $PSScriptRoot
    if ($LASTEXITCODE -ne 0) { throw '起動できませんでした。上のメッセージを確認してください。' }
    $installation = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installation.json') -Raw | ConvertFrom-Json
    $localUrl = 'http://127.0.0.1:' + $installation.port
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
