// Test-only Web Locks model: same lock name serializes callbacks, different names do not.
import { vi } from 'vitest'

export function installInvoiceLocks() {
  const queues = new Map<string, Promise<unknown>>()
  const locks = {
    request<T>(name: string, callback: () => T | Promise<T>): Promise<T> {
      const previous = queues.get(name) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(callback)
      queues.set(name, next)
      return next
    },
  }
  const original = navigator
  vi.stubGlobal('navigator', new Proxy(original, { get: (target, key) => key === 'locks' ? locks : Reflect.get(target, key, target) }))
  return locks
}
