# 第三者表示

`app/terms.css` のテキスト選択レイアウトは、Mozilla PDF.js **v5.6.205** の [`web/text_layer_builder.css`](https://github.com/mozilla/pdf.js/blob/v5.6.205/web/text_layer_builder.css) を元に変更したものです。**Copyright 2014 Mozilla Foundation.** アプリ用のセレクター、サイズ、重ね合わせ動作に変更があります。元の Apache License 2.0 の全文は [`licenses/PDFJS-APACHE-2.0.txt`](licenses/PDFJS-APACHE-2.0.txt) にあります。この部分はプロジェクトの MIT ライセンスへ付け替えていません。

検証用バンドルに入った npm 依存は React 19.2.6、react-dom 19.2.6、scheduler 0.27.0（各 MIT）と lucide-react 1.31.0（ISC）です。`scripts/build-source-check.mjs` は導入済みパッケージの元ライセンス全文と版を、バンドル先の `THIRD-PARTY-NOTICES.txt` に出力します。`node_modules/` と検証バンドルはこのリポジトリに含めません。

将来 PDF.js 本体を追加する場合、主ライセンスだけでなく cmaps、標準フォント、WASM 内の個別ライセンスと付属 NOTICE の有無を確認してください。フォント、イラスト、色、runtime、代替アイコンを追加する場合も、それぞれの出典と表示条件を別に保ってください。ライセンス表示は特許非侵害の保証ではありません。
