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
exports.t = t;
const vscode = __importStar(require("vscode"));
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
        'prompt.confirmRemove': "Are you sure you want to uninstall '{0}'?",
        'prompt.confirmInstall': "Do you want to install '{0}' as {1}?",
        'label.devDep': 'Dev Dependencies',
        'label.dep': 'Dependencies',
        'btn.install': 'Install',
        'btn.remove': 'Uninstall',
        'placeholder.searchLocal': 'Search installed packages...',
        'error.noWorkspace': 'Workspace not found.',
        'prompt.confirmUpdate': "Do you want to update '{0}' to version {1}?",
        'btn.update': 'Update',
        'label.scripts': 'Scripts',
        'action.runScript': 'Run Script',
        'action.updateAll': 'Update All Outdated',
        'action.scanUnused': 'Scan Unused Packages',
        'prompt.confirmUpdateAll': 'Update all outdated packages in {0}?',
        'prompt.scanningUnused': 'Scanning for unused packages...',
        'info.noUnused': 'No unused packages found! 🎉',
        'prompt.confirmRemoveUnused': 'Found {0} unused package(s). Remove them?',
        'action.changeVersion': 'Install Specific Version',
        'action.togglePin': 'Toggle Version Pinning (^)',
        'prompt.selectVersion': 'Select version to install',
        'info.pinned': "Pinned '{0}' to {1}",
        'info.unpinned': "Unpinned '{0}' ({1})",
        'action.openChangelog': 'Open Release Notes',
        'info.bundleSize': 'Bundle Size',
        'info.minified': 'Minified',
        'info.gzipped': 'Gzipped',
        'info.description': 'Description',
        'info.publisher': 'Publisher',
        'info.npmSite': 'NPM Site',
        'info.repository': 'Repository',
        'info.homepage': 'Homepage',
        'info.weeklyDownloads': 'Weekly Downloads',
        'info.latestVersion': 'Latest',
        'info.license': 'License',
        'info.author': 'Author',
        'info.unknown': 'Unknown',
        'info.none': 'None',
        'info.noData': 'No data',
        'info.disabledInSettings': 'Disabled in settings',
        'info.open': 'Open',
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
        'prompt.confirmRemove': "本当にパッケージ '{0}' をアンインストールしますか？",
        'prompt.confirmInstall': "パッケージ '{0}' を「{1}」としてインストールしますか？",
        'label.devDep': '開発依存関係',
        'label.dep': '通常依存関係',
        'btn.install': 'インストールする',
        'btn.remove': '削除する',
        'placeholder.searchLocal': 'インストール済みのパッケージを検索...',
        'error.noWorkspace': 'ワークスペースが開かれていません。',
        'prompt.confirmUpdate': "パッケージ '{0}' をバージョン {1} にアップデートしますか？",
        'btn.update': 'アップデートする',
        'label.scripts': 'スクリプト',
        'action.runScript': 'スクリプトを実行',
        'action.updateAll': 'すべてアップデート',
        'action.scanUnused': '未使用パッケージをスキャン',
        'prompt.confirmUpdateAll': '{0} の古いパッケージをすべて更新しますか？',
        'prompt.scanningUnused': '未使用のパッケージをスキャンしています...',
        'info.noUnused': '未使用のパッケージはありません！ 🎉',
        'prompt.confirmRemoveUnused': '{0} 個の未使用パッケージが見つかりました。削除しますか？',
        'action.changeVersion': '特定のバージョンをインストール',
        'action.togglePin': 'バージョンの固定/解除 (^)',
        'prompt.selectVersion': 'インストールするバージョンを選択してください',
        'info.pinned': "'{0}' のバージョンを固定しました ({1})",
        'info.unpinned': "'{0}' のバージョン固定を解除しました ({1})",
        'action.openChangelog': 'リリースノートを開く',
        'info.bundleSize': 'バンドルサイズ',
        'info.minified': '圧縮済',
        'info.gzipped': 'Gzip圧縮',
        'info.description': '説明',
        'info.publisher': '公開者',
        'info.npmSite': 'NPM サイト',
        'info.repository': 'リポジトリ',
        'info.homepage': 'ホームページ',
        'info.weeklyDownloads': '週間ダウンロード数',
        'info.latestVersion': '最新',
        'info.license': 'ライセンス',
        'info.author': '制作者',
        'info.unknown': '不明',
        'info.none': 'なし',
        'info.noData': 'データなし',
        'info.disabledInSettings': '設定でオフになっています',
        'info.open': '開く',
    },
};
// ...args を受け取り、{0}, {1} を動的に置換できるように拡張
function t(key, ...args) {
    const lang = vscode.env.language.startsWith('ja') ? 'ja' : 'en';
    let text = messages[lang][key] || messages.en[key] || key;
    args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, arg);
    });
    return text;
}
//# sourceMappingURL=i18n.js.map