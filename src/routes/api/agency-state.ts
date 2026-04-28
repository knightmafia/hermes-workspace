import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getAgencyState } from '../../server/waymaker-agency'

export const Route = createFileRoute('/api/agency-state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const state = await getAgencyState()
          return json({ ok: true, ...state })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to load agency state',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
