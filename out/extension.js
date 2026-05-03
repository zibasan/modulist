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
const vscode = __importStar(require("vscode"));
function activate(context) {
    const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri
        : undefined;
    // ツリービューのプロバイダーを登録
    const npmProvider = new NpmDependenciesProvider(rootPath);
    vscode.window.registerTreeDataProvider('manageNpmPkgView', npmProvider);
    // package.jsonの変更を監視して自動リフレッシュ
    if (rootPath) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, 'package.json'));
        watcher.onDidChange(() => npmProvider.refresh());
        watcher.onDidCreate(() => npmProvider.refresh());
        watcher.onDidDelete(() => npmProvider.refresh());
        context.subscriptions.push(watcher);
    }
    // コマンドの登録
    context.subscriptions.push(vscode.commands.registerCommand('manageNpmPkg.refresh', () => npmProvider.refresh()), vscode.commands.registerCommand('manageNpmPkg.openInfo', (item) => {
        vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${item.label}`));
    }), vscode.commands.registerCommand('manageNpmPkg.update', (item) => {
        runTerminalCommand(`pnpm update ${item.label}`);
    }), vscode.commands.registerCommand('manageNpmPkg.remove', (item) => {
        runTerminalCommand(`pnpm remove ${item.label}`);
    }));
}
// ターミナルを実行する関数
function runTerminalCommand(command) {
    const termName = 'Manage NPM Pkg';
    let terminal = vscode.window.terminals.find((t) => t.name === termName);
    if (!terminal) {
        terminal = vscode.window.createTerminal(termName);
    }
    terminal.show();
    terminal.sendText(command);
}
// ---------------------------------------------------------
// TreeDataProviderの実装（VS Codeのサイドバーにデータを渡すクラス）
// ---------------------------------------------------------
class NpmDependenciesProvider {
    workspaceRoot;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }
        const packageJsonUri = vscode.Uri.joinPath(this.workspaceRoot, 'package.json');
        if (element) {
            // 子要素（Dependenciesの中身など）を展開したとき
            try {
                const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
                const packageJson = JSON.parse(new TextDecoder().decode(fileData));
                const deps = element.label === 'Dependencies' ? packageJson.dependencies : packageJson.devDependencies;
                if (!deps)
                    return [];
                return Object.keys(deps).map((depName) => {
                    return new Dependency(depName, deps[depName], vscode.TreeItemCollapsibleState.None, 'dependency');
                });
            }
            catch (_e) {
                return [];
            }
        }
        else {
            // ルート要素（Dependencies と Dev Dependencies の親フォルダ）を作成
            return [
                new Dependency('Dependencies', '', vscode.TreeItemCollapsibleState.Expanded, 'category'),
                new Dependency('Dev Dependencies', '', vscode.TreeItemCollapsibleState.Expanded, 'category'),
            ];
        }
    }
}
// ツリーに表示するアイテムの定義
class Dependency extends vscode.TreeItem {
    label;
    version;
    collapsibleState;
    contextValue;
    constructor(label, version, collapsibleState, contextValue) {
        super(label, collapsibleState);
        this.label = label;
        this.version = version;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.tooltip = `${this.label}-${this.version}`;
        this.description = this.version; // パッケージ名の右側に薄い文字でバージョンを表示
        // アイコンの設定
        this.iconPath =
            this.contextValue === 'category'
                ? new vscode.ThemeIcon('symbol-class')
                : new vscode.ThemeIcon('package');
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map