param([string]$PackagePath, [string]$TargetDirectory = $PSScriptRoot, [switch]$ChooseInstallation, [switch]$NoDialogs)
$ErrorActionPreference = 'Stop'
try {
    if (!$NoDialogs) { Add-Type -AssemblyName System.Windows.Forms }
    if ($ChooseInstallation) {
        $folder = New-Object System.Windows.Forms.FolderBrowserDialog
        $folder.Description = '今まで使っていた余白のフォルダーを選んでください（Start-Yohaku.ps1がある場所）。'
        if ($folder.ShowDialog() -ne 'OK') { exit 0 }
        $TargetDirectory = $folder.SelectedPath
    }
    if (!(Test-Path -LiteralPath (Join-Path $TargetDirectory 'server.mjs')) -or !(Test-Path -LiteralPath (Join-Path $TargetDirectory 'runtime/node.exe'))) { throw '余白のアプリフォルダーを選んでください。' }
    if (!$PackagePath) {
        if ($NoDialogs) { throw 'PackagePathを指定してください。' }
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = '受け取った余白の更新ZIPを選んでください'
        $dialog.Filter = '余白の更新ZIP (*.zip)|*.zip'
        if ($dialog.ShowDialog() -ne 'OK') { exit 0 }
        $PackagePath = $dialog.FileName
    }
    if (!$NoDialogs) {
        $answer = [System.Windows.Forms.MessageBox]::Show('開いている余白の編集をすべて保存してください。教材とメモを残し、アプリを更新します。続けますか？', '余白の更新', 'OKCancel', 'Information')
        if ($answer -ne 'OK') { exit 0 }
    }
    . (Join-Path $PSScriptRoot 'public/runtime/resolve.ps1')
    $workerDirectory = Join-Path ([IO.Path]::GetTempPath()) ('jibun-update-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $workerDirectory
    $workerRuntime = Join-Path $workerDirectory 'node.exe'
    Copy-Item -LiteralPath (Get-YohakuRuntime $PSScriptRoot) -Destination $workerRuntime
    $raw = & $workerRuntime --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'updates/manager.mjs') update --app $TargetDirectory --package $PackagePath
    if ($LASTEXITCODE -ne 0) { throw '更新できませんでした。更新元のZIPと、保存した内容を確認してください。' }
    $result = ($raw -join "`n") | ConvertFrom-Json
    if ($NoDialogs) { $result | ConvertTo-Json -Compress }
    else { [System.Windows.Forms.MessageBox]::Show(('余白 '+$result.version+'へ更新しました。教材・メモは残っています。開いている画面はCtrl+Rで再読み込みしてください。'), '余白') | Out-Null }
} catch {
    if ($NoDialogs) { throw }
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '余白 - 更新できませんでした') | Out-Null
    exit 1
}
