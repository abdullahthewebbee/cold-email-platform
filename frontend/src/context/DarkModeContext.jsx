import { createContext, useState, useEffect, useContext, useCallback } from 'react';

const STORAGE_KEY = 'darkreader';

// InboxAir: light and dark are both native token themes (styles/inboxair-theme.css),
// so Dark Reader is no longer used. The theme is applied as data-theme + .dark on <html>.

/** @returns {'system' | 'dark' | 'light'} */
function readDarkThemePreference() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'on' || s === 'dark') return 'dark';
    if (s === 'off' || s === 'light') return 'light';
    return 'dark';   // InboxAir: dark is the default theme
  } catch {
    return 'dark';
  }
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Effective dark state for a stored preference. */
function effectiveDarkForPreference(pref) {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return systemPrefersDark();
}

const DarkModeContext = createContext({
  darkMode: false,
  themePreference: 'system',
  setThemePreference: () => {}
});

export function DarkModeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState(readDarkThemePreference);
  const [darkMode, setDarkMode] = useState(() =>
    typeof window !== 'undefined' ? effectiveDarkForPreference(readDarkThemePreference()) : false
  );

  const applyRootClass = on => {
    const root = document.documentElement;
    if (on) root.classList.add('dark');
    else root.classList.remove('dark');
    root.setAttribute('data-theme', on ? 'dark' : 'light');
  };

  const applyEffectiveDark = useCallback(on => {
    applyRootClass(on);
    setDarkMode(on);
  }, []);

  const setThemePreference = useCallback(pref => {
    if (pref !== 'system' && pref !== 'dark' && pref !== 'light') return;
    setThemePreferenceState(pref);
    localStorage.setItem(
      STORAGE_KEY,
      pref === 'dark' ? 'dark' : pref === 'light' ? 'light' : 'system'
    );
  }, []);

  useEffect(() => {
    const on = effectiveDarkForPreference(themePreference);
    applyEffectiveDark(on);

    if (themePreference !== 'system') return undefined;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyEffectiveDark(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePreference, applyEffectiveDark]);

  return (
    <DarkModeContext.Provider value={{ darkMode, themePreference, setThemePreference }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(DarkModeContext);
}
