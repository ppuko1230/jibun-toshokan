$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'runtime/node.exe') --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'updates/manager.mjs') stop --app $PSScriptRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
