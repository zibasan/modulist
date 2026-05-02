"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
function activate(context) {
    // ★拡張機能が目覚めた瞬間に呼ばれるログ
    console.log('拡張機能 manage-npm-pkg がアクティブになりました！');
    // コマンドの登録（package.jsonのcommandと完全に一致させる）
    const disposable = vscode.commands.registerCommand('manage-npm-pkg.start', () => {
        // ★コマンドが実行された時のログ
        console.log('画面を開くコマンドが実行されました！');
        const panel = vscode.window.createWebviewPanel('manageNpmPkgPanel', 'Manage NPM Pkg', // タブに表示される名前
        vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist')),
            ],
        });
        const scriptPathOnDisk = vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.js'));
        const stylePathOnDisk = vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist', 'assets', 'index.css'));
        const scriptUri = panel.webview.asWebviewUri(scriptPathOnDisk);
        const styleUri = panel.webview.asWebviewUri(stylePathOnDisk);
        panel.webview.html = getWebviewContent(scriptUri, styleUri);
    });
    context.subscriptions.push(disposable);
}
function getWebviewContent(scriptUri, styleUri) {
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
function deactivate() { }
//# sourceMappingURL=extension.js.map