import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { updateAgencyMission } from '../../server/waymaker-agency'

type Body = {
  missionId?: unknown
  patch?: unknown
  actor?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/agency-mission-update')({
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
          const missionId = readString(body.missionId)
          if (!missionId) {
            return json({ ok: false, error: 'missionId is required' }, { status: 400 })
          }
          const patch =
            body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch)
              ? (body.patch as Record<string, unknown>)
              : {}
          const actor = readString(body.actor) || 'manager'
          const mission = await updateAgencyMission(missionId, patch as never, actor)
          return json({ ok: true, mission })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to update mission record',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
