import { useEffect, useState } from 'react';
import './index.css';

const vscode = acquireVsCodeApi();

// パッケージのデータ型を定義
type PackageData = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function App() {
  const [packages, setPackages] = useState<PackageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // VS Codeからのメッセージを受け取るリスナー
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === 'packageData') {
        setPackages(message.data);
        setError(null);
      } else if (message.command === 'error') {
        setError(message.text);
      }
    };

    window.addEventListener('message', handleMessage);

    // 画面が開かれた直後に、VS Codeへ「パッケージ情報をちょうだい」とリクエストする
    vscode.postMessage({ command: 'getPackages' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // パッケージ一覧をレンダリングする部品
  const renderPackageList = (title: string, pkgRecord: Record<string, string> | undefined) => {
    if (!pkgRecord || Object.keys(pkgRecord).length === 0) return null;

    return (
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2 border-b border-gray-600 pb-1">{title}</h2>
        <ul className="space-y-1">
          {Object.entries(pkgRecord).map(([name, version]) => (
            <li key={name} className="flex justify-between items-center bg-gray-800 p-2 rounded">
              <span className="font-mono text-sm text-blue-300">{name}</span>
              <span className="font-mono text-xs text-gray-400">{version}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">Manage NPM Packages</h1>

      {error && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}

      {!packages && !error && <p className="text-gray-400">パッケージ情報を読み込み中...</p>}

      {packages && (
        <>
          {renderPackageList('Dependencies', packages.dependencies)}
          {renderPackageList('Dev Dependencies', packages.devDependencies)}
        </>
      )}
    </div>
  );
}

export default App;
