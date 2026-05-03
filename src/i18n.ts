import * as vscode from 'vscode';

const messages = {
  en: {
    'prompt.searchNpm': 'Enter npm package name to search',
    'placeholder.searchNpm': 'e.g., react, typescript',
    'info.notFound': 'Package not found.',
    'placeholder.selectInstall': 'Select package to install',
    'placeholder.selectAction': 'Select action for',
    'action.installDep': 'Install as Dependency',
    'action.installDev': 'Install as Dev Dependency',
    'action.openNpm': 'Open NPM Website',
    'action.showInfo': 'Show Details in Output',
    'action.update': 'Update Package',
    'action.cancel': 'Cancel',
    'action.remove': 'Remove Package',
    'prompt.confirmRemove': 'Are you sure you want to uninstall',
    'prompt.confirmInstall': "Do you want to install '{0}' as {1}?",
    'label.devDep': 'Dev Dependencies',
    'label.dep': 'Dependencies',
    'btn.install': 'Install',
    'btn.remove': 'Uninstall',
    'placeholder.searchLocal': 'Search installed packages...',
    'error.noWorkspace': 'Workspace not found.',
    'prompt.confirmUpdate': "Do you want to update '{0}' to version {1}?",
    'btn.update': 'Update',
  },
  ja: {
    'prompt.searchNpm': '検索するNPMパッケージ名を入力してください',
    'placeholder.searchNpm': '例: react, typescript',
    'info.notFound': 'パッケージが見つかりませんでした。',
    'placeholder.selectInstall': 'インストールするパッケージをすべて選択してください',
    'placeholder.selectAction': 'アクションを選択してください:',
    'action.cancel': 'キャンセル',
    'action.installDep': 'Dependencies に追加',
    'action.installDev': 'Dev Dependencies に追加',
    'action.openNpm': 'NPMのサイトを開く',
    'action.showInfo': '詳細情報を出力パネルで表示',
    'action.update': 'アップデート',
    'action.remove': '削除',
    'prompt.confirmRemove': '本当にアンインストールしますか？',
    'prompt.confirmInstall': "パッケージ '{0}' を「{1}」としてインストールしますか？",
    'label.devDep': '開発依存関係',
    'label.dep': '通常依存関係',
    'btn.install': 'インストールする',
    'btn.remove': '削除する',
    'placeholder.searchLocal': 'インストール済みのパッケージを検索...',
    'error.noWorkspace': 'ワークスペースが開かれていません。',
    'prompt.confirmUpdate': "パッケージ '{0}' をバージョン {1} にアップデートしますか？",
    'btn.update': 'アップデートする',
  },
};

// ...args を受け取り、{0}, {1} を動的に置換できるように拡張
export function t(key: keyof typeof messages.en, ...args: string[]): string {
  const lang = vscode.env.language.startsWith('ja') ? 'ja' : 'en';
  let text = messages[lang][key] || messages.en[key] || key;

  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, arg);
  });

  return text;
}
