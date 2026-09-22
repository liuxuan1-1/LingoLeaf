import traditionalChinese from './zh-TW.json';
import japanese from './ja.json';
import korean from './ko.json';
import spanish from './es.json';
export const localeCatalogs: Record<'zh-TW' | 'ja' | 'ko' | 'es', Record<string, string>> = {
  'zh-TW': traditionalChinese, ja: japanese, ko: korean, es: spanish,
};
