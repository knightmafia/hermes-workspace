import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { saveAgencySettings } from '../../server/waymaker-agency'

type Body = {
  defaultModel?: unknown
  autoApprove?: unknown
  activityFeedLength?: unknown
  orchestratorName?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/agency-settings')({
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
          const settings = await saveAgencySettings({
            defaultModel: readString(body.defaultModel),
            autoApprove: body.autoApprove === true,
            activityFeedLength:
              typeof body.activityFeedLength === 'number'
                ? body.activityFeedLength
                : undefined,
            orchestratorName: readString(body.orchestratorName),
          })
          return json({ ok: true, settings })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to save agency settings',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
