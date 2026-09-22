import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { localeCatalogs } from '../src/shared/locales';
import { createTranslator, normalizeUiLanguage, UI_LANGUAGES } from '../src/shared/i18n';
import { localizeMessage, MESSAGE_PAIRS } from '../src/shared/messages';
import { renderMobilePage } from '../src/main/mobile-page';

function uiPairs() {
  const pairs = new Map<string, string>(MESSAGE_PAIRS.map(([zh, en]) => [en, zh]));
  const literal = (node: ts.Node | undefined) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'locales') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
          if (name === 't' || name === 'translate' || ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'createTranslator') {
            const offset = name === 'translate' ? 1 : 0;
            const zh = literal(node.arguments[offset]), en = literal(node.arguments[offset + 1]);
            if (zh && en) pairs.set(en, zh);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(path.resolve('src'));
  return pairs;
}
const pairs = uiPairs();
const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();

describe('complete application localization', () => {
  for (const [locale, catalog] of Object.entries(localeCatalogs)) {
    it(`${locale} covers every UI and status message without missing placeholders`, () => {
      const missing = [...pairs.keys()].filter((key) => !catalog[key]?.trim());
      expect(missing).toEqual([]);
      for (const key of pairs.keys()) expect(placeholders(catalog[key]), key).toEqual(placeholders(key));
    });
  }
  it('keeps interpolation values literal and supports all six locale values', () => {
    expect(UI_LANGUAGES).toHaveLength(6);
    for (const { value } of UI_LANGUAGES) expect(normalizeUiLanguage(value)).toBe(value);
    expect(normalizeUiLanguage('unknown')).toBe('zh-CN');
    expect(createTranslator('en')('数量 {count}', 'Count {count}', { count: '<b>3</b>' })).toBe('Count <b>3</b>');
    expect(createTranslator('zh-CN')('原文', 'Source')).toBe('原文');
  });
  it('localizes application errors while preserving protocol context and paths', () => {
    const original = '认证失败，请检查 API Key、权限和服务商。 (HTTP 401)（Responses · /v1/responses）';
    for (const { value } of UI_LANGUAGES) {
      const localized = localizeMessage(original, value);
      expect(localized).toContain('(HTTP 401)（Responses · /v1/responses）');
      if (value !== 'zh-CN') expect(localized).not.toContain('认证失败');
    }
    expect(localizeMessage('无法读取 settings.json。原文件已保留，请检查权限或从备份恢复。', 'en')).toContain('Cannot read settings.json.');
  });
  for (const { value } of UI_LANGUAGES) it(`renders localized mobile chrome for ${value}`, () => {
    const html = renderMobilePage(value);
    expect(html).toContain(`lang="${value}"`);
    expect(html).toContain(createTranslator(value)('今日复习', 'Today’s review'));
    expect(html).toContain(createTranslator(value)('句子收藏', 'Saved sentences'));
  });
});
