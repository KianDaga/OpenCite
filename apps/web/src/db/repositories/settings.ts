import type { Setting } from '@opencite/shared';
import { db } from '../dexieStore';

/**
 * App-level preferences. Anything that is not part of a project's data lives
 * here: last opened project, theme, whether the welcome tour has been seen.
 */
export const SETTING_KEYS = {
  lastProjectId: 'lastProjectId',
  theme: 'theme',
  onboarded: 'onboarded',
  recentStyles: 'recentStyles',
  fontFamily: 'fontFamily',
  fontSize: 'fontSize',
  sessionStart: 'sessionStart',
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = (await db.settings.get(key)) as Setting<T> | undefined;
  return row ? row.value : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}
