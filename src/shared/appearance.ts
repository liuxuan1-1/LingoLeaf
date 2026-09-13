import type { AppearanceSettings, FontSize, Theme } from './types';

export const DEFAULT_APPEARANCE: AppearanceSettings = { theme: 'forest', fontSize: 'large' };
export const THEME_OPTIONS: { id: Theme; label: string; description: string }[] = [
  { id: 'forest', label: '松林米白', description: '温暖纸感，清新绿意' },
  { id: 'ocean', label: '晴空蓝白', description: '明亮干净，清爽专注' },
  { id: 'lavender', label: '雾紫', description: '柔和紫调，安静阅读' },
  { id: 'midnight', label: '午夜深色', description: '深色背景，清晰文字' },
  { id: 'system', label: '跟随系统', description: '随 Windows 切换明暗' },
];
export const FONT_OPTIONS: { id: FontSize; label: string; size: number; hint: string }[] = [
  { id: 'standard', label: '标准', size: 16, hint: '清晰紧凑' },
  { id: 'large', label: '大号', size: 18, hint: '默认 · 舒适阅读' },
  { id: 'extra-large', label: '特大', size: 20, hint: '文字更醒目' },
];
export const WINDOW_BACKGROUNDS = {
  forest: '#f5f4ee',
  ocean: '#f1f6fb',
  lavender: '#f6f3fa',
  midnight: '#101722',
};
export const APPEARANCE_CACHE_KEY = 'lingoleaf.appearance.v1';
export function normalizeAppearance(value: unknown): AppearanceSettings {
  const object = value && typeof value === 'object' ? (value as Partial<AppearanceSettings>) : {};
  return {
    theme: THEME_OPTIONS.some((option) => option.id === object.theme)
      ? object.theme!
      : DEFAULT_APPEARANCE.theme,
    fontSize: FONT_OPTIONS.some((option) => option.id === object.fontSize)
      ? object.fontSize!
      : DEFAULT_APPEARANCE.fontSize,
  };
}
export function resolveTheme(theme: Theme, systemDark: boolean): Exclude<Theme, 'system'> {
  return theme === 'system' ? (systemDark ? 'midnight' : 'forest') : theme;
}
