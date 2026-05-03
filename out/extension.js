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
const cp = __importStar(require("node:child_process"));
const path = __importStar(require("node:path"));
const node_util_1 = require("node:util");
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
const functions_1 = require("./utils/functions");
const exec = (0, node_util_1.promisify)(cp.exec);
const outputChannel = vscode.window.createOutputChannel('Modulist Info');
function activate(context) {
    const npmProvider = new NpmDependenciesProvider();
    vscode.window.registerTreeDataProvider('modulistView', npmProvider);
    // ワークスペース内のすべての package.json の変更を監視
    const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    watcher.onDidChange(() => npmProvider.refresh());
    watcher.onDidCreate(() => npmProvider.refresh());
    watcher.onDidDelete(() => npmProvider.refresh());
    context.subscriptions.push(watcher);
    vscode.commands.registerCommand('modulist.showInfoOutput', async (target) => {
        const pkgName = typeof target === 'string' ? target : target.label;
        if (!pkgName)
            return;
        try {
            const res = await fetch(`https://registry.npmjs.org/${pkgName}`);
            const data = (await res.json());
            outputChannel.clear();
            outputChannel.appendLine(`========================================`);
            outputChannel.appendLine(` 📦 ${data.name || pkgName} (v${data['dist-tags']?.latest || 'Unknown'})`);
            outputChannel.appendLine(`========================================`);
            outputChannel.appendLine(`📝 Description : ${data.description || 'N/A'}`);
            outputChannel.appendLine(`🔗 Publisher   : ${data.author?.name || 'Unknown'}`);
            outputChannel.appendLine(`🌐 NPM Site    : https://www.npmjs.com/package/${pkgName}`);
            const repoUrl = data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
            if (repoUrl)
                outputChannel.appendLine(`💻 Repository  : ${repoUrl}`);
            if (data.homepage)
                outputChannel.appendLine(`🏠 Homepage    : ${data.homepage}`);
            outputChannel.show(true);
        }
        catch (_error) {
            vscode.window.showErrorMessage(`'${pkgName}' の詳細情報の取得に失敗しました。`);
        }
    });
    context.subscriptions.push(vscode.commands.registerCommand('modulist.refresh', () => npmProvider.refresh()), vscode.commands.registerCommand('modulist.searchLocal', async () => {
        try {
            const packageJsons = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
            if (packageJsons.length === 0) {
                return vscode.window.showErrorMessage((0, i18n_1.t)('error.noWorkspace'));
            }
            const items = [];
            for (const uri of packageJsons) {
                const fileData = await vscode.workspace.fs.readFile(uri);
                const packageJson = JSON.parse(new TextDecoder().decode(fileData));
                const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
                const projectName = path.basename(path.dirname(uri.fsPath)) || 'Root';
                for (const name of Object.keys(allDeps)) {
                    items.push({
                        label: name,
                        description: `v${allDeps[name]} (${projectName})`,
                        iconPath: new vscode.ThemeIcon('package'),
                        fsPath: path.dirname(uri.fsPath),
                    });
                }
            }
            const selectedPkg = await vscode.window.showQuickPick(items, {
                placeHolder: (0, i18n_1.t)('placeholder.searchLocal'),
            });
            if (!selectedPkg)
                return;
            const latestVersion = npmProvider.getOutdatedVersion(selectedPkg.fsPath, selectedPkg.label);
            const actionOptions = [
                { label: `$(info) ${(0, i18n_1.t)('action.openNpm')}`, id: 'open' },
                { label: `$(output) ${(0, i18n_1.t)('action.showInfo')}`, id: 'info' },
            ];
            if (latestVersion)
                actionOptions.push({ label: `$(sync) ${(0, i18n_1.t)('action.update')}`, id: 'update' });
            actionOptions.push({ label: `$(trash) ${(0, i18n_1.t)('action.remove')}`, id: 'remove' });
            actionOptions.push({ label: `$(circle-slash) ${(0, i18n_1.t)('action.cancel')}`, id: 'cancel' });
            const action = await vscode.window.showQuickPick(actionOptions, {
                placeHolder: `${(0, i18n_1.t)('placeholder.selectAction')} ${selectedPkg.label}`,
            });
            if (action?.id === 'open')
                vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${selectedPkg.label}`));
            if (action?.id === 'info')
                vscode.commands.executeCommand('modulist.showInfoOutput', selectedPkg.label);
            if (action?.id === 'update') {
                const answer = await vscode.window.showInformationMessage((0, i18n_1.t)('prompt.confirmUpdate', selectedPkg.label, latestVersion || '最新'), { modal: false }, (0, i18n_1.t)('btn.update'));
                if (answer === (0, i18n_1.t)('btn.update'))
                    runTerminalCommand(`pnpm update ${selectedPkg.label}`, selectedPkg.fsPath);
            }
            if (action?.id === 'remove') {
                const answer = await vscode.window.showWarningMessage(`${(0, i18n_1.t)('prompt.confirmRemove')} '${selectedPkg.label}'?`, { modal: true }, (0, i18n_1.t)('btn.remove'));
                if (answer === (0, i18n_1.t)('btn.remove'))
                    runTerminalCommand(`pnpm remove ${selectedPkg.label}`, selectedPkg.fsPath);
            }
        }
        catch (_e) {
            vscode.window.showErrorMessage('package.json の読み込み中にエラーが発生しました。');
        }
    }), vscode.commands.registerCommand('modulist.searchNpmAndAction', async () => {
        const packageJsons = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
        if (packageJsons.length === 0)
            return vscode.window.showErrorMessage((0, i18n_1.t)('error.noWorkspace'));
        let targetFsPath = path.dirname(packageJsons[0].fsPath);
        if (packageJsons.length > 1) {
            const projectItems = packageJsons.map((uri) => ({
                label: path.basename(path.dirname(uri.fsPath)) || 'Root',
                description: uri.fsPath,
                fsPath: path.dirname(uri.fsPath),
            }));
            const selectedProject = await vscode.window.showQuickPick(projectItems, {
                placeHolder: 'インストール先のプロジェクトを選択してください',
            });
            if (!selectedProject)
                return;
            targetFsPath = selectedProject.fsPath;
        }
        const query = await vscode.window.showInputBox({
            prompt: (0, i18n_1.t)('prompt.searchNpm'),
            placeHolder: (0, i18n_1.t)('placeholder.searchNpm'),
        });
        if (!query)
            return;
        const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`);
        const data = (await res.json());
        if (!data.objects || data.objects.length === 0)
            return vscode.window.showInformationMessage((0, i18n_1.t)('info.notFound'));
        const items = data.objects.map((obj) => ({
            label: obj.package.name,
            description: `v${obj.package.version}`,
            detail: obj.package.description,
            pkgData: obj.package,
        }));
        const selectedPkgs = await vscode.window.showQuickPick(items, {
            placeHolder: (0, i18n_1.t)('placeholder.selectInstall'),
            canPickMany: true,
        });
        if (!selectedPkgs || selectedPkgs.length === 0)
            return;
        const pkgNames = selectedPkgs.map((p) => p.label).join(' ');
        const isMultiple = selectedPkgs.length > 1;
        const actionOptions = [
            { label: `$(plus) ${(0, i18n_1.t)('action.installDep')}`, id: 'add' },
            { label: `$(plus) ${(0, i18n_1.t)('action.installDev')}`, id: 'addDev' },
        ];
        if (!isMultiple) {
            actionOptions.push({ label: `$(output) ${(0, i18n_1.t)('action.showInfo')}`, id: 'info' });
            actionOptions.push({ label: `$(link-external) ${(0, i18n_1.t)('action.openNpm')}`, id: 'open' });
        }
        actionOptions.push({ label: `$(circle-slash) ${(0, i18n_1.t)('action.cancel')}`, id: 'cancel' });
        const actionPlaceHolder = isMultiple
            ? `${(0, i18n_1.t)('placeholder.selectAction')} (${selectedPkgs.length} packages)`
            : `${(0, i18n_1.t)('placeholder.selectAction')} ${pkgNames}`;
        const action = await vscode.window.showQuickPick(actionOptions, {
            placeHolder: actionPlaceHolder,
        });
        if (!action)
            return;
        switch (action.id) {
            case 'add':
            case 'addDev': {
                const isDev = action.id === 'addDev';
                const answer = await vscode.window.showInformationMessage((0, i18n_1.t)('prompt.confirmInstall', pkgNames, isDev ? (0, i18n_1.t)('label.devDep') : (0, i18n_1.t)('label.dep')), { modal: false }, (0, i18n_1.t)('btn.install'));
                if (answer === (0, i18n_1.t)('btn.install'))
                    runTerminalCommand(isDev ? `pnpm add -D ${pkgNames}` : `pnpm add ${pkgNames}`, targetFsPath);
                break;
            }
            case 'open':
                vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${pkgNames}`));
                break;
            case 'info':
                vscode.commands.executeCommand('modulist.showInfoOutput', pkgNames);
                break;
        }
    }), vscode.commands.registerCommand('modulist.add', () => vscode.commands.executeCommand('modulist.searchNpmAndAction')), vscode.commands.registerCommand('modulist.openInfo', (item) => vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${item.label}`))), vscode.commands.registerCommand('modulist.update', async (item) => {
        // ★ 変更: 早期リターンで undefined を排除
        if (!item.fsPath)
            return;
        const latestVersion = npmProvider.getOutdatedVersion(item.fsPath, item.label) || '最新';
        const answer = await vscode.window.showInformationMessage((0, i18n_1.t)('prompt.confirmUpdate', item.label, latestVersion), { modal: false }, (0, i18n_1.t)('btn.update'));
        if (answer === (0, i18n_1.t)('btn.update'))
            runTerminalCommand(`pnpm update ${item.label}`, item.fsPath);
    }), vscode.commands.registerCommand('modulist.remove', async (item) => {
        // ★ 変更: 早期リターンで undefined を排除
        if (!item.fsPath)
            return;
        const answer = await vscode.window.showWarningMessage(`${(0, i18n_1.t)('prompt.confirmRemove')} '${item.label}' ?`, { modal: true }, (0, i18n_1.t)('btn.remove'));
        if (answer === (0, i18n_1.t)('btn.remove'))
            runTerminalCommand(`pnpm remove ${item.label}`, item.fsPath);
    }));
    // ① スクリプトの実行
    vscode.commands.registerCommand('modulist.runScript', (item) => {
        // ★ 変更: 早期リターンで undefined を排除
        if (!item.fsPath)
            return;
        runTerminalCommand(`pnpm run ${item.label}`, item.fsPath);
    });
    // ② 一括アップデート
    vscode.commands.registerCommand('modulist.updateAll', async (item) => {
        // ★ 変更: 早期リターンで undefined を排除
        if (!item.fsPath)
            return;
        try {
            const packageJsonUri = vscode.Uri.file(path.join(item.fsPath, 'package.json'));
            const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
            const packageJson = JSON.parse(new TextDecoder().decode(fileData));
            const isDev = item.contextValue === 'category-devDep';
            const deps = isDev ? packageJson.devDependencies : packageJson.dependencies;
            if (!deps)
                return;
            // 古いパッケージだけを抽出
            const outdatedPkgs = Object.keys(deps).filter((dep) => npmProvider.getOutdatedVersion(item.fsPath, dep));
            if (outdatedPkgs.length === 0) {
                return vscode.window.showInformationMessage('アップデート可能なパッケージはありません。');
            }
            const answer = await vscode.window.showInformationMessage((0, i18n_1.t)('prompt.confirmUpdateAll', item.label), { modal: false }, (0, i18n_1.t)('btn.update'));
            if (answer === (0, i18n_1.t)('btn.update')) {
                runTerminalCommand(`pnpm update ${outdatedPkgs.join(' ')}`, item.fsPath);
            }
        }
        catch (_e) {
            vscode.window.showErrorMessage('一括アップデートに失敗しました。');
        }
    });
    // ③ 未使用パッケージの検出 (プログレスバー付き)
    vscode.commands.registerCommand('modulist.scanUnused', async (item) => {
        // ★ 変更: 早期リターンで undefined を排除
        if (!item.fsPath)
            return;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: (0, i18n_1.t)('prompt.scanningUnused'),
            cancellable: false,
        }, async () => {
            try {
                const { stdout } = await exec('npx depcheck --json', { cwd: item.fsPath });
                processDepcheckResult(stdout, item.fsPath);
            }
            catch (error) {
                const err = error;
                if (err.stdout) {
                    processDepcheckResult(err.stdout, item.fsPath);
                }
                else {
                    vscode.window.showErrorMessage('スキャンに失敗しました。npxコマンドが使用可能か確認してください。');
                }
            }
        });
    });
}
function runTerminalCommand(command, cwd) {
    const termName = 'Modulist';
    let terminal = vscode.window.terminals.find((t) => t.name === termName);
    if (!terminal)
        terminal = vscode.window.createTerminal(termName);
    terminal.show();
    if (cwd) {
        terminal.sendText(`cd "${cwd}"`);
    }
    terminal.sendText(command);
}
async function processDepcheckResult(stdout, fsPath) {
    try {
        const result = JSON.parse(stdout);
        const unused = [...(result.dependencies || []), ...(result.devDependencies || [])];
        if (unused.length === 0) {
            vscode.window.showInformationMessage((0, i18n_1.t)('info.noUnused'));
            return;
        }
        const answer = await vscode.window.showWarningMessage(`${(0, i18n_1.t)('prompt.confirmRemoveUnused', unused.length.toString())}\n\n${unused.join('\n')}`, { modal: true }, (0, i18n_1.t)('btn.remove'));
        if (answer === (0, i18n_1.t)('btn.remove')) {
            runTerminalCommand(`pnpm remove ${unused.join(' ')}`, fsPath);
        }
    }
    catch (_e) {
        vscode.window.showErrorMessage('スキャン結果の解析に失敗しました。');
    }
}
class NpmDependenciesProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    outdatedDeps = new Map();
    constructor() {
        this.checkOutdatedPackages();
    }
    getOutdatedVersion(fsPath, pkgName) {
        return this.outdatedDeps.get(`${fsPath}:${pkgName}`);
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
        this.checkOutdatedPackages();
    }
    async checkOutdatedPackages() {
        const packageJsons = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
        this.outdatedDeps.clear();
        for (const uri of packageJsons) {
            const dirPath = path.dirname(uri.fsPath);
            try {
                const { stdout } = await exec('pnpm outdated --json', {
                    cwd: dirPath,
                    maxBuffer: 1024 * 1024 * 5,
                });
                const data = JSON.parse(stdout);
                for (const key of Object.keys(data))
                    this.outdatedDeps.set(`${dirPath}:${key}`, data[key].latest);
            }
            catch (error) {
                const err = error;
                if (err.stdout) {
                    try {
                        const data = JSON.parse(err.stdout);
                        for (const key of Object.keys(data))
                            this.outdatedDeps.set(`${dirPath}:${key}`, data[key].latest);
                    }
                    catch (_e) {
                        /* ignore parse error */
                    }
                }
            }
        }
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async resolveTreeItem(item, element, _token) {
        if (element.contextValue === 'project' ||
            element.contextValue.startsWith('category') ||
            element.contextValue === 'script') {
            return item;
        }
        try {
            const response = await fetch(`https://registry.npmjs.org/${element.label}`);
            const downloadResponse = await fetch(`https://api.npmjs.org/downloads/point/last-week/${element.label}`);
            const data = (await response.json());
            const downloadData = (await downloadResponse.json());
            const description = data.description || '説明文なし';
            const latestVersion = data['dist-tags']?.latest || '不明';
            const license = data.license || 'ライセンス不明';
            const author = data.author?.name || '作成者不明';
            const readme = (0, functions_1.createReadmeText)(data.readme) || '';
            const homepage = data.homepage || '*ホームページがありません*';
            const repoUrl = data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || 'リポジトリ情報不明';
            const downloads = downloadData.downloads || '?';
            const tooltip = new vscode.MarkdownString('', true);
            tooltip.supportThemeIcons = true;
            tooltip.appendMarkdown(`### ${element.label} \`${element.version}\`\n\n`);
            tooltip.appendMarkdown(`$(info) Latest: **\`${latestVersion}\`** | $(law) \`${license}\` | $(cloud-download) 週間ダウンロード数: **${downloads}**\n\n`);
            tooltip.appendMarkdown(`$(accounts-view-bar-icon) 制作者: **${author}**\n\n`);
            tooltip.appendMarkdown(`$(info) 説明: *\`${description}\`*\n\n`);
            tooltip.appendMarkdown(`$(link-external) ホームページ: [開く](${homepage})\n\n`);
            tooltip.appendMarkdown(`$(mark-github) リポジトリ: [開く](${repoUrl})\n\n`);
            tooltip.appendMarkdown(`---\n\n`);
            tooltip.appendMarkdown(`[$(link-external) NPMで詳細を確認する](https://www.npmjs.com/package/${element.label})\n\n`);
            tooltip.appendMarkdown(`---\n\n`);
            tooltip.appendMarkdown(`${readme}\n\n`);
            item.tooltip = tooltip;
            return item;
        }
        catch (_error) {
            item.tooltip = new vscode.MarkdownString(`**${element.label}**\n\n情報の取得に失敗しました。`);
            return item;
        }
    }
    async getChildren(element) {
        if (!element) {
            const packageJsons = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
            if (packageJsons.length === 0)
                return [];
            return packageJsons.map((uri) => {
                const dirPath = path.dirname(uri.fsPath);
                const projectName = path.basename(dirPath) || 'Root';
                return new ModulistItem(projectName, vscode.TreeItemCollapsibleState.Expanded, 'project', dirPath);
            });
        }
        else if (element.contextValue === 'project') {
            return [
                new ModulistItem((0, i18n_1.t)('label.scripts'), vscode.TreeItemCollapsibleState.Expanded, 'category-script', element.fsPath),
                new ModulistItem((0, i18n_1.t)('label.dep'), vscode.TreeItemCollapsibleState.Expanded, 'category-dep', element.fsPath),
                new ModulistItem((0, i18n_1.t)('label.devDep'), vscode.TreeItemCollapsibleState.Expanded, 'category-devDep', element.fsPath),
            ];
        }
        else if (element.contextValue.startsWith('category')) {
            // ★ 変更: 早期リターンで undefined を排除
            if (!element.fsPath)
                return [];
            try {
                const packageJsonUri = vscode.Uri.file(path.join(element.fsPath, 'package.json'));
                const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
                const packageJson = JSON.parse(new TextDecoder().decode(fileData));
                if (element.contextValue === 'category-script') {
                    const scripts = packageJson.scripts;
                    if (!scripts)
                        return [];
                    return Object.keys(scripts).map((scriptName) => new ModulistItem(scriptName, vscode.TreeItemCollapsibleState.None, 'script', element.fsPath, scripts[scriptName]));
                }
                else {
                    const isDev = element.contextValue === 'category-devDep';
                    const deps = isDev ? packageJson.devDependencies : packageJson.dependencies;
                    if (!deps)
                        return [];
                    return Object.keys(deps).map((depName) => {
                        const isOutdated = this.outdatedDeps.has(`${element.fsPath}:${depName}`);
                        return new ModulistItem(depName, vscode.TreeItemCollapsibleState.None, isOutdated ? 'dependency-outdated' : 'dependency', element.fsPath, deps[depName], isDev);
                    });
                }
            }
            catch (_e) {
                return [];
            }
        }
        return [];
    }
}
class ModulistItem extends vscode.TreeItem {
    label;
    collapsibleState;
    contextValue;
    fsPath;
    version;
    isDev;
    constructor(label, collapsibleState, contextValue, fsPath, version, isDev = false) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.fsPath = fsPath;
        this.version = version;
        this.isDev = isDev;
        if (this.version)
            this.description = this.version;
        if (this.contextValue === 'project') {
            this.iconPath = new vscode.ThemeIcon('folder-library');
        }
        else if (this.contextValue.startsWith('category')) {
            this.iconPath = new vscode.ThemeIcon('symbol-class');
        }
        else if (this.contextValue === 'script') {
            this.iconPath = new vscode.ThemeIcon('terminal');
        }
        else if (this.contextValue === 'dependency-outdated') {
            this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('list.warningForeground'));
        }
        else if (this.isDev) {
            this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('problemsInfoIcon.foreground'));
        }
        else {
            this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('testing.iconPassed'));
        }
        if (this.contextValue.startsWith('dependency')) {
            this.command = {
                title: 'Open NPM Package Info',
                command: 'modulist.openInfo',
                arguments: [this],
            };
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map