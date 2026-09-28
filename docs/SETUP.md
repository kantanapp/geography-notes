# 準備手順（GitHub ＋ Claude Code）

## 0. 必要なもの
- GitHub アカウント（https://github.com）
- Git（Mac は入っていることが多い。Windows は https://git-scm.com からインストール）
- Claude の有料プラン（Pro 以上）… Claude Code を使うため

## 1. Claude Code を入れる
公式手順: https://code.claude.com/docs/en/quickstart

- Mac / Linux（ターミナル）: `curl -fsSL https://claude.ai/install.sh | bash`
- Windows（PowerShell）: `irm https://claude.ai/install.ps1 | iex`

入れたら、このフォルダで `claude` と打つ → 初回はブラウザでログイン。
（Claude デスクトップアプリの「Code」タブからでも同じことができます）

## 2. GitHub にリポジトリを作る
1. GitHub 右上「＋」→「New repository」
2. 名前: `geography-notes`（自由）
3. **Public** を選ぶ（無料プランで GitHub Pages を使うには Public が必要）
4. README 等は**何も追加せず**「Create repository」

## 3. このフォルダを GitHub に上げる
zip を展開したフォルダでターミナルを開き、Claude Code を起動して、こう頼むだけでOK:

> このフォルダを git で初期化して、https://github.com/＜あなたのユーザー名＞/geography-notes に push して

自分でやる場合:
```
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/＜ユーザー名＞/geography-notes.git
git push -u origin main
```

## 4. GitHub Pages で公開
リポジトリの「Settings」→「Pages」→ Source を「Deploy from a branch」、
Branch を `main` / `/ (root)` にして Save。
1〜2分で `https://＜ユーザー名＞.github.io/geography-notes/` で開けます（スマホでもOK）。

## 5. Claude Code で育てる
フォルダで `claude` を起動すると `CLAUDE.md` を自動で読むので、ルールを毎回説明しなくて大丈夫です。
頼み方の例:
- 「docs/要確認リスト.md を見て、burping を ＿＿ に直して」
- 「まちがえた空欄だけ出す復習モードを作って」
- 「Unit 1.4 のプリントの写真を追加するので data/units.js に足して」
- 「直したら commit して push して」

push すると数分で公開ページにも反映されます。
