import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { createAgencyMission } from '../../server/waymaker-agency'

type Body = {
  goal?: unknown
  startedAt?: unknown
  status?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/agency-mission-create')({
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
          const goal = readString(body.goal)
          if (!goal) {
            return json({ ok: false, error: 'goal is required' }, { status: 400 })
          }
          const mission = await createAgencyMission({
            goal,
            startedAt: readString(body.startedAt),
            status: readString(body.status) as never,
          })
          return json({ ok: true, mission })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to create mission record',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
