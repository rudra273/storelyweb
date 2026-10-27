import { describe, expect, it } from 'vitest'
import { vercelConfig } from './vercel-config.ts'

describe('hosted frontend routing', () => {
  it('routes auth and business requests before the SPA fallback', () => {
    const config = vercelConfig('https://storely-api.onrender.com/')
    expect(config.rewrites[0]).toEqual({
      source: '/v1/:path*', destination: 'https://storely-api.onrender.com/v1/:path*',
    })
    expect(config.headers[0]?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' })
  })

  it('accepts a Cloud Run backend without frontend source changes', () => {
    expect(vercelConfig('https://storely-abc.run.app').rewrites[0]?.destination)
      .toBe('https://storely-abc.run.app/v1/:path*')
  })

  it.each([undefined, 'http://api.example.com', 'https://user:pass@api.example.com', 'https://api.example.com/v1', 'https://api.example.com/?key=secret'])('rejects an unsafe backend origin: %s', (origin) => {
    expect(() => vercelConfig(origin)).toThrow()
  })
})
