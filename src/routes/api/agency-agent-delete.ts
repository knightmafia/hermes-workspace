import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { deleteAgencyAgent } from '../../server/waymaker-agency'

type Body = {
  agentId?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/agency-agent-delete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Body
          const agentId = readString(body.agentId)
          if (!agentId) {
            return json({ ok: false, error: 'agentId is required' }, { status: 400 })
          }

          await deleteAgencyAgent(agentId)
          return json({ ok: true })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to delete agency agent',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
