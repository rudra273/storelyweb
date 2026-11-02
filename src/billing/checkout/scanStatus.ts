/** What the scan box says out loud after each scan, for the eye and for screen readers. */
export type Status = { kind: 'ready' | 'ok' | 'warn' | 'error'; text: string }
export const READY: Status = { kind: 'ready', text: 'Ready to scan' }
