import * as cp from 'node:child_process';
import * as path from 'node:path';
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
const outputChannel = vscode.window.createOutputChannel('Modulist Info');

export function activate(context: vscode.ExtensionContext) {
  const npmProvider = new NpmDependenciesProvider();
  vscode.window.registerTreeDataProvider('modulistView', npmProvider);

  // ワークスペース内のすべての package.json の変更を監視
  const watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  watcher.onDidChange(() => npmProvider.refresh());
  watcher.onDidCreate(() => npmProvider.refresh());
  watcher.onDidDelete(() => npmProvider.refresh());
  context.subscriptions.push(watcher);

  vscode.commands.registerCommand(
    'modulist.showInfoOutput',
    async (target: string | ModulistItem) => {
      const pkgName = typeof target === 'string' ? target : target.label;
      if (!pkgName) return;

      try {
        const res = await fetch(`https://registry.npmjs.org/${pkgName}`);
        const data = (await res.json()) as NpmRegistryResponse;

        const config = vscode.workspace.getConfiguration('modulist');
        const showBundleSize = config.get<boolean>('showBundleSize', true);

        let bundleSizeText = t('info.disabledInSettings');
        if (showBundleSize) {
          try {
            const bpRes = await fetch(
              `https://bundlephobia.com/api/size?package=${encodeURIComponent(pkgName)}`,
              {
                headers: { 'User-Agent': 'VSCode-Modulist-Extension' },
              },
            );
            if (bpRes.ok) {
              const bpData = (await bpRes.json()) as { size: number; gzip: number };
              bundleSizeText = `${formatBytes(bpData.size)} (${t('info.minified')}) / ${formatBytes(bpData.gzip)} (${t('info.gzipped')})`;
            } else {
              bundleSizeText = t('info.noData');
            }
          } catch (_e) {
            /* ignore */
          }
        }

        outputChannel.clear();
        outputChannel.appendLine(`========================================`);
        outputChannel.appendLine(
          ` 📦 ${data.name || pkgName} (v${data['dist-tags']?.latest || t('info.unknown')})`,
        );
        outputChannel.appendLine(`========================================`);
        outputChannel.appendLine(
          `📝 ${t('info.description')} : ${data.description || t('info.none')}`,
        );
        outputChannel.appendLine(
          `🔗 ${t('info.publisher')}   : ${data.author?.name || t('info.unknown')}`,
        );
        outputChannel.appendLine(`📦 ${t('info.bundleSize')} : ${bundleSizeText}`);
        outputChannel.appendLine(
          `🌐 ${t('info.npmSite')}    : https://www.npmjs.com/package/${pkgName}`,
        );

        const repoUrl = data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
        if (repoUrl) outputChannel.appendLine(`💻 ${t('info.repository')}  : ${repoUrl}`);
        if (data.homepage)
          outputChannel.appendLine(`🏠 ${t('info.homepage')}    : ${data.homepage}`);

        outputChannel.show(true);
      } catch (_error) {
        vscode.window.showErrorMessage(`'${pkgName}' の詳細情報の取得に失敗しました。`);
      }
    },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('modulist.refresh', () => npmProvider.refresh()),

    vscode.commands.registerCommand('modulist.searchLocal', async () => {
      try {
        const packageJsons = await vscode.workspace.findFiles(
          '**/package.json',
          '**/node_modules/**',
        );
        if (packageJsons.length === 0) {
          return vscode.window.showErrorMessage(t('error.noWorkspace'));
        }

        const items: (vscode.QuickPickItem & { fsPath: string })[] = [];
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
          placeHolder: t('placeholder.searchLocal'),
        });
        if (!selectedPkg) return;

        const latestVersion = npmProvider.getOutdatedVersion(selectedPkg.fsPath, selectedPkg.label);

        const actionOptions = [
          { label: `$(info) ${t('action.openNpm')}`, id: 'open' },
          { label: `$(output) ${t('action.showInfo')}`, id: 'info' },
        ];
        if (latestVersion)
          actionOptions.push({ label: `$(sync) ${t('action.update')}`, id: 'update' });
        actionOptions.push({ label: `$(trash) ${t('action.remove')}`, id: 'remove' });
        actionOptions.push({ label: `$(circle-slash) ${t('action.cancel')}`, id: 'cancel' });

        const action = await vscode.window.showQuickPick(actionOptions, {
          placeHolder: `${t('placeholder.selectAction')} ${selectedPkg.label}`,
        });

        if (action?.id === 'open')
          vscode.env.openExternal(
            vscode.Uri.parse(`https://www.npmjs.com/package/${selectedPkg.label}`),
          );
        if (action?.id === 'info')
          vscode.commands.executeCommand('modulist.showInfoOutput', selectedPkg.label);
        if (action?.id === 'update') {
          const answer = await vscode.window.showInformationMessage(
            t('prompt.confirmUpdate', selectedPkg.label, latestVersion || '最新'),
            { modal: false },
            t('btn.update'),
          );
          if (answer === t('btn.update'))
            runTerminalCommand(`pnpm update ${selectedPkg.label}`, selectedPkg.fsPath);
        }
        if (action?.id === 'remove') {
          const answer = await vscode.window.showWarningMessage(
            `${t('prompt.confirmRemove')} '${selectedPkg.label}'?`,
            { modal: true },
            t('btn.remove'),
          );
          if (answer === t('btn.remove'))
            runTerminalCommand(`pnpm remove ${selectedPkg.label}`, selectedPkg.fsPath);
        }
      } catch (_e) {
        vscode.window.showErrorMessage('package.json の読み込み中にエラーが発生しました。');
      }
    }),

    vscode.commands.registerCommand('modulist.searchNpmAndAction', async () => {
      const packageJsons = await vscode.workspace.findFiles(
        '**/package.json',
        '**/node_modules/**',
      );
      if (packageJsons.length === 0) return vscode.window.showErrorMessage(t('error.noWorkspace'));

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
        if (!selectedProject) return;
        targetFsPath = selectedProject.fsPath;
      }

      const query = await vscode.window.showInputBox({
        prompt: t('prompt.searchNpm'),
        placeHolder: t('placeholder.searchNpm'),
      });
      if (!query) return;

      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`,
      );
      const data = (await res.json()) as NpmSearchResponse;

      if (!data.objects || data.objects.length === 0)
        return vscode.window.showInformationMessage(t('info.notFound'));

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
      if (!action) return;

      switch (action.id) {
        case 'add':
        case 'addDev': {
          const isDev = action.id === 'addDev';
          const answer = await vscode.window.showInformationMessage(
            t('prompt.confirmInstall', pkgNames, isDev ? t('label.devDep') : t('label.dep')),
            { modal: false },
            t('btn.install'),
          );
          if (answer === t('btn.install'))
            runTerminalCommand(
              isDev ? `pnpm add -D ${pkgNames}` : `pnpm add ${pkgNames}`,
              targetFsPath,
            );
          break;
        }
        case 'open':
          vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${pkgNames}`));
          break;
        case 'info':
          vscode.commands.executeCommand('modulist.showInfoOutput', pkgNames);
          break;
      }
    }),

    vscode.commands.registerCommand('modulist.add', () =>
      vscode.commands.executeCommand('modulist.searchNpmAndAction'),
    ),
    vscode.commands.registerCommand('modulist.openInfo', (item: ModulistItem) =>
      vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${item.label}`)),
    ),

    vscode.commands.registerCommand('modulist.update', async (item: ModulistItem) => {
      // ★ 変更: 早期リターンで undefined を排除
      if (!item.fsPath) return;
      const latestVersion = npmProvider.getOutdatedVersion(item.fsPath, item.label) || '最新';
      const answer = await vscode.window.showInformationMessage(
        t('prompt.confirmUpdate', item.label, latestVersion),
        { modal: false },
        t('btn.update'),
      );
      if (answer === t('btn.update')) runTerminalCommand(`pnpm update ${item.label}`, item.fsPath);
    }),

    vscode.commands.registerCommand('modulist.remove', async (item: ModulistItem) => {
      // ★ 変更: 早期リターンで undefined を排除
      if (!item.fsPath) return;
      const answer = await vscode.window.showWarningMessage(
        `${t('prompt.confirmRemove')} '${item.label}' ?`,
        { modal: true },
        t('btn.remove'),
      );
      if (answer === t('btn.remove')) runTerminalCommand(`pnpm remove ${item.label}`, item.fsPath);
    }),
  );

  // ① スクリプトの実行
  vscode.commands.registerCommand('modulist.runScript', (item: ModulistItem) => {
    // ★ 変更: 早期リターンで undefined を排除
    if (!item.fsPath) return;
    runTerminalCommand(`pnpm run ${item.label}`, item.fsPath);
  });

  // ② 一括アップデート
  vscode.commands.registerCommand('modulist.updateAll', async (item: ModulistItem) => {
    // ★ 変更: 早期リターンで undefined を排除
    if (!item.fsPath) return;
    try {
      const packageJsonUri = vscode.Uri.file(path.join(item.fsPath, 'package.json'));
      const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(new TextDecoder().decode(fileData));

      const isDev = item.contextValue === 'category-devDep';
      const deps = isDev ? packageJson.devDependencies : packageJson.dependencies;
      if (!deps) return;

      // 古いパッケージだけを抽出
      const outdatedPkgs = Object.keys(deps).filter((dep) =>
        npmProvider.getOutdatedVersion(item.fsPath as string, dep),
      );

      if (outdatedPkgs.length === 0) {
        return vscode.window.showInformationMessage('アップデート可能なパッケージはありません。');
      }

      const answer = await vscode.window.showInformationMessage(
        t('prompt.confirmUpdateAll', item.label),
        { modal: false },
        t('btn.update'),
      );

      if (answer === t('btn.update')) {
        runTerminalCommand(`pnpm update ${outdatedPkgs.join(' ')}`, item.fsPath);
      }
    } catch (_e) {
      vscode.window.showErrorMessage('一括アップデートに失敗しました。');
    }
  });

  // ③ 未使用パッケージの検出 (プログレスバー付き)
  vscode.commands.registerCommand('modulist.scanUnused', async (item: ModulistItem) => {
    // ★ 変更: 早期リターンで undefined を排除
    if (!item.fsPath) return;
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('prompt.scanningUnused'),
        cancellable: false,
      },
      async () => {
        try {
          const { stdout } = await exec('npx depcheck --json', { cwd: item.fsPath });
          processDepcheckResult(stdout, item.fsPath as string);
        } catch (error: unknown) {
          const err = error as { stdout?: string };
          if (err.stdout) {
            processDepcheckResult(err.stdout, item.fsPath as string);
          } else {
            vscode.window.showErrorMessage(
              'スキャンに失敗しました。npxコマンドが使用可能か確認してください。',
            );
          }
        }
      },
    );
  });

  // ④ 特定のバージョンをインストール（ダウングレード/ロールバック）
  vscode.commands.registerCommand('modulist.changeVersion', async (item: ModulistItem) => {
    if (!item.fsPath) return; // 安全確認

    try {
      // NPM APIから全バージョン履歴を取得
      const res = await fetch(`https://registry.npmjs.org/${item.label}`);
      const data = (await res.json()) as { versions: Record<string, unknown> };

      // バージョン一覧を取得し、新しい順（降順）に並び替え
      const versions = Object.keys(data.versions).reverse();

      const selectedVersion = await vscode.window.showQuickPick(versions, {
        placeHolder: `${t('prompt.selectVersion')} (${item.label})`,
      });

      if (selectedVersion) {
        // Dev Dependency の場合は -D フラグをつける
        const flag = item.isDev ? '-D ' : '';
        runTerminalCommand(`pnpm add ${flag}${item.label}@${selectedVersion}`, item.fsPath);
      }
    } catch (_e) {
      vscode.window.showErrorMessage('バージョン履歴の取得に失敗しました。');
    }
  });

  // ⑤ バージョンの固定 / 固定解除 (Pin / Unpin)
  vscode.commands.registerCommand('modulist.togglePin', async (item: ModulistItem) => {
    if (!item.fsPath) return; // 安全確認

    try {
      // package.json を直接読み込む
      const packageJsonUri = vscode.Uri.file(path.join(item.fsPath, 'package.json'));
      const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(new TextDecoder().decode(fileData));

      const depType = item.isDev ? 'devDependencies' : 'dependencies';
      const currentVersion = packageJson[depType][item.label];

      if (!currentVersion) return;

      let newVersion = currentVersion;
      let isPinning = false;

      // すでに ^ や ~ が付いている場合は外す（固定する）
      if (currentVersion.startsWith('^') || currentVersion.startsWith('~')) {
        newVersion = currentVersion.replace(/^[\^~]/, '');
        isPinning = true;
      } else {
        // 付いていない場合は ^ をつける（固定解除する）
        newVersion = `^${currentVersion}`;
      }

      // package.json のオブジェクトを更新
      packageJson[depType][item.label] = newVersion;

      // 変更をファイルに書き込む (整形して保存)
      const newContent = new TextEncoder().encode(`${JSON.stringify(packageJson, null, 2)}\n`);
      await vscode.workspace.fs.writeFile(packageJsonUri, newContent);

      // 結果を通知
      if (isPinning) {
        vscode.window.showInformationMessage(t('info.pinned', item.label, newVersion));
      } else {
        vscode.window.showInformationMessage(t('info.unpinned', item.label, newVersion));
      }
    } catch (_e) {
      vscode.window.showErrorMessage('package.json の更新に失敗しました。');
    }
  });

  // ⑦ チェンジログ（リリースノート）を開く
  vscode.commands.registerCommand('modulist.openChangelog', async (item: ModulistItem) => {
    if (!item.fsPath) return;

    try {
      const res = await fetch(`https://registry.npmjs.org/${item.label}`);
      const data = (await res.json()) as NpmRegistryResponse;

      let repoUrl = data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');

      if (repoUrl) {
        // git:// や git@github.com: などの形式を標準の https:// に変換
        repoUrl = repoUrl
          .replace(/^git:\/\//, 'https://')
          .replace(/^git@github\.com:/, 'https://github.com/');

        // GitHub や GitLab の場合は、直接 releases ページを開く
        if (repoUrl.includes('github.com') || repoUrl.includes('gitlab.com')) {
          repoUrl = `${repoUrl}/releases`;
        }

        vscode.env.openExternal(vscode.Uri.parse(repoUrl));
      } else {
        vscode.window.showInformationMessage('このパッケージのリポジトリ情報が見つかりません。');
      }
    } catch (_e) {
      vscode.window.showErrorMessage('情報の取得に失敗しました。');
    }
  });
}

function runTerminalCommand(command: string, cwd?: string) {
  const termName = 'Modulist';
  let terminal = vscode.window.terminals.find((t) => t.name === termName);
  if (!terminal) terminal = vscode.window.createTerminal(termName);
  terminal.show();
  if (cwd) {
    terminal.sendText(`cd "${cwd}"`);
  }
  terminal.sendText(command);
}

async function processDepcheckResult(stdout: string, fsPath: string) {
  try {
    const result = JSON.parse(stdout);
    const unused = [...(result.dependencies || []), ...(result.devDependencies || [])];

    if (unused.length === 0) {
      vscode.window.showInformationMessage(t('info.noUnused'));
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `${t('prompt.confirmRemoveUnused', unused.length.toString())}\n\n${unused.join('\n')}`,
      { modal: true },
      t('btn.remove'),
    );

    if (answer === t('btn.remove')) {
      runTerminalCommand(`pnpm remove ${unused.join(' ')}`, fsPath);
    }
  } catch (_e) {
    vscode.window.showErrorMessage('スキャン結果の解析に失敗しました。');
  }
}

class NpmDependenciesProvider implements vscode.TreeDataProvider<ModulistItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ModulistItem | undefined | undefined> =
    new vscode.EventEmitter<ModulistItem | undefined | undefined>();
  readonly onDidChangeTreeData: vscode.Event<ModulistItem | undefined | undefined> =
    this._onDidChangeTreeData.event;

  private outdatedDeps = new Map<string, string>();

  constructor() {
    this.checkOutdatedPackages();
  }

  public getOutdatedVersion(fsPath: string, pkgName: string): string | undefined {
    return this.outdatedDeps.get(`${fsPath}:${pkgName}`);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
    this.checkOutdatedPackages();
  }

  private async checkOutdatedPackages() {
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
      } catch (error: unknown) {
        const err = error as { stdout?: string };
        if (err.stdout) {
          try {
            const data = JSON.parse(err.stdout);
            for (const key of Object.keys(data))
              this.outdatedDeps.set(`${dirPath}:${key}`, data[key].latest);
          } catch (_e) {
            /* ignore parse error */
          }
        }
      }
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ModulistItem): vscode.TreeItem {
    return element;
  }

  async resolveTreeItem(
    item: ModulistItem,
    element: ModulistItem,
    _token: vscode.CancellationToken,
  ): Promise<vscode.TreeItem> {
    if (
      element.contextValue === 'project' ||
      element.contextValue.startsWith('category') ||
      element.contextValue === 'script'
    ) {
      return item;
    }

    try {
      const response = await fetch(`https://registry.npmjs.org/${element.label}`);
      const downloadResponse = await fetch(
        `https://api.npmjs.org/downloads/point/last-week/${element.label}`,
      );
      const data = (await response.json()) as NpmRegistryResponse;
      const downloadData = (await downloadResponse.json()) as NpmRepoDownloadsResponse;

      const description = data.description || t('info.none');
      const latestVersion = data['dist-tags']?.latest || t('info.unknown');
      const license = data.license || t('info.unknown');
      const author = data.author?.name || t('info.unknown');
      const homepage = data.homepage || `*${t('info.none')}*`;
      const repoUrl =
        data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || t('info.unknown');
      const downloads = downloadData.downloads || '?';

      const config = vscode.workspace.getConfiguration('modulist');
      const showBundleSize = config.get<boolean>('showBundleSize', true);
      const showReadme = config.get<boolean>('showReadme', true); // ★ 追加: READMEの設定を取得

      let bundleSizeText = t('info.disabledInSettings');
      if (showBundleSize) {
        bundleSizeText = t('info.noData');
        try {
          const bpRes = await fetch(
            `https://bundlephobia.com/api/size?package=${encodeURIComponent(element.label)}`,
            {
              headers: { 'User-Agent': 'VSCode-Modulist-Extension' },
            },
          );
          if (bpRes.ok) {
            const bpData = (await bpRes.json()) as { size: number; gzip: number };
            bundleSizeText = `**${formatBytes(bpData.size)}** (${t('info.minified')}) / **${formatBytes(bpData.gzip)}** (${t('info.gzipped')})`;
          }
        } catch (_e) {
          /* ignore */
        }
      }

      const tooltip = new vscode.MarkdownString('', true);
      tooltip.supportThemeIcons = true;
      tooltip.appendMarkdown(`### ${element.label} \`${element.version}\`\n\n`);
      tooltip.appendMarkdown(
        `$(info) ${t('info.latestVersion')}: **\`${latestVersion}\`** | $(law) \`${license}\` | $(cloud-download) ${t('info.weeklyDownloads')}: **${downloads}**\n\n`,
      );
      tooltip.appendMarkdown(`$(package) **${t('info.bundleSize')}**: ${bundleSizeText}\n\n`);
      tooltip.appendMarkdown(`$(accounts-view-bar-icon) ${t('info.author')}: **${author}**\n\n`);
      tooltip.appendMarkdown(`$(info) ${t('info.description')}: *\`${description}\`*\n\n`);
      tooltip.appendMarkdown(
        `$(link-external) ${t('info.homepage')}: [${t('info.open')}](${homepage})\n\n`,
      );
      tooltip.appendMarkdown(
        `$(mark-github) ${t('info.repository')}: [${t('info.open')}](${repoUrl})\n\n`,
      );
      tooltip.appendMarkdown(`---\n\n`);

      // ★ 変更: 設定が true の時だけ README をパースして追加
      if (showReadme && data.readme) {
        const readme = createReadmeText(data.readme as string) || '';
        tooltip.appendMarkdown(`${readme}\n\n`);
      }

      item.tooltip = tooltip;
      return item;
    } catch (_error) {
      item.tooltip = new vscode.MarkdownString(
        `**${element.label}**\n\n情報の取得に失敗しました。`,
      );
      return item;
    }
  }

  async getChildren(element?: ModulistItem): Promise<ModulistItem[]> {
    if (!element) {
      const packageJsons = await vscode.workspace.findFiles(
        '**/package.json',
        '**/node_modules/**',
      );
      if (packageJsons.length === 0) return [];
      return packageJsons.map((uri) => {
        const dirPath = path.dirname(uri.fsPath);
        const projectName = path.basename(dirPath) || 'Root';
        return new ModulistItem(
          projectName,
          vscode.TreeItemCollapsibleState.Expanded,
          'project',
          dirPath,
        );
      });
    } else if (element.contextValue === 'project') {
      return [
        new ModulistItem(
          t('label.scripts'),
          vscode.TreeItemCollapsibleState.Expanded,
          'category-script',
          element.fsPath,
        ),
        new ModulistItem(
          t('label.dep'),
          vscode.TreeItemCollapsibleState.Expanded,
          'category-dep',
          element.fsPath,
        ),
        new ModulistItem(
          t('label.devDep'),
          vscode.TreeItemCollapsibleState.Expanded,
          'category-devDep',
          element.fsPath,
        ),
      ];
    } else if (element.contextValue.startsWith('category')) {
      // ★ 変更: 早期リターンで undefined を排除
      if (!element.fsPath) return [];

      try {
        const packageJsonUri = vscode.Uri.file(path.join(element.fsPath, 'package.json'));
        const fileData = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJson = JSON.parse(new TextDecoder().decode(fileData));

        if (element.contextValue === 'category-script') {
          const scripts = packageJson.scripts;
          if (!scripts) return [];
          return Object.keys(scripts).map(
            (scriptName) =>
              new ModulistItem(
                scriptName,
                vscode.TreeItemCollapsibleState.None,
                'script',
                element.fsPath,
                scripts[scriptName],
              ),
          );
        } else {
          const isDev = element.contextValue === 'category-devDep';
          const deps = isDev ? packageJson.devDependencies : packageJson.dependencies;
          if (!deps) return [];
          return Object.keys(deps).map((depName) => {
            const isOutdated = this.outdatedDeps.has(`${element.fsPath}:${depName}`);
            return new ModulistItem(
              depName,
              vscode.TreeItemCollapsibleState.None,
              isOutdated ? 'dependency-outdated' : 'dependency',
              element.fsPath,
              deps[depName],
              isDev,
            );
          });
        }
      } catch (_e) {
        return [];
      }
    }
    return [];
  }
}

class ModulistItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly fsPath?: string,
    public readonly version?: string,
    public readonly isDev: boolean = false,
  ) {
    super(label, collapsibleState);
    if (this.version) this.description = this.version;

    if (this.contextValue === 'project') {
      this.iconPath = new vscode.ThemeIcon('folder-library');
    } else if (this.contextValue.startsWith('category')) {
      this.iconPath = new vscode.ThemeIcon('symbol-class');
    } else if (this.contextValue === 'script') {
      this.iconPath = new vscode.ThemeIcon('terminal');
    } else if (this.contextValue === 'dependency-outdated') {
      this.iconPath = new vscode.ThemeIcon(
        'package',
        new vscode.ThemeColor('list.warningForeground'),
      );
    } else if (this.isDev) {
      this.iconPath = new vscode.ThemeIcon(
        'package',
        new vscode.ThemeColor('problemsInfoIcon.foreground'),
      );
    } else {
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

export function deactivate() {}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
