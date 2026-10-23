function New-YohakuWelcome {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = '自分図書館'
    $form.ClientSize = New-Object System.Drawing.Size(520, 310)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.Font = New-Object System.Drawing.Font('Yu Gothic UI', 10)
    $form.BackColor = [Drawing.Color]::FromArgb(248, 249, 242)
    $title = New-Object Windows.Forms.Label
    $title.Text = '自分の本棚を、はじめよう。'
    $title.Font = New-Object Drawing.Font('Yu Gothic UI', 17, [Drawing.FontStyle]::Bold)
    $title.SetBounds(28, 25, 464, 40)
    $form.Controls.Add($title)
    $text = New-Object Windows.Forms.Label
    $text.Text = "デスクトップにアイコンを追加して、本棚を開きます。`n次回からは、そのアイコンを開くだけで使えます。"
    $text.SetBounds(30, 82, 460, 60)
    $form.Controls.Add($text)
    $start = New-Object Windows.Forms.Button
    $start.Text = '使い始める'
    $start.SetBounds(30, 158, 460, 48)
    $start.BackColor = [Drawing.Color]::FromArgb(31, 68, 51)
    $start.ForeColor = [Drawing.Color]::White
    $start.FlatStyle = 'Flat'
    $start.Add_Click({$this.FindForm().Tag = 'new'; $this.FindForm().Close()})
    $form.Controls.Add($start)
    $old = New-Object Windows.Forms.Button
    $old.Text = '以前の本棚を使っている方はこちら'
    $old.SetBounds(30, 224, 460, 40)
    $old.Add_Click({$this.FindForm().Tag = 'existing'; $this.FindForm().Close()})
    $form.Controls.Add($old)
    $form.AcceptButton = $start
    return $form
}
function Show-YohakuWelcome {
    $form = New-YohakuWelcome
    try { $null = $form.ShowDialog(); return $form.Tag } finally { $form.Dispose() }
}
function Resolve-YohakuApp([string]$Path) {
    $directory = [IO.Path]::GetFullPath($Path)
    if (Test-Path -LiteralPath (Join-Path $directory 'アプリ本体/server.mjs')) { $directory = Join-Path $directory 'アプリ本体' }
    if (!(Test-Path -LiteralPath (Join-Path $directory 'server.mjs')) -or !(Test-Path -LiteralPath (Join-Path $directory 'runtime/node.exe'))) { throw '今まで使っていた本棚のフォルダーを選んでください。' }
    return $directory
}
function Use-YohakuExisting([string]$Source, [string]$Target) {
    $targetApp = Resolve-YohakuApp $Target
    if ($targetApp -eq $Source) { throw '新しく展開したフォルダーではなく、今まで使っていた本棚を選んでください。' }
    $sourceRelease = Get-Content -LiteralPath (Join-Path $Source 'release.json') -Raw -Encoding UTF8 -Force | ConvertFrom-Json
    $targetRelease = Get-Content -LiteralPath (Join-Path $targetApp 'release.json') -Raw -Encoding UTF8 -Force | ConvertFrom-Json
    if ($sourceRelease.edition -ne 'shared' -or $targetRelease.edition -ne 'shared') { throw '配布版の本棚を選んでください。教材付きの個人版には、個人版の更新が必要です。' }
    if ([version]$targetRelease.version -lt [version]$sourceRelease.version) {
        & (Join-Path $Source 'Update-Yohaku.ps1') -TargetDirectory $targetApp -PackagePath (Join-Path $Source 'update.yohaku.zip')
        if ($LASTEXITCODE -ne 0) { throw '引き継ぎを完了できませんでした。今までの本棚はそのまま使えます。' }
        $targetRelease = Get-Content -LiteralPath (Join-Path $targetApp 'release.json') -Raw -Encoding UTF8 -Force | ConvertFrom-Json
        if ([version]$targetRelease.version -lt [version]$sourceRelease.version) { return $null }
    }
    @{appRoot=$targetApp} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Source 'launcher-target.json') -Encoding UTF8
    return $targetApp
}
function Initialize-YohakuLauncher([string]$Root, [switch]$NoOpen) {
    $first = !(Test-Path -LiteralPath (Join-Path $Root 'installation.json'))
    $directory = $Root
    $redirect = Join-Path $Root 'launcher-target.json'
    if (Test-Path -LiteralPath $redirect) {
        $remembered = Get-Content -LiteralPath $redirect -Raw -Encoding UTF8 -Force | ConvertFrom-Json
        $directory = Resolve-YohakuApp $remembered.appRoot
        $first = $false
    } elseif ($first -and !$NoOpen) {
        $choice = Show-YohakuWelcome
        if (!$choice) { return $null }
        if ($choice -eq 'existing') {
            $folder = New-Object System.Windows.Forms.FolderBrowserDialog
            $folder.Description = '今まで使っていた自分図書館のフォルダーを選んでください。教材とメモはそのまま引き継ぎます。'
            if ($folder.ShowDialog() -ne 'OK') { return $null }
            $directory = Use-YohakuExisting $Root $folder.SelectedPath
            if (!$directory) { return $null }
        }
    }
    return @{AppDirectory=$directory; CreateShortcut=$first}
}
