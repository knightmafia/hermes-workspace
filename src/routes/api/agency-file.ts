import { readFileSync, statSync } from 'node:fs'
import { extname, resolve as resolvePath } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { WAYMAKER_AGENCY_ROOT } from '../../server/waymaker-agency'

const MIME_BY_EXT: Record<string, string> = {
  '.md': 'text/plain; charset=utf-8',
  '.markdown': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function isAllowed(absPath: string): boolean {
  return absPath === WAYMAKER_AGENCY_ROOT || absPath.startsWith(`${WAYMAKER_AGENCY_ROOT}/`)
}

function getMimeType(filePath: string) {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'text/plain; charset=utf-8'
}

export const Route = createFileRoute('/api/agency-file')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response('Unauthorized', { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const action = url.searchParams.get('action') || 'open'
          const rawPath = url.searchParams.get('path') || ''
          if (!rawPath) {
            return new Response('path required', { status: 400 })
          }

          const abs = resolvePath(rawPath)
          if (!isAllowed(abs)) {
            return new Response('Forbidden path', { status: 403 })
          }

          let stat
          try {
            stat = statSync(abs)
          } catch {
            return new Response('Not found', { status: 404 })
          }

          if (!stat.isFile()) {
            return new Response('Not a file', { status: 400 })
          }

          const body = readFileSync(abs)

          if (action === 'read') {
            const mime = getMimeType(abs)
            if (mime.startsWith('image/')) {
              return new Response(
                JSON.stringify({
                  type: 'image',
                  path: abs,
                  content: `data:${mime};base64,${body.toString('base64')}`,
                }),
                {
                  status: 200,
                  headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                  },
                },
              )
            }
            return new Response(
              JSON.stringify({
                type: 'text',
                path: abs,
                content: body.toString('utf8'),
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store',
                },
              },
            )
          }

          const mime = getMimeType(abs)

          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': mime,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Open failed',
            { status: 500 },
          )
        }
      },
    },
  },
})
