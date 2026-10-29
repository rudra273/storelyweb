import { when } from '../components/format'
export function date(value: string | null | undefined) { return value ? when(value) : '—' }
