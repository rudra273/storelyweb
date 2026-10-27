import { vercelConfig } from './deployment/vercel-config.ts'

export default vercelConfig(process.env.STORELY_API_ORIGIN)
