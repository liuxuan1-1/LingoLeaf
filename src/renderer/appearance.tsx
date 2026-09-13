import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  APPEARANCE_CACHE_KEY,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  resolveTheme,
  WINDOW_BACKGROUNDS,
} from '../shared/appearance';
import type { AppearanceSettings } from '../shared/types';
import { api, errorMessage } from './bridge';

function cachedAppearance(): AppearanceSettings {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
function renderAppearance(appearance: AppearanceSettings) {
  const resolved = resolveTheme(
    appearance.theme,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.fontSize = appearance.fontSize;
  document.documentElement.style.colorScheme = resolved === 'midnight' ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', WINDOW_BACKGROUNDS[resolved]);
  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(appearance));
  } catch {
    /* Disk-backed settings still work. */
  }
}
export function bootstrapAppearance() {
  renderAppearance(cachedAppearance());
}
const AppearanceContext = createContext<{
  appearance: AppearanceSettings;
  saving: boolean;
  error: string;
  update: (patch: Partial<AppearanceSettings>) => Promise<void>;
}>({ appearance: DEFAULT_APPEARANCE, saving: false, error: '', update: async () => {} });

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [appearance, setAppearance] = useState(cachedAppearance);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(appearance),
    revision = useRef(0),
    pending = useRef(0);
  const apply = useCallback((value: AppearanceSettings) => {
    current.current = value;
    setAppearance(value);
    renderAppearance(value);
  }, []);
  useEffect(() => {
    let disposed = false;
    let readSequence = 0;
    const refresh = async () => {
      if (pending.current) return;
      const read = ++readSequence;
      const expected = revision.current;
      try {
        const value = await api.getAppearance();
        if (
          !disposed &&
          read === readSequence &&
          expected === revision.current &&
          !pending.current
        ) {
          apply(normalizeAppearance(value));
          setError('');
        }
      } catch (e) {
        if (!disposed && read === readSequence && expected === revision.current && !pending.current)
          setError('读取外观设置失败：' + errorMessage(e));
      }
    };
    void refresh();
    const off = api.onChanged(() => void refresh());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystem = () => renderAppearance(current.current);
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_CACHE_KEY && !pending.current) void refresh();
    };
    media.addEventListener('change', updateSystem);
    window.addEventListener('storage', onStorage);
    return () => {
      disposed = true;
      off();
      media.removeEventListener('change', updateSystem);
      window.removeEventListener('storage', onStorage);
    };
  }, [apply]);
  const update = useCallback(
    async (patch: Partial<AppearanceSettings>) => {
      const value = normalizeAppearance({ ...current.current, ...patch });
      const expected = ++revision.current;
      pending.current++;
      setSaving(true);
      setError('');
      apply(value);
      try {
        const saved = await api.saveAppearance(value);
        if (expected === revision.current) apply(normalizeAppearance(saved));
      } catch (e) {
        if (expected === revision.current) {
          setError('外观未能保存：' + errorMessage(e));
          try {
            const saved = await api.getAppearance();
            if (expected === revision.current) apply(normalizeAppearance(saved));
          } catch {
            /* Keep preview and display the save failure. */
          }
        }
      } finally {
        pending.current--;
        if (expected === revision.current) setSaving(false);
      }
    },
    [apply],
  );
  return (
    <AppearanceContext.Provider value={{ appearance, saving, error, update }}>
      {children}
    </AppearanceContext.Provider>
  );
}
export function useAppearance() {
  return useContext(AppearanceContext);
}
