param([string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'), [switch]$Quiet, [string]$AppDirectory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
function Test-YohakuSamePath([string]$Left, [string]$Right) {
    if (!$Left -or !$Right) { return $false }
    try {
        if (![IO.Path]::IsPathRooted($Left) -or ![IO.Path]::IsPathRooted($Right)) { return $false }
        $leftPath = [IO.Path]::GetFullPath($Left).TrimEnd('\','/')
        $rightPath = [IO.Path]::GetFullPath($Right).TrimEnd('\','/')
        return [string]::Equals($leftPath, $rightPath, [StringComparison]::OrdinalIgnoreCase)
    } catch { return $false }
}
try {
    $AppDirectory = [IO.Path]::GetFullPath($AppDirectory)
    $launcher = Join-Path $AppDirectory 'Start-Yohaku.ps1'
    if (!(Test-Path -LiteralPath $launcher)) { throw '先にZIPをすべて展開してください。' }
    $shortcutPath = Join-Path $ShortcutDirectory '余白 - 自分の教材本棚.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $native = Join-Path $AppDirectory '自分図書館.exe'
    if ((Split-Path -Leaf $AppDirectory) -eq 'アプリ本体') { $native = Join-Path (Split-Path -Parent $AppDirectory) '自分図書館.exe' }
    if (Test-Path -LiteralPath $shortcutPath) {
        $existing = $shell.CreateShortcut($shortcutPath)
        $sameNative = Test-YohakuSamePath $existing.TargetPath $native
        $powerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $scriptArgument = [regex]::Match($existing.Arguments, '(?i)(?:^|\s)-File\s+(?:"([^"]+)"|(\S+))(?=\s|$)')
        $sameScript = $false
        if ((Test-YohakuSamePath $existing.TargetPath $powerShell) -and $scriptArgument.Success) {
            $scriptPath = $scriptArgument.Groups[1].Value
            if (!$scriptPath) { $scriptPath = $scriptArgument.Groups[2].Value }
            $sameScript = Test-YohakuSamePath $scriptPath $launcher
        }
        # Start-Yohaku.ps1 uses PSScriptRoot, so its working directory can differ.
        # Keep existing shortcut bytes, even with older slash/case conventions.
        if ($sameNative -or $sameScript) { return }
        throw '別の本棚のショートカットがあるため上書きしませんでした。以前の本棚を使う場合は、そのアイコンから開いてください。'
    }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if (Test-Path -LiteralPath $native) { $shortcut.TargetPath = $native }
    else {
        $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
    }
    $shortcut.WorkingDirectory = $AppDirectory
    $shortcut.Description = '自分のPDFとメモを、このPCで読む本棚'
    $shortcut.IconLocation = (Join-Path $AppDirectory 'public/yohaku-book.ico') + ',0'
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    if (!$Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show('デスクトップに「余白 - 自分の教材本棚」を追加しました。ここから開けます。', '余白') | Out-Null
    }
} catch {
    if ($Quiet) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '余白 - ショートカット') | Out-Null
    exit 1
}
