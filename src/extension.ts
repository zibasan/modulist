import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // 1. 【サイドバー用】プロバイダーを登録
  const sidebarProvider = new PkgSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('manage-npm-pkg.sidebar', sidebarProvider),
  );

  // 2. 【エディタータブ用】コマンドを登録（既存の機能）
  const disposable = vscode.commands.registerCommand('manage-npm-pkg.start', () => {
    const panel = vscode.window.createWebviewPanel(
      'manageNpmPkgPanel',
      'Manage NPM Pkg',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
      },
    );

    // 共通のセットアップ処理を呼び出す
    setupWebview(panel.webview, context.extensionUri);
  });

  context.subscriptions.push(disposable);
}

// サイドバーでWebviewを表示するためのクラス
class PkgSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist')],
    };

    // 共通のセットアップ処理を呼び出す
    setupWebview(webviewView.webview, this._extensionUri);
  }
}

// ---------------------------------------------------------
// エディターとサイドバーで使い回す、共通のWebviewセットアップ処理
// ---------------------------------------------------------
function setupWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const scriptPathOnDisk = vscode.Uri.joinPath(
    extensionUri,
    'webview-ui',
    'dist',
    'assets',
    'index.js',
  );
  const stylePathOnDisk = vscode.Uri.joinPath(
    extensionUri,
    'webview-ui',
    'dist',
    'assets',
    'index.css',
  );

  const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
  const styleUri = webview.asWebviewUri(stylePathOnDisk);

  webview.html = getWebviewContent(scriptUri, styleUri);

  // Reactからのメッセージ受信処理
  webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      // Reactから「パッケージ情報をちょうだい」と言われたら
      case 'getPackages':
        await sendPackageData(webview);
        return;
    }
  });
}

// package.json を読み取ってReactに送る関数
async function sendPackageData(webview: vscode.Webview) {
  // 現在VS Codeで開いているフォルダ（ワークスペース）を取得
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    webview.postMessage({ command: 'error', text: 'フォルダが開かれていません。' });
    return;
  }

  // 1つ目のフォルダの直下にある package.json のパスを作成
  const packageJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');

  try {
    // ファイルを読み込んで文字列に変換し、JSONとして解析
    const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
    const jsonString = new TextDecoder().decode(fileData);
    const packageJson = JSON.parse(jsonString);

    // React側にデータを送信
    webview.postMessage({
      command: 'packageData',
      data: {
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
      },
    });
  } catch (_error) {
    // ファイルがない、またはJSONが壊れている場合のエラーハンドリング
    webview.postMessage({
      command: 'error',
      text: 'package.json が見つからないか、読み込めません。',
    });
  }
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
