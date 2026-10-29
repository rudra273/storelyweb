const KEY = 'storely.shop'
// A convenience shop ID, never an access token or business data.
export function remembered(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
export function rememberShop(shopId: string) {
  try { localStorage.setItem(KEY,shopId) } catch { /* selection remains session-local */ }
}
