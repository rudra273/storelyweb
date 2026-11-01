// Unfinished work kept in this browser so a reload, Back or a closed tab does not lose it.
// Drafts are scoped to one person and one shop and expire. They never hold tokens. An
// explicit sign-out wipes them (they can contain customer details); an expired session
// does not, because recovering that work is the point.
const PREFIX = 'storely.draft.'
const VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface Stored<T> { v: number; savedAt: number; data: T }

const keyOf = (kind: string, userId: string, shopId: string) => `${PREFIX}${kind}.${userId}.${shopId}`

export function loadDraft<T>(kind: string, userId: string, shopId: string): { data: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(keyOf(kind, userId, shopId))
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored<T>
    if (stored.v !== VERSION || Date.now() - stored.savedAt > MAX_AGE_MS) {
      clearDraft(kind, userId, shopId)
      return null
    }
    return { data: stored.data, savedAt: stored.savedAt }
  } catch {
    return null
  }
}

/** Storing nothing is fine: the form still works, it just cannot be recovered. */
export function saveDraft<T>(kind: string, userId: string, shopId: string, data: T): void {
  try {
    localStorage.setItem(keyOf(kind, userId, shopId), JSON.stringify({ v: VERSION, savedAt: Date.now(), data } satisfies Stored<T>))
  } catch { /* storage full or blocked */ }
}

export function clearDraft(kind: string, userId: string, shopId: string): void {
  try { localStorage.removeItem(keyOf(kind, userId, shopId)) } catch { /* nothing to clear */ }
}

export function clearAllDrafts(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch { /* nothing to clear */ }
}
