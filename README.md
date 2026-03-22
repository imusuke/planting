# 植栽メモ（planting）

植栽まわりの **トップ（成長記録の閲覧）** と **植栽一覧**、**編集** をまとめたフォルダです。

## 公開サイト向け

- **`index.html`** … サイトの**トップ**。成長記録の**閲覧**（一覧・写真・フィルタ・サムネイル大中小・JSON エクスポート）。保存や編集はしません。
- **`plants.html`** … **全エリアの植栽一覧表**。表は **`index.js`** が `data/plants.json` を読み込んで生成（失敗時はページ内 **`plants-embed`** にフォールバック。`file://` で開く場合など）。植栽名から **追加・編集**（`growth-edit.html?area=…&plant=…`）へ進めます。
- **`growth.html`** … 旧URL互換。`index.html`（トップ）へリダイレクトします。
- **`growth-edit.html`** … 記録の**新規追加・編集・削除**、トークン、植栽名マスタの編集。保存は **Vercel（Blob + KV）の API のみ**（`file://` では不可。デプロイ URL または `vercel dev`）。マスタは `data/plants.json`（失敗時は各ページの **`plants-embed`** を `plants.json` と揃える）。
- **`api/growth.js`** … 成長記録の Serverless API（Vercel 上でのみ動作）。写真は **Vercel Blob**、一覧データは **Vercel KV / Redis（Upstash）** に保存します。
- **`package.json`** … `@vercel/blob`・`@vercel/kv` など。デプロイ前に `npm install` が必要です。
- **`data/plants.json`** … 成長記録のエリア／植栽マスタ。**`plants.html` の表**および **`index.html` / `growth-edit.html` の embed** と植栽名を揃えると運用が楽です。本番でマスタを編集して KV に保存した内容は、**`git pull` だけでは入りません**。`npm run sync:prod`（後述）で本番 API から取り込んでから commit / push してください。
- **`styles.css`** … 一覧の見た目。
- **`data/hub-link.json`** … 「リンク集へ戻る」の遷先。`linkCollectionUrl` に入口ページの **絶対URL**（`https://…`）を書きます（planting 単体を Vercel に出したときに必須）。空のときは `localhost` / `127.0.0.1` / `file://` ではフォルダ用の相対パスに自動します。
- **`data/growth-snapshot.json`** … 成長記録の**リポジトリ内コピー**（メモ・植栽名・写真 URL など GET `/api/growth` と同じ形）。`npm run sync:prod` または `npm run sync:growth` で本番から取り込み、`git commit` / `git pull` で共有できます。閲覧ページ（`index.html`）は API が使えないとき、このファイルがあれば一覧表示のフォールバックに使います（画像は記録に含まれる URL から読み込み）。

## Git をまた使う場合

このフォルダだけで履歴を管理したいときは、ここで `git init` してください。

## 写真・大きいファイル

容量の大きいものは別ストレージに置き、HTML 側には **場所・撮影日・一言**だけ書いておくとよいです。

## 本番の植栽マスタ・成長記録を Git で共有する

**`git pull` は GitHub 上のファイルしか更新しません。** 本番サイトで編集した **植栽マスタ（KV）** と **成長記録（KV）** は、誰かが一度 **同期スクリプトで `data/` に書き出して commit / push** しない限り、リポジトリにも他の PC の `git pull` にも反映されません。

1. **Node.js 18 以上**で、プロジェクト直下（`planting`）に移動する。
2. 本番の**ベース URL**（`https://…`、末尾 `/` なし）を付けて、**GET `/api/plants` と GET `/api/growth`** をまとめて取り込む（**トークン不要**）:
   - **`npm run sync:prod -- https://あなたのサイト.vercel.app`**
   - または環境変数 **`PLANTING_BASE_URL`** または **`GROWTH_SNAPSHOT_URL`** に同じ URL を設定して `npm run sync:prod`
3. 更新された **`data/plants.json`**・**`data/growth-snapshot.json`**、および **`index.html` / `growth-edit.html` / `plants.html`**（内蔵の **`plants-embed`** が自動で `plants.json` と一致するよう更新されます）を `git add` → `commit` → `push` する。
4. 他の環境では **`git pull`** で同じ `data/` が揃います。

**個別に取り込む場合:** `npm run sync:plants -- <URL>`（マスタのみ・**plants-embed 付き HTML も更新**）、`npm run sync:growth -- <URL>`（成長記録のみ）。

**手元だけ `plants.json` を直したとき:** `npm run embed:plants` で 3 つの HTML の `plants-embed` を揃えられます。

**注意:** 同期は手動（または CI）まで古いままです。画像ファイル本体は引き続き Blob にあり、JSON には URL のみが入ります。記録件数が非常に多い場合はリポジトリサイズに注意してください。

## 成長記録（Vercel のセットアップ）

1. このフォルダを **Vercel のプロジェクト**としてデプロイする（Root Directory を `planting` にするか、リポジトリ全体からこのフォルダだけを選ぶ）。
2. Vercel ダッシュボードで **Blob** ストアを作成し、プロジェクトに接続する（`BLOB_READ_WRITE_TOKEN` が自動で入ります）。
   - **既定**では新規アップロードは **`access: 'private'`**（環境変数未設定時）で、画像は **`/api/growth-image`** 経由で配信されます（閲覧はトークン不要）。
   - **`BLOB_PUT_ACCESS=public`** にすると Blob の **公開 URL** をそのまま記録に保存できます（ストアが公開アップロードに対応している必要があります）。上書き時は **`allowOverwrite`** を付けているため、同じ `growth/{id}.jpg` への差し替えも失敗しにくくなっています。
3. **KV / Redis** を用意する。新規は [Marketplace の Redis（例: Upstash）](https://vercel.com/marketplace?category=storage&search=redis) をプロジェクトに接続し、`KV_REST_API_URL` と `KV_REST_API_TOKEN`（または統合が提供する環境変数）が入るようにする。`@vercel/kv` はこれらの変数を読みます。
4. 環境変数 **`GROWTH_UPLOAD_TOKEN`** に、推測されにくい長い文字列を設定する（**推奨**）。成長記録ページの「アップロード用トークン」に**同じ値**を入力して保存すると、**投稿・編集・削除・植栽マスタの保存**だけが保護されます。**記録一覧の取得（GET）はトークンなし**で行えるため、どの端末でも一覧と写真を閲覧できます。**トークン未設定のままだと、公開 URL では誰でも書き込める**状態になります。
5. 再デプロイ後、本番 URL のルート（`index.html`・閲覧）と `growth-edit.html`（編集）を開き、一覧取得と保存ができるか確認します。

ローカルで API を試す場合は `npm install` のあと `vercel dev`（Vercel CLI）を使うと `/api/growth` にアクセスできます。`file://` で HTML を開いただけでは API は使えません。
