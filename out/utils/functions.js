"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadmeText = createReadmeText;
function createReadmeText(readmeText) {
    // 1. ノイズの除去: NPMパッケージ特有のバッジ（シールド）を正規表現で削除
    // 例: [![npm version](...)](...) または ![...](...) を消す
    let cleanText = readmeText
        .replace(/\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)\r?\n?/g, '') // リンク付きバッジ
        .replace(/!\[[^\]]*\]\([^)]+\)\r?\n?/g, ''); // 単体の画像/バッジ
    // 2. 先頭の余分な空白・改行を削除
    cleanText = cleanText.trim();
    // 3. 安全な切り詰め: 文字数ではなく「行（段落）」で区切る
    const lines = cleanText.split(/\r?\n/);
    let previewText = '';
    let charCount = 0;
    const MAX_CHARS = 200; // ツールチップに表示したい目安の文字数
    for (const line of lines) {
        // 目安の文字数を超えたら、次の段落には進まずループを抜ける
        if (charCount > MAX_CHARS) {
            previewText += '\n\n... *(Read more on npm)*';
            break;
        }
        previewText += `${line}\n`;
        charCount += line.length;
    }
    return previewText.trim();
}
//# sourceMappingURL=functions.js.map