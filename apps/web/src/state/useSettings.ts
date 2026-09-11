import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SETTING_KEYS, getSetting, setSetting } from '@/db/repositories/settings';
import { db } from '@/db/dexieStore';

/**
 * Preferences that are not part of any project: the theme, and the typeface a
 * bibliography is rendered and exported in.
 *
 * These live in the `settings` table rather than `localStorage` so they behave
 * like everything else in the app — one store, surviving a reload, shared
 * across tabs by the same live queries.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Fonts a word processor can be relied on to have. A bibliography is usually
 * pasted into a document that specifies its own font, so this is about what
 * the preview looks like and what the exports carry — not a design choice.
 */
export const BIBLIOGRAPHY_FONTS = [
  { id: 'Times New Roman', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'Georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { id: 'Cambria', label: 'Cambria', stack: 'Cambria, Georgia, serif' },
  { id: 'Arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'Calibri', label: 'Calibri', stack: 'Calibri, Carlito, sans-serif' },
  { id: 'Helvetica', label: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { id: 'Verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
] as const;

export const FONT_SIZES = [10, 11, 12, 13, 14, 16] as const;

export interface Appearance {
  theme: ThemePreference;
  fontFamily: string;
  fontSize: number;
}

const DEFAULTS: Appearance = {
  theme: 'system',
  // The default almost every style guide assumes.
  fontFamily: 'Times New Roman',
  fontSize: 12,
};

export function fontStackFor(id: string): string {
  return BIBLIOGRAPHY_FONTS.find((f) => f.id === id)?.stack ?? DEFAULTS.fontFamily;
}

export function useAppearance(): Appearance & {
  setTheme: (theme: ThemePreference) => void;
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  toggleTheme: () => void;
} {
  const stored = useLiveQuery(
    async () => ({
      theme: await getSetting<ThemePreference>(SETTING_KEYS.theme, DEFAULTS.theme),
      fontFamily: await getSetting<string>(SETTING_KEYS.fontFamily, DEFAULTS.fontFamily),
      fontSize: await getSetting<number>(SETTING_KEYS.fontSize, DEFAULTS.fontSize),
    }),
    [],
    DEFAULTS,
  );

  const setTheme = useCallback((theme: ThemePreference) => {
    void setSetting(SETTING_KEYS.theme, theme);
  }, []);

  return {
    ...stored,
    setTheme,
    setFontFamily: (family: string) => void setSetting(SETTING_KEYS.fontFamily, family),
    setFontSize: (size: number) => void setSetting(SETTING_KEYS.fontSize, size),
    // The toggle flips to the opposite of what is currently *shown*, so the
    // first click always visibly changes something — which is not true if
    // "system" simply cycles to "light" on a device already in light mode.
    toggleTheme: () => setTheme(resolveTheme(stored.theme) === 'dark' ? 'light' : 'dark'),
  };
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies the theme to the document, and keeps following the system setting
 * while the preference is "system" — someone whose laptop switches at sunset
 * should see the app switch with it, without a reload.
 */
export function useThemeEffect(preference: ThemePreference): void {
  const [, force] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolveTheme(preference) === 'dark');
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.classList.toggle('dark', query.matches);
      force((n) => n + 1);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);
}

/** Clears the whole library. Used by "delete everything". */
export async function deleteAllData(): Promise<void> {
  await db.delete();
  window.location.reload();
}
