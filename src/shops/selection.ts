const KEY = 'storely.shop'

// Each account remembers its own selection. Membership comes from the API.
export function remembered(userId: string): string | null {
  if (!userId) return null
  try { return localStorage.getItem(`${KEY}.${userId}`) } catch { return null }
}

export function rememberShop(userId: string, shopId: string) {
  if (!userId) return
  try { localStorage.setItem(`${KEY}.${userId}`, shopId) } catch { /* selection remains session-local */ }
}
