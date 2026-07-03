# moirai — PNGTuber Web

スマホのブラウザとカメラだけで完結する PNGTuber 表示ページです。
フロントカメラの顔認識(MediaPipe Face Landmarker)で、PNG 立ち絵が口パク・まばたきします。

- **インストール不要**: ブラウザで開くだけ。サーバ処理・ビルドツールなし
- **プライバシー**: カメラ映像は端末内でのみ処理され、外部に送信されません
- **スマホ完結**: カメラ許可から表示まで、すべてスマホ 1 台で操作できます

開発プランは [plan.html](plan.html) を参照してください。

## 使い方

1. ページを開く(GitHub Pages の URL、または後述のローカルサーバ)
2. 「カメラを許可して開始」をタップし、カメラの使用を許可する
3. 喋ると口パク、まばたきすると目を閉じるアバターが全画面表示される
4. 画面をタップすると設定パネルが開く(カメラ切替 / プレビュー表示 / 背景色)

デフォルト背景はグリーンバック(`#00FF00`)なので、OBS のクロマキーでそのまま抜けます。

## GitHub Pages の有効化

1. リポジトリの **Settings → Pages** を開く
2. Source を **Deploy from a branch**、Branch を `main` / `(root)` に設定して Save
3. 数分後に `https://<ユーザー名>.github.io/moirai/` で公開されます

※ カメラ利用(`getUserMedia`)には HTTPS が必要です。GitHub Pages は HTTPS 配信のためそのまま動作します。

## OBS への取り込み(PC 配信の場合)

1. OBS で **ソース → ブラウザ** を追加し、URL に公開ページの URL を入力
2. ブラウザソースのプロパティで「OBS 経由でのカメラ許可」を有効にする
   (または、別ウィンドウのブラウザで開いて **ウィンドウキャプチャ** する)
3. **フィルタ → クロマキー** を追加し、背景色(デフォルト緑)を抜く

## ローカルでの動作確認

ES Modules を使っているため `file://` では動きません。簡易サーバを立ててください:

```bash
python3 -m http.server 8000
# → http://localhost:8000 を開く(localhost は HTTPS なしでもカメラ利用可)
```

## ファイル構成

```
/
├── index.html          … メイン画面(PNGTuber 表示)
├── plan.html           … 開発プラン文書
├── css/style.css
├── js/
│   ├── app.js          … 初期化・UI 制御
│   ├── camera.js       … getUserMedia ラッパー
│   ├── face.js         … MediaPipe Face Landmarker 連携
│   └── avatar.js       … Canvas 描画・状態遷移(口/目/揺れ)
└── assets/sample/      … サンプルアバター画像(閉口/開口/閉眼)
```

## ロードマップ

- ✅ **Phase 1**: カメラ → 顔認識 → サンプルアバターの口パク・まばたき
- ✅ **Phase 2**: 立ち絵のアップロード(IndexedDB 保存)、感度スライダー、設定の永続化
- **Phase 3**: 顔の傾き追従、マイク音量フォールバック、表情プリセット、PWA 化
