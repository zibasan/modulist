import * as path from 'node:path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // ★拡張機能が目覚めた瞬間に呼ばれるログ
  console.log('拡張機能 manage-npm-pkg がアクティブになりました！');

  // コマンドの登録（package.jsonのcommandと完全に一致させる）
  const disposable = vscode.commands.registerCommand('manage-npm-pkg.start', () => {
    // ★コマンドが実行された時のログ
    console.log('画面を開くコマンドが実行されました！');

    const panel = vscode.window.createWebviewPanel(
      'manageNpmPkgPanel',
      'Manage NPM Pkg', // タブに表示される名前
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist')),
        ],
      },
    );

    const scriptPathOnDisk = vscode.Uri.file(
      path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.js'),
    );
    const stylePathOnDisk = vscode.Uri.file(
      path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.css'),
    );

    const scriptUri = panel.webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = panel.webview.asWebviewUri(stylePathOnDisk);

    panel.webview.html = getWebviewContent(scriptUri, styleUri);
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(scriptUri: vscode.Uri, styleUri: vscode.Uri) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage NPM Pkg</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

export function deactivate() {}
