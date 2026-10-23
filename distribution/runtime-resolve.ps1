function Get-YohakuRuntime([string]$AppDirectory) {
    $release = Get-Content -LiteralPath (Join-Path $AppDirectory 'release.json') -Raw -Encoding UTF8 -Force | ConvertFrom-Json
    $primary = Join-Path $AppDirectory 'runtime/node.exe'
    if (!$release.runtime) { return $primary }
    $expected = [string]$release.runtime.sha256
    if ($expected -notmatch '^[a-f0-9]{64}$') { throw 'Node.jsの更新情報を確認できません。' }
    foreach ($candidate in @($primary, (Join-Path $AppDirectory 'public/runtime/node.exe'))) {
        if (!(Test-Path -LiteralPath $candidate)) { continue }
        $stream = [IO.File]::OpenRead($candidate)
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $algorithm.Dispose(); $stream.Dispose() }
        if ($actual -eq $expected) { return $candidate }
    }
    throw 'Node.jsの更新ファイルを確認できません。ZIPをすべて展開してください。'
}
