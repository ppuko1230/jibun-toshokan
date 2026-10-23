$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'public/runtime/resolve.ps1')
& (Get-YohakuRuntime $PSScriptRoot) --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'updates/manager.mjs') stop --app $PSScriptRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
