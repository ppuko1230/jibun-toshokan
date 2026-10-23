# 素材を含まないソース検証と移植

## ソースのバンドル検証

Node.js 22.23.4 を前提とします。依存は npm の公式レジストリから、このリポジトリのロックファイルに従って取得します。

```powershell
npm ci --ignore-scripts
$env:JIBUN_SOURCE_CHECK_DIR = Join-Path (Split-Path (Get-Location).Path) 'new-isolated-output'
npm run build:source-check
```

`JIBUN_SOURCE_CHECK_DIR` はこのソースフォルダーの外にある、**存在しない新しいディレクトリ**を指定します。検証スクリプトは空教材 JSON と空配色をビルド中だけ仮想化し、ブラウザーとサーバーの JavaScript、CSS、ライセンス通知を出力します。PDF.js 等の実素材や起動用 runtime は含まれません。生成物をアプリとして起動しないでください。Mac でこの検証コマンドが動くかも未確認です。

## 完全なアプリに必要なもの

| 欠けているもの | 元ファイルを repo に置かない方法 |
| --- | --- |
| 教材 JSON と PDF | `build.mjs` の `emptyData` と同じ空構造を隔離ビルドで生成し、空の本棚から始める。利用者が自分の利用権のある PDF を後から追加する。元教材と個人データは公開しない。 |
| PDF.js 5.6.205、worker、cmaps、標準フォント、WASM | 利用者が[Mozilla の同版配布](https://github.com/mozilla/pdf.js/tree/v5.6.205)から取得するか、権利条件を確認した別の PDF 表示実装へ置換する。取得物の各 `LICENSE*` と NOTICE があれば保持する。 |
| BIZ UD Gothic、Open Doodles、Radix Colors | 各原配布元からライセンスとともに取得するか、OS フォント・権利確認済みの新作画像・独自の配色へ置換する。現在の `build.mjs` はこれらの旧配置を参照するため、代替時はビルド処理も修正する。 |
| アイコン | 権利を確認した新しいアイコンを用意するか、アイコン不要の起動方式へ変更する。 |
| Node runtime とランチャー | [Node.js 公式配布](https://nodejs.org/en/download/archive/v22.23.4)から対象 OS 用の runtime とライセンスを取得する。現行の C# ランチャー、PowerShell、Windows Authenticode 検証と更新処理は Mac でそのまま使えない。 |

現行 `build.mjs` は Windows の `csc.exe`、Windows x64 Node、外部素材を要求します。上の表は移植方針であり、完全ビルドの成功を示すものではありません。Mac 版では保存先、SQLite・バックアップ、ローカル HTTP の Host/Origin 制限、署名付き更新、データ保護を改めて検証してください。
