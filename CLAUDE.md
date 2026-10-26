# CLAUDE.md

<!-- 50〜100 行以内を目安に。共通ワークフローは .claude/rules/harness.md（claude-harness 管理）にある。 -->

# billet

ふたり（koki / eri）で券を発行し合い、受け取り・譲渡・使用・履歴を管理する発券アプリ（PWA）。
GitHub Pages で公開: https://kokihanamura.github.io/billet/ （`main` に push すると自動で反映）

## Commands

| Command | Description |
|---------|-------------|
| `node --check app.js && node --check sw.js` | 構文チェック（テストは無い） |
| `python3 -m http.server 8000` | ローカル起動 → http://localhost:8000/index.html |

## Architecture

- ビルド工程なし。`index.html` が React 18（UMD）と Firebase compat を CDN から読み、`app.js` を読み込むだけ
- `app.js` は JSX を変換済みのプレーン JS。変換前のソースは無いので `app.js` を直接編集する（`React.createElement` で書く）
- データは Firestore の `okuriken_storage` コレクションに `tickets-all`（券の配列）と `activity-log`（操作ログの配列）を JSON 文字列で保存
- ログの action: `issued` / `transferred` / `used` / `cancelled` / `invalidated` / `restored`

## Gotchas

- `app.js` を変えたら `index.html` の `app.js?v=N` を上げる（ブラウザ・Pages のキャッシュ対策）
- 動作確認で本番 Firestore に書き込まない。`firebase-config.js` を差し替えるか、オフライン（未設定）モードで試す
- クラウド環境からは unpkg / gstatic に繋がらないことがある。その場合は npm から同じ版を取って Playwright の route で差し込む
- 公開リポジトリかつ Pages で配信しているので、ここに置いたファイルは誰でも見られる。秘密情報を置かない
