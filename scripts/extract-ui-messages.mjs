import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

export function collectMessages(root = path.resolve('src')) {
  const pairs = new Map();
  const add = (chinese, english, file) => {
    if (!chinese || !english) return;
    const previous = pairs.get(english);
    if (previous && previous.chinese !== chinese) previous.aliases = [...new Set([...(previous.aliases ?? []), chinese])];
    else if (!previous) pairs.set(english, { english, chinese, file: file.replaceAll('\\', '/') });
  };
  const string = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'locales') continue;
      const file = path.join(directory, item.name);
      if (item.isDirectory()) { walk(file); continue; }
      if (!/\.tsx?$/.test(item.name)) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node) => {
        if (ts.isCallExpression(node)) {
          const name = ts.isIdentifier(node.expression) ? node.expression.text
            : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
          if (name === 't' || name === 'translate' || ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'createTranslator') {
            const offset = name === 'translate' ? 1 : 0;
            add(string(node.arguments[offset]), string(node.arguments[offset + 1]), path.relative(process.cwd(), file));
          }
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'MESSAGE_PAIRS') {
          const list = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
          if (ts.isArrayLiteralExpression(list)) for (const tuple of list.elements)
            if (ts.isArrayLiteralExpression(tuple)) add(string(tuple.elements[0]), string(tuple.elements[1]), path.relative(process.cwd(), file));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(root);
  return [...pairs.values()].sort((a, b) => a.english.localeCompare(b.english, 'en'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const messages = collectMessages();
  const destination = process.argv[2] ?? 'ui-messages.json';
  fs.writeFileSync(destination, JSON.stringify(messages, null, 2) + '\n');
  console.log(JSON.stringify({ messages: messages.length, destination }));
}
