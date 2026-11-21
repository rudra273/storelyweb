/** Same-origin financial editors share exclusive storage critical sections.
 * A callback contains storage work only, never a network request. */
export class FinancialStorageError extends Error {
  readonly kind: 'storage' | 'conflict' | 'unreadable'
  constructor(kind: 'storage' | 'conflict' | 'unreadable', message: string) { super(message); this.kind = kind }
}

export async function withFinancialStorageLock(name: string, label: string, work: () => void): Promise<void> {
  if (!navigator.locks?.request) throw new FinancialStorageError('storage', `This browser cannot safely coordinate ${label} saves across tabs. Use a current browser with Web Locks on HTTPS or localhost, then retry this same ${label}.`)
  try { await navigator.locks.request(name, work) }
  catch (error) {
    if (error instanceof FinancialStorageError) throw error
    throw new FinancialStorageError('storage', `This browser could not acquire the ${label} save lock. Reload and retry the same ${label}; this attempt was not sent.`)
  }
}
