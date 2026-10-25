import type { StxConfig } from '@stacksjs/stx'
import handle from '../src/api'

export default {
  pagesDir: 'src/pages',
  cache: false,
  seo: { enabled: false },
  app: { head: { title: 'ImageOptimization' }, window: { width: 760, height: 560 } },
  // Browser preview accepts uploads only. Native path access is authenticated
  // by the packaged STX host and never exposed by the development server.
  apiRoutes: {
    '/optimize': async (request: Request) => new URL(request.url).searchParams.has('path')
      ? new Response('File paths require the native app', { status: 403 })
      : (await handle(request)) ?? new Response('Not Found', { status: 404 }),
  },
} satisfies Partial<StxConfig>
