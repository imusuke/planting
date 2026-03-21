# 植栽メモ（planting）

植栽まわりの **トップページ（一覧）** と **成長記録（Vercel のみ）** をまとめたフォルダです。

## 公開サイト向け

- **`index.html`** … **全エリアの植栽一覧表**と、成長記録への導線。表は **`index.js`** が `data/plants.json` を読み込んで生成（失敗時はページ内 **`plants-embed`** にフォールバック。`file://` で開く場合など）。植栽名から **成長記録**（`growth.html?area=…&plant=…`）へ進めます。
- **`growth.html`** … エリア・植栽を選んで写真・メモを残す**成長記録**。保存は **Vercel（Blob + KV）の API のみ**（`file://` では保存・一覧不可。デプロイ URL または `vercel dev` を使う）。マスタは `data/plants.json`（失敗時は **`plants-embed`**）。
- **`api/growth.js`** … 成長記録の Serverless API（Vercel 上でのみ動作）。写真は **Vercel Blob**、一覧データは **Vercel KV / Redis（Upstash）** に保存します。
- **`package.json`** … `@vercel/blob`・`@vercel/kv` など。デプロイ前に `npm install` が必要です。
- **`data/plants.json`** … 成長記録のエリア／植栽マスタ。**`index.html` の表と植栽名を揃える**と運用が楽です。
- **`styles.css`** … 一覧の見た目。
- **`data/hub-link.json`** … 「リンク集へ戻る」の遷先。`linkCollectionUrl` に入口ページの **絶対URL**（`https://…`）を書きます（planting 単体を Vercel に出したときに必須）。空のときは `localhost` / `127.0.0.1` / `file://` ではフォルダ用の相対パスに自動します。

## Git をまた使う場合

このフォルダだけで履歴を管理したいときは、ここで `git init` してください。

## 写真・大きいファイル

容量の大きいものは別ストレージに置き、HTML 側には **場所・撮影日・一言**だけ書いておくとよいです。

## 成長記録（Vercel のセットアップ）

1. このフォルダを **Vercel のプロジェクト**としてデプロイする（Root Directory を `planting` にするか、リポジトリ全体からこのフォルダだけを選ぶ）。
2. Vercel ダッシュボードで **Blob** ストアを作成し、プロジェクトに接続する（`BLOB_READ_WRITE_TOKEN` が自動で入ります）。
   - **プライベートストア**（作成時のデフォルト）では、`api/growth.js` が `access: 'private'` で保存し、一覧のサムネイルは **`/api/growth-image`** が代理で配信します（`GROWTH_UPLOAD_TOKEN` 設定時は、成長記録ページで保存したトークンがクエリに付きます）。
   - **パブリックストア**だけ使う場合は、環境変数 **`BLOB_PUT_ACCESS=public`** を設定してください（従来どおり画像 URL をそのまま表示します）。
3. **KV / Redis** を用意する。新規は [Marketplace の Redis（例: Upstash）](https://vercel.com/marketplace?category=storage&search=redis) をプロジェクトに接続し、`KV_REST_API_URL` と `KV_REST_API_TOKEN`（または統合が提供する環境変数）が入るようにする。`@vercel/kv` はこれらの変数を読みます。
4. 環境変数 **`GROWTH_UPLOAD_TOKEN`** に、推測されにくい長い文字列を設定する（**推奨**）。成長記録ページの「アップロード用トークン」に**同じ値**を入力して保存すると、API が保護されます。**未設定のままだと、公開 URL では誰でも読み書きできる**状態になります。
5. 再デプロイ後、本番 URL の `growth.html` を開き、**保存先への接続**のステータスが接続済みになるか確認します。

ローカルで API を試す場合は `npm install` のあと `vercel dev`（Vercel CLI）を使うと `/api/growth` にアクセスできます。`file://` で HTML を開いただけでは API は使えません。
