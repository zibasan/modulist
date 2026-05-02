// src/extension.ts

import * as path from 'node:path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('pkg-manager.start', () => {
    // 1. Webviewパネルを作成
    const panel = vscode.window.createWebviewPanel(
      'pkgManagerPanel',
      'Package Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true, // Webview内でJavaScriptの実行を許可
        retainContextWhenHidden: true, // パネルが非表示になっても状態を保持
        // 拡張機能のディレクトリ内からのみリソースの読み込みを許可
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist')),
        ],
      },
    );

    // 2. ビルドされたReactアプリのパスを取得
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.js'),
    );
    const stylePathOnDisk = vscode.Uri.file(
      path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.css'),
    );

    // 3. Webviewが読み込める特殊なURIに変換
    const scriptUri = panel.webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = panel.webview.asWebviewUri(stylePathOnDisk);

    // 4. WebviewにHTMLをセット
    panel.webview.html = getWebviewContent(scriptUri, styleUri);
  });

  context.subscriptions.push(disposable);
}

// HTMLテンプレートを生成する関数
function getWebviewContent(scriptUri: vscode.Uri, styleUri: vscode.Uri) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Package Manager</title>
    <!-- ReactアプリのCSSを読み込む -->
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <!-- Reactアプリがマウントされる場所 -->
    <div id="root"></div>

    <!-- ReactアプリのJSを読み込む -->
    <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

export function deactivate() {}
