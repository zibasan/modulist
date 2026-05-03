import * as vscode from 'vscode';
import { createReadmeText } from './utils/functions';
import type { NpmRegistryResponse, NpmRepoDownloadsResponse } from './utils/types';

export function activate(context: vscode.ExtensionContext) {
  const rootPath =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri
      : undefined;

  // ツリービューのプロバイダーを登録
  const npmProvider = new NpmDependenciesProvider(rootPath);
  vscode.window.registerTreeDataProvider('manageNpmPkgView', npmProvider);

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

  // コマンドの登録
  context.subscriptions.push(
    vscode.commands.registerCommand('manageNpmPkg.refresh', () => npmProvider.refresh()),
    vscode.commands.registerCommand('manageNpmPkg.openInfo', (item: Dependency) => {
      vscode.env.openExternal(vscode.Uri.parse(`https://www.npmjs.com/package/${item.label}`));
    }),
    vscode.commands.registerCommand('manageNpmPkg.update', (item: Dependency) => {
      runTerminalCommand(`pnpm update ${item.label}`);
    }),
    vscode.commands.registerCommand('manageNpmPkg.remove', (item: Dependency) => {
      runTerminalCommand(`pnpm remove ${item.label}`);
    }),
  );
}

// ターミナルを実行する関数
function runTerminalCommand(command: string) {
  const termName = 'Manage NPM Pkg';
  let terminal = vscode.window.terminals.find((t) => t.name === termName);
  if (!terminal) {
    terminal = vscode.window.createTerminal(termName);
  }
  terminal.show();
  terminal.sendText(command);
}

// TreeDataProviderの実装（VS Codeのサイドバーにデータを渡すクラス）
class NpmDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | undefined> =
    new vscode.EventEmitter<Dependency | undefined | undefined>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | undefined> =
    this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: vscode.Uri | undefined) {}

  refresh(): void {
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
    // カテゴリー（Dependenciesというフォルダ部分）の場合は何もしない
    if (element.contextValue === 'category') {
      return item;
    }

    try {
      // NPMの公式APIから、そのパッケージの情報を取得
      const response = await fetch(`https://registry.npmjs.org/${element.label}`);
      const downloadResponse = await fetch(
        `https://api.npmjs.org/downloads/point/last-week/${element.label}`,
      );
      const rawData = await response.json();
      const data = rawData as NpmRegistryResponse;
      const downloadData = (await downloadResponse.json()) as NpmRepoDownloadsResponse;

      // 取得したデータの中から必要な情報を抜き出す
      const description = data.description || '説明文なし';
      const latestVersion = data['dist-tags']?.latest || '不明';
      const license = data.license || 'ライセンス不明';
      const author = data.author?.name || '作成者不明';
      const readme = createReadmeText(data.readme as string) || '';
      const homepage = data.homepage || '*ホームページがありません*';
      const repoUrl =
        data.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || 'リポジトリ情報不明';

      const downloads = downloadData.downloads || '?';

      // MarkdownStringを作って、情報を埋め込んでいく
      const tooltip = new vscode.MarkdownString('', true);
      tooltip.supportThemeIcons = true;

      // タイトルと、現在インストールされているバージョン
      tooltip.appendMarkdown(`### ${element.label} \`${element.version}\`\n\n`);
      tooltip.appendMarkdown(
        `$(info) Latest: **\`${latestVersion}\`** | $(law) \`${license}\` | $(cloud-download) 週間ダウンロード数: **${downloads}**\n\n`,
      );

      // 作者と説明文を埋め込む
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

      // 作成したツールチップをセットして返す
      item.tooltip = tooltip;
      return item;
    } catch (_error) {
      // オフライン時やエラー時はシンプルなツールチップを返す
      const fallbackTooltip = new vscode.MarkdownString(
        `**${element.label}**\n\n情報の取得に失敗しました。`,
      );
      item.tooltip = fallbackTooltip;
      return item;
    }
  }

  async getChildren(element?: Dependency): Promise<Dependency[]> {
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

        const deps =
          element.label === 'Dependencies' ? packageJson.dependencies : packageJson.devDependencies;
        if (!deps) return [];

        return Object.keys(deps).map((depName) => {
          return new Dependency(
            depName,
            deps[depName],
            vscode.TreeItemCollapsibleState.None,
            'dependency', // ここで contextValue を指定し、package.json の menus と紐付ける
          );
        });
      } catch (_e) {
        return [];
      }
    } else {
      // ルート要素（Dependencies と Dev Dependencies の親フォルダ）を作成
      return [
        new Dependency('Dependencies', '', vscode.TreeItemCollapsibleState.Expanded, 'category'),
        new Dependency(
          'Dev Dependencies',
          '',
          vscode.TreeItemCollapsibleState.Expanded,
          'category',
        ),
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
  ) {
    super(label, collapsibleState);
    this.description = this.version; // パッケージ名の右側に薄い文字でバージョンを表示

    // アイコンの設定
    this.iconPath =
      this.contextValue === 'category'
        ? new vscode.ThemeIcon('symbol-class')
        : new vscode.ThemeIcon('package', new vscode.ThemeColor('symbolIcon.keywordForeground'));

    this.command = {
      title: 'Open NPM Package Info',
      command: 'manageNpmPkg.openInfo',
      arguments: [this],
    };
  }
}

export function deactivate() {}
