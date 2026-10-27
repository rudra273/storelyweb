/** Same-origin API routing keeps the existing secure refresh cookies working. */
export function vercelConfig(apiOrigin: string | undefined) {
  if (!apiOrigin) throw new Error('Set STORELY_API_ORIGIN to your backend HTTPS origin in Vercel.')
  const url = new URL(apiOrigin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('STORELY_API_ORIGIN must be an HTTPS origin without credentials, a path, or a query.')
  }
  const origin = url.origin
  return {
    framework: 'vite' as const,
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    rewrites: [
      { source: '/v1/:path*', destination: `${origin}/v1/:path*` },
      { source: '/health', destination: `${origin}/health` },
      { source: '/health/:path*', destination: `${origin}/health/:path*` },
      { source: '/((?!assets/|v1(?:/|$)|health(?:/|$)).*)', destination: '/index.html' },
    ],
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ],
  }
}
