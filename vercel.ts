import { vercelConfig } from './deployment/vercel-config.ts'

export const config = vercelConfig(process.env.STORELY_API_ORIGIN)
