# 植栽メモ（planting）

植栽まわりの **トップ（成長記録の閲覧）** と **植栽一覧**、**編集** をまとめたフォルダです。

## 公開サイト向け

- **`index.html`** … サイトの**トップ**。成長記録の**閲覧**（一覧・写真・フィルタ・サムネイル大中小・JSON エクスポート）。保存や編集はしません。
- **`plants.html`** … **全エリアの植栽一覧表**。表は **`index.js`** が `data/plants.json` を読み込んで生成（失敗時はページ内 **`plants-embed`** にフォールバック。`file://` で開く場合など）。**エリア名**から **`area.html`**、植栽名から **`plant.html`**（植栽ページ）、そこから **`plant-detail.html`**（植栽詳細）へ進めます。
- **`plant.html`** + **`plant.js`** … **各植栽のページ**。URL は `plant.html?area=（エリアid）&plant=（植栽名）`。成長記録の写真と概要を表示し、**`plant-detail.html`** の植栽詳細へ進めます。ヘッダの「エリア: …」は **`area.html?area=…`** へリンクします。`data/plant-details.json` の `summary` があればここでも概要として表示します。
- **`plant-detail.html`** + **`plant-detail.js`** … **各植栽の詳細ページ**。URL は `plant-detail.html?area=（エリアid）&plant=（植栽名）`。本文は **`data/plant-details.json`** の `entries`（`areaId`・`name`・`summary`・`body`）から表示します。マスタに無い名前・エリアの組み合わせはエラーになります。パンくずから **`plant.html`** の植栽ページへ戻れます。
- **`area.html`** + **`area.js`** … **エリア単位のページ**（複数植栽がまとまっているゾーン全体）。URL は `area.html?area=（エリアid）`。文章・写真は **`data/area-details.json`** と **GET `/api/area-details`**（本番で KV があればマージ）を反映。**成長記録**でそのエリアに紐づいた写真も一覧表示します。
- **`area-edit.html`** + **`area-edit.js`** … エリア全体の **概要・本文・写真** をブラウザから保存（**POST `/api/area-details`**、成長記録と同じ **アップロード用トークン** `x-growth-token`）。`?area=（id）` でエリアを選択できます。
- **`api/area-details.js`** … エリア詳細の上書きを **KV** に保存し、写真は **Vercel Blob**（パス `area-details/{areaId}/{n}.jpg`）。**GET はトークン不要**、POST は `GROWTH_UPLOAD_TOKEN` と一致するトークンが必要です。プライベート Blob は **`/api/growth-image`** から配信（パス許可を拡張済み）。
- **`data/plant-details.json`** … 植栽ごとの解説（任意）。`entries` に無い組み合わせでもページは開き、プレースホルダが表示されます。段落は `body` 内で **空行** 区切り。
- **`data/area-details.json`** … エリアごとの全体メモ・任意の画像（`images[].imageUrl` / `localSnapshotImage` / `caption` など）。マスタの各 `areaId` に 1 エントリずつあると運用しやすいです。
- **`growth.html`** … 旧URL互換。`index.html`（トップ）へリダイレクトします。
- **`growth-edit.html`** … 記録の**新規追加・編集・削除**、トークン、植栽名マスタの編集。保存は **Vercel（Blob + KV）の API のみ**（`file://` では不可。デプロイ URL または `vercel dev`）。マスタは `data/plants.json`（失敗時は各ページの **`plants-embed`** を `plants.json` と揃える）。**各写真に枚ごとのメモ**（`images[].memo`）を付けられます（記録全体の「メモ」欄とは別）。
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
3. 更新された **`data/plants.json`**・**`data/growth-snapshot.json`**・**`data/growth-images/*.jpg`**（写真）、および **`index.html` / `growth-edit.html` / `plants.html` / `plant.html` / `area.html`**（**`plants-embed`** および **`plant-details-embed` / `area-details-embed`** の自動更新）を `git add` → `commit` → `push` する。
4. 他の環境では **`git pull`** で同じ `data/` と画像が揃います。スナップショットの各記録には **`localSnapshotImage`**（例: `./data/growth-images/{id}.jpg`）が付き、閲覧時は **ローカルファイルを優先**して表示します（オフラインや API 失敗時のフォールバック向け）。

**個別に取り込む場合:** `npm run sync:plants -- <URL>`（マスタのみ・**plants-embed 付き HTML も更新**）、`npm run sync:growth -- <URL>`（成長記録＋**写真ダウンロード**）。**JSON だけ欲しいとき:** `npm run sync:growth -- <URL> --no-images`

**いまある `growth-snapshot.json` にだけ写真を足す:** `npm run sync:images -- <URL>`

**手元だけ `plants.json` を直したとき:** `npm run embed:plants` で各 HTML の `plants-embed` を揃えられます（`plant-details-embed` / `area-details-embed` も更新されます）。

**抜け漏れ点検（マスタ・詳細・HTML 埋め込み・成長記録の植栽名）:** `npm run audit:data`

**注意:** 同期は手動（または CI）まで古いままです。写真を Git に含めると **リポジトリが大きくなります**。画像取得で `self-signed certificate in certificate chain` などになる場合は、社内プロキシの影響のことがあります。**同期用に限り**環境変数 `PLANTING_SYNC_INSECURE_TLS=1` を付けて再実行すると TLS 検証を省略します（**普段のブラウザ運用では使わないでください**）。PowerShell 例: `$env:PLANTING_SYNC_INSECURE_TLS='1'; npm run sync:prod -- https://…`

### GitHub Actions で本番 → リポジトリを自動同期

リポジトリに **`.github/workflows/sync-from-vercel.yml`** があります。次を設定すると、**定期（既定: 毎日 UTC 0:00）**と **手動（Actions タブ → Sync from Vercel → Run workflow）**で、本番 API から取り込み・差分があれば **自動 commit / push** されます。

1. GitHub のリポジトリを開く → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. Name: **`PLANTING_BASE_URL`**、Secret: **`https://planting-three.vercel.app`**（お使いの本番 URL。末尾 `/` なし）
3. 保存後、**Actions** からワークフローを手動実行して一度成功するか確認する

**前提:** 本番の **GET `/api/plants` と GET `/api/growth` はトークン不要**のままであること（現状の設計どおり）。**ブランチ保護**で `github-actions[bot]` の push が弾かれる場合は、保護ルールの例外設定が必要です。

## 成長記録（Vercel のセットアップ）

1. このフォルダを **Vercel のプロジェクト**としてデプロイする（Root Directory を `planting` にするか、リポジトリ全体からこのフォルダだけを選ぶ）。
2. Vercel ダッシュボードで **Blob** ストアを作成し、プロジェクトに接続する（`BLOB_READ_WRITE_TOKEN` が自動で入ります）。
   - **既定**では新規アップロードは **`access: 'private'`**（環境変数未設定時）で、画像は **`/api/growth-image`** 経由で配信されます（閲覧はトークン不要）。
   - **`BLOB_PUT_ACCESS=public`** にすると Blob の **公開 URL** をそのまま記録に保存できます（ストアが公開アップロードに対応している必要があります）。上書き時は **`allowOverwrite`** を付けているため、同じ `growth/{id}.jpg` への差し替えも失敗しにくくなっています。
3. **KV / Redis** を用意する。新規は [Marketplace の Redis（例: Upstash）](https://vercel.com/marketplace?category=storage&search=redis) をプロジェクトに接続し、`KV_REST_API_URL` と `KV_REST_API_TOKEN`（または統合が提供する環境変数）が入るようにする。`@vercel/kv` はこれらの変数を読みます。
4. 環境変数 **`GROWTH_UPLOAD_TOKEN`** に、推測されにくい長い文字列を設定する（**推奨**）。成長記録ページの「アップロード用トークン」に**同じ値**を入力して保存すると、**投稿・編集・削除・植栽マスタの保存**だけが保護されます。**記録一覧の取得（GET）はトークンなし**で行えるため、どの端末でも一覧と写真を閲覧できます。**トークン未設定のままだと、公開 URL では誰でも書き込める**状態になります。
5. 必要なら、閲覧にも共通 ID / パスワードをかける。環境変数 **`SITE_BASIC_AUTH_USER`** と **`SITE_BASIC_AUTH_PASSWORD`** の両方を設定すると、`middleware.js` がサイト全体（HTML と API）に **Basic 認証** をかけます。
   - ブラウザには標準の ID / パスワード入力ダイアログが表示されます。
   - どちらか片方だけ設定すると **500** で止まるため、必ず 2 つセットで入れてください。
   - 未設定なら、これまで通り認証なしで閲覧できます。
6. 再デプロイ後、本番 URL のルート（`index.html`・閲覧）と `growth-edit.html`（編集）を開き、一覧取得と保存ができるか確認します。

ローカルで API を試す場合は `npm install` のあと `vercel dev`（Vercel CLI）を使うと `/api/growth` にアクセスできます。`file://` で HTML を開いただけでは API は使えません。

**`file://` でトップを開いてスナップショットを見る:** ブラウザは `fetch` で `data/growth-snapshot.json` を読めないことが多いため、`index.html` は先に **`data/growth-snapshot.boot.js`** を読み込みます（`npm run sync:prod` または `npm run build:snapshot-boot` で JSON から生成）。写真は **`data/growth-images/`** を **`new URL(..., ページのURL)`** で参照します。一覧が空のときは `growth-snapshot.boot.js` が未生成・古い可能性があります。確実に動かすなら **`npx --yes serve .`** で `planting` フォルダを http 経由で開く方法もあります。
