import { Injectable } from '@angular/core';

export interface Cached<T> {
  data: T;
  /** When it was fetched (ms since epoch). */
  at: number;
  /** Something changed since (a reply, a result…), so it may be out of date. */
  stale?: boolean;
}

const PREFIX = 'cache:v1:';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * What survives closing the app: only group data every member already sees.
 * Organizer screens (members' phone numbers and emails) stay in memory only.
 */
const KEEP_ON_PHONE = [/^\/home$/, /^\/matches\?scope=(upcoming|past)$/, /^\/players$/];

/**
 * The last answer for each screen, so screens open instantly and refresh in the background
 * ("stale while revalidate"). Belongs to one account at a time and is wiped on sign-out,
 * so a shared phone never shows the previous person's data.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private memory = new Map<string, Cached<unknown>>();
  private owner: string | null = null;

  /** Ties the cache to this account, loading what the phone saved for them last time. */
  useAccount(userId: string) {
    if (this.owner === userId) return;
    this.memory.clear();
    this.owner = userId;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFIX + userId) || '{}') as Record<string, Cached<unknown>>;
      for (const [key, entry] of Object.entries(saved)) {
        if (entry && Date.now() - entry.at < MAX_AGE_MS) this.memory.set(key, entry);
      }
    } catch { /* storage blocked or corrupt: start empty */ }
  }

  peek<T>(key: string): Cached<T> | null {
    return (this.memory.get(key) as Cached<T> | undefined) ?? null;
  }

  put(key: string, data: unknown) {
    this.memory.set(key, { data, at: Date.now() });
    if (KEEP_ON_PHONE.some(r => r.test(key))) this.save();
  }

  /**
   * After a change (a reply, a result…): mark every saved answer as possibly out of date.
   * They're kept as a fallback for when the server can't be reached.
   */
  invalidate() {
    for (const [key, entry] of this.memory) this.memory.set(key, { ...entry, stale: true });
    this.save();
  }

  /** Sign-out: forget everything on this phone. */
  clear() {
    this.memory.clear();
    this.owner = null;
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    } catch { /* nothing saved */ }
  }

  private save() {
    if (!this.owner) return;
    const kept = Object.fromEntries([...this.memory].filter(([key]) => KEEP_ON_PHONE.some(r => r.test(key))));
    try {
      localStorage.setItem(PREFIX + this.owner, JSON.stringify(kept));
    } catch { /* full or blocked: memory still works */ }
  }
}
