import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { t } from './i18n';
import { createReadmeText } from './utils/functions';
import type {
  NpmRegistryResponse,
  NpmRepoDownloadsResponse,
  NpmSearchPackage,
  NpmSearchResponse,
} from './utils/types';

const exec = promisify(cp.exec);

// 出力パネルの名前も Modulist に変更
const outputChannel = vscode.window.createOutputChannel('Modulist Info');

export function activate(context: vscode.ExtensionContext) {
  const rootPath =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri
      : undefined;

  // ツリービューのプロバイダーを登録 (IDを modulistView に変更)
  const npmProvider = new NpmDependenciesProvider(rootPath);
  vscode.window.registerTreeDataProvider('modulistView', npmProvider);

  // package.jsonの変更を監視して自動リフレッシュ
  if (rootPath) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(rootPath, 'package.json'),
    );
    watcher.onDidChange(() => npmProvider.refresh());
    watcher.onDidCreate(() => npmProvider.refresh());
    watcher.onDidDelete(() => npmProvider.refresh());
    context.subscriptions.push(watcher);
  }

  // ★ 新設: どこからでも呼び出せる「出力パネルに詳細情報を表示」するコマンド
  vscode.commands.registerCommand(
    'modulist.showInfoOutput',
    async (target: string | Dependency) => {
      // ツリーのホバー等から呼ばれた場合は Dependency オブジェクト、QuickPickから呼ばれた場合は文字列になる
      const pkgName = typeof target === 'string' ? target : target.label;
      if (!pkgName) return;

      try {
        const res = await fetch(`https://registry.npmjs.org/${pkgName}`);
        const data = (await res.json()) as NpmRegistryResponse;

        outputChannel.clear();
        outputChannel.appendLine(`========================================`);
        outputChannel.appendLine(
          ` 📦 ${data.name || pkgName} (v${data['dist-tags']?.latest || 'Unknown'})`,
        );
        outputChannel.appendLine(`========================================`);
        outputChannel.appendLine(`📝 Description : ${data.description || 'N/A'}`);
        outputChannel.appendLine(`🔗 Publisher   : ${data.author?.name || 'Unknown'}`);
        outputChannel.appendLine(`🌐 NPM Site    : https://www.npmjs.com/package/${pkgName}`);

        const repoUrl = data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
        if (repoUrl) {
          outputChannel.appendLine(`💻 Repository  : ${repoUrl}`);
        }
        if (data.homepage) {
          outputChannel.appendLine(`🏠 Homepage    : ${data.homepage}`);
        }

        outputChannel.show(true);
      } catch (_error) {
        vscode.window.showErrorMessage(`'${pkgName}' の詳細情報の取得に失敗しました。`);
      }
    },
  );

  // コマンドの登録 (すべて modulist.* に変更)
  context.subscriptions.push(
    vscode.commands.registerCommand('modulist.refresh', () => npmProvider.refresh()),

    // インストール済みパッケージの検索とアクション
    vscode.commands.registerCommand('modulist.searchLocal', async () => {
      if (!rootPath) {
        vscode.window.showErrorMessage(t('error.noWorkspace'));
        return;
      }

      try {
        const packageJsonUri = vscode.Uri.joinPath(rootPath, 'package.json');
        const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJson = JSON.parse(new TextDecoder().decode(fileData));
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        const items = Object.keys(allDeps).map((name) => ({
          label: name,
          description: allDeps[name],
          iconPath: new vscode.ThemeIcon('package'),
        }));

        const selectedPkg = await vscode.window.showQuickPick(items, {
          placeHolder: t('placeholder.searchLocal'),
        });
        if (!selectedPkg) {
          return;
        }

        const latestVersion = npmProvider.getOutdatedVersion(selectedPkg.label);

        const actionOptions = [
          { label: `$(info) ${t('action.openNpm')}`, id: 'open' },
          { label: `$(output) ${t('action.showInfo')}`, id: 'info' },
        ];

        if (latestVersion) {
          // 最新バージョンが存在する（＝古い）場合のみ、アップデートボタンを追加
          actionOptions.push({ label: `$(sync) ${t('action.update')}`, id: 'update' });
        }

        actionOptions.push({ label: `$(trash) ${t('action.remove')}`, id: 'remove' });
        actionOptions.push({ label: `$(circle-slash) ${t('action.cancel')}`, id: 'cancel' });

        const action = await vscode.window.showQuickPick(actionOptions, {
          placeHolder: `${t('placeholder.selectAction')} ${selectedPkg.label}`,
        });

        if (action?.id === 'open') {
          vscode.env.openExternal(
            vscode.Uri.parse(`https://www.npmjs.com/package/${selectedPkg.label}`),
          );
        }
        if (action?.id === 'update') {
          const answer = await vscode.window.showInformationMessage(
            t('prompt.confirmUpdate', selectedPkg.label, latestVersion || '?'),
            { modal: false },
            t('btn.update'),
          );
          if (answer === t('btn.update')) {
            runTerminalCommand(`pnpm update ${selectedPkg.label}`);
          }
        }
        if (action?.id === 'remove') {
          const answer = await vscode.window.showWarningMessage(
            `${t('prompt.confirmRemove')} '${selectedPkg.label}'?`,
            { modal: true },
            t('btn.remove'),
          );
          if (answer === t('btn.remove')) {
            runTerminalCommand(`pnpm remove ${selectedPkg.label}`);
          }
        }
        if (action?.id === 'info') {
          // ★ 共通のコマンドを呼び出すように変更
          vscode.commands.executeCommand('modulist.showInfoOutput', selectedPkg.label);
        }
      } catch (_e) {
        vscode.window.showErrorMessage('package.json を読み込めませんでした。');
      }
    }),

    // NPM検索 ＆ アクション選択 (複数選択対応)
    vscode.commands.registerCommand('modulist.searchNpmAndAction', async () => {
      const query = await vscode.window.showInputBox({
        prompt: t('prompt.searchNpm'),
        placeHolder: t('placeholder.searchNpm'),
      });
      if (!query) return;

      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`,
      );
      const data = (await res.json()) as NpmSearchResponse;

      if (!data.objects || data.objects.length === 0) {
        vscode.window.showInformationMessage(t('info.notFound'));
        return;
      }

      type PkgQuickPickItem = vscode.QuickPickItem & { pkgData: NpmSearchPackage };
      const items: PkgQuickPickItem[] = data.objects.map((obj) => ({
        label: obj.package.name,
        description: `v${obj.package.version}`,
        detail: obj.package.description,
        pkgData: obj.package,
      }));

      const selectedPkgs = await vscode.window.showQuickPick(items, {
        placeHolder: t('placeholder.selectInstall'),
        canPickMany: true,
      });

      if (!selectedPkgs || selectedPkgs.length === 0) return;

      const pkgNames = selectedPkgs.map((p) => p.label).join(' ');
      const isMultiple = selectedPkgs.length > 1;

      const actionOptions = [
        { label: `$(plus) ${t('action.installDep')}`, id: 'add' },
        { label: `$(plus) ${t('action.installDev')}`, id: 'addDev' },
      ];

      if (!isMultiple) {
        actionOptions.push({ label: `$(output) ${t('action.showInfo')}`, id: 'info' });
        actionOptions.push({ label: `$(link-external) ${t('action.openNpm')}`, id: 'open' });
      }

      actionOptions.push({ label: `$(circle-slash) ${t('action.cancel')}`, id: 'cancel' });

      const actionPlaceHolder = isMultiple
        ? `${t('placeholder.selectAction')} (${selectedPkgs.length} packages)`
        : `${t('placeholder.selectAction')} ${pkgNames}`;

      const action = await vscode.window.showQuickPick(actionOptions, {
        placeHolder: actionPlaceHolder,
      });

      if (!action) {
        return;
      }

      switch (action.id) {
        case 'add':
        case 'addDev': {
          const isDev = action.id === 'addDev';
          const depType = isDev ? t('label.devDep') : t('label.dep');

          const answer = await vscode.window.showInformationMessage(
            t('prompt.confirmInstall', pkgNames, depType),
            { modal: false },
            t('btn.install'),
          );

          if (answer === t('btn.install')) {
            runTerminalCommand(isDev ? `pnpm add -D ${pkgNames}` : `pnpm add ${pkgNames}`);
          }
          break;
        }
        case 'open':
          vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${pkgNames}`));
          break;
        case 'info': {
          // ★ 共通のコマンドを呼び出すように変更
          vscode.commands.executeCommand('modulist.showInfoOutput', pkgNames);
          break;
        }
      }
    }),

    // 「追加」ボタンからのルーティング
    vscode.commands.registerCommand('modulist.add', () => {
      vscode.commands.executeCommand('modulist.searchNpmAndAction');
    }),

    // リストからの各種操作
    vscode.commands.registerCommand('modulist.openInfo', (item: Dependency) => {
      vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${item.label}`));
    }),

    vscode.commands.registerCommand('modulist.update', async (item: Dependency) => {
      const latestVersion = npmProvider.getOutdatedVersion(item.label) || '最新';

      const answer = await vscode.window.showInformationMessage(
        t('prompt.confirmUpdate', item.label, latestVersion),
        { modal: false },
        t('btn.update'),
      );

      if (answer === t('btn.update')) {
        runTerminalCommand(`pnpm update ${item.label}`);
      }
    }),

    vscode.commands.registerCommand('modulist.remove', async (item: Dependency) => {
      const answer = await vscode.window.showWarningMessage(
        t('prompt.confirmRemove', item.label),
        { modal: true },
        t('btn.remove'),
      );

      if (answer === t('btn.remove')) {
        runTerminalCommand(`pnpm remove ${item.label}`);
      }
    }),
  );
}

// ターミナルを実行する関数
function runTerminalCommand(command: string) {
  const termName = 'Modulist'; // ターミナル名も変更
  let terminal = vscode.window.terminals.find((t) => t.name === termName);
  if (!terminal) {
    terminal = vscode.window.createTerminal(termName);
  }
  terminal.show();
  terminal.sendText(command);
}

// TreeDataProviderの実装
class NpmDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | undefined> =
    new vscode.EventEmitter<Dependency | undefined | undefined>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | undefined> =
    this._onDidChangeTreeData.event;

  // ★ 新設: アウトデイト（古い）パッケージのリストを保持
  private outdatedDeps = new Map<string, string>();

  constructor(private workspaceRoot: vscode.Uri | undefined) {
    this.checkOutdatedPackages();
  }

  public getOutdatedVersion(pkgName: string): string | undefined {
    return this.outdatedDeps.get(pkgName);
  }

  refresh(): void {
    // 1. まずローカルの package.json だけで即座にツリーを再描画
    this._onDidChangeTreeData.fire(undefined);
    // 2. 裏で非同期にアップデート確認を走らせ、完了したらUIを更新
    this.checkOutdatedPackages();
  }

  // ★ 新設: pnpm outdated を実行して古いパッケージを特定する
  private async checkOutdatedPackages() {
    if (!this.workspaceRoot) return;
    try {
      // pnpm outdated --json をワークスペース内で実行
      const { stdout } = await exec('pnpm outdated --json', {
        cwd: this.workspaceRoot.fsPath,
        maxBuffer: 1024 * 1024 * 5, // 万が一出力が多い時のためのバッファ
      });
      const data = JSON.parse(stdout);
      this.outdatedDeps.clear();
      for (const key of Object.keys(data)) {
        this.outdatedDeps.set(key, data[key].latest); // ★ latestバージョンを保存
      }
    } catch (error: unknown) {
      // pnpm outdated はアップデートがあると終了コード 1 になるため catch に入る
      const err = error as { stdout?: string };
      if (err.stdout) {
        try {
          const data = JSON.parse(err.stdout);
          this.outdatedDeps.clear();
          for (const key of Object.keys(data)) {
            this.outdatedDeps.set(key, data[key].latest); // ★ latestバージョンを保存
          }
        } catch (_e) {
          this.outdatedDeps.clear();
        }
      } else {
        this.outdatedDeps.clear();
      }
    }
    // 古いパッケージのリストが完成したら、もう一度ツリーを再描画（アップデートボタンが出現）
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  async resolveTreeItem(
    item: Dependency,
    element: Dependency,
    _token: vscode.CancellationToken,
  ): Promise<vscode.TreeItem> {
    if (element.contextValue === 'category') {
      return item;
    }

    try {
      const response = await fetch(`https://registry.npmjs.org/${element.label}`);
      const downloadResponse = await fetch(
        `https://api.npmjs.org/downloads/point/last-week/${element.label}`,
      );
      const rawData = await response.json();
      const data = rawData as NpmRegistryResponse;
      const downloadData = (await downloadResponse.json()) as NpmRepoDownloadsResponse;

      const description = data.description || '説明文なし';
      const latestVersion = data['dist-tags']?.latest || '不明';
      const license = data.license || 'ライセンス不明';
      const author = data.author?.name || '作成者不明';
      const readme = createReadmeText(data.readme as string) || '';
      const homepage = data.homepage || '*ホームページがありません*';
      const repoUrl =
        data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || 'リポジトリ情報不明';

      const downloads = downloadData.downloads || '?';

      const tooltip = new vscode.MarkdownString('', true);
      tooltip.supportThemeIcons = true;

      tooltip.appendMarkdown(`### ${element.label} \`${element.version}\`\n\n`);
      tooltip.appendMarkdown(
        `$(info) Latest: **\`${latestVersion}\`** | $(law) \`${license}\` | $(cloud-download) 週間ダウンロード数: **${downloads}**\n\n`,
      );

      tooltip.appendMarkdown(`$(accounts-view-bar-icon) 制作者: **${author}**\n\n`);
      tooltip.appendMarkdown(`$(info) 説明: *\`${description}\`*\n\n`);
      tooltip.appendMarkdown(`$(link-external) ホームページ: [開く](${homepage})\n\n`);
      tooltip.appendMarkdown(`$(mark-github) リポジトリ: [開く](${repoUrl})\n\n`);
      tooltip.appendMarkdown(`---\n\n`);
      tooltip.appendMarkdown(
        `[$(link-external) NPMで詳細を確認する](https://www.npmjs.com/package/${element.label})\n\n`,
      );
      tooltip.appendMarkdown(`---\n\n`);
      tooltip.appendMarkdown(`${readme}\n\n`);

      item.tooltip = tooltip;
      return item;
    } catch (_error) {
      const fallbackTooltip = new vscode.MarkdownString(
        `**${element.label}**\n\n情報の取得に失敗しました。`,
      );
      item.tooltip = fallbackTooltip;
      return item;
    }
  }

  async getChildren(element?: Dependency): Promise<Dependency[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace found');
      return Promise.resolve([]);
    }

    const packageJsonUri = vscode.Uri.joinPath(this.workspaceRoot, 'package.json');

    if (element) {
      try {
        const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJson = JSON.parse(new TextDecoder().decode(fileData));

        // ★ 変更: 翻訳されたラベルを使って判定する
        const isDev = element.label === t('label.devDep');
        const deps = isDev ? packageJson.devDependencies : packageJson.dependencies;

        if (!deps) return [];

        return Object.keys(deps).map((depName) => {
          const isOutdated = this.outdatedDeps.has(depName);
          return new Dependency(
            depName,
            deps[depName],
            vscode.TreeItemCollapsibleState.None,
            isOutdated ? 'dependency-outdated' : 'dependency',
            isDev, // ★ 追加: 開発用かどうかのフラグを渡す
          );
        });
      } catch (_e) {
        return [];
      }
    } else {
      // ★ 変更: カテゴリの表示名に i18n の t() 関数を適用
      return [
        new Dependency(t('label.dep'), '', vscode.TreeItemCollapsibleState.Expanded, 'category'),
        new Dependency(t('label.devDep'), '', vscode.TreeItemCollapsibleState.Expanded, 'category'),
      ];
    }
  }
}

// ツリーに表示するアイテムの定義
class Dependency extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly version: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly isDev: boolean = false,
  ) {
    super(label, collapsibleState);
    this.description = this.version;

    // ★ 変更: contextValue と isDev フラグによってアイコンの色を切り替える
    if (this.contextValue === 'category') {
      this.iconPath = new vscode.ThemeIcon('symbol-class');
    } else if (this.contextValue === 'dependency-outdated') {
      // アップデートあり: 警告色（黄色/オレンジ）
      this.iconPath = new vscode.ThemeIcon(
        'package',
        new vscode.ThemeColor('list.warningForeground'),
      );
    } else if (this.isDev) {
      // Dev Dependencies: 通常のキーワード色（青/グレーなど）
      this.iconPath = new vscode.ThemeIcon(
        'package',
        new vscode.ThemeColor('problemsInfoIcon.foreground'),
      );
    } else {
      // Dependencies: 緑色（テスト成功時の緑色を利用）
      this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('testing.iconPassed'));
    }

    if (this.contextValue !== 'category') {
      this.command = {
        title: 'Open NPM Package Info',
        command: 'modulist.openInfo',
        arguments: [this],
      };
    }
  }
}

export function deactivate() {}
