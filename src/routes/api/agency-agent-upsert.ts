import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { upsertAgencyAgent } from '../../server/waymaker-agency'

type AgentBody = {
  id?: unknown
  name?: unknown
  profile?: unknown
  emoji?: unknown
  model?: unknown
  description?: unknown
  systemPrompt?: unknown
  allowedWriteScope?: unknown
  forbiddenActions?: unknown
  escalationConditions?: unknown
  outputContract?: unknown
  defaultModelLane?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/agency-agent-upsert')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as AgentBody
          const id = readString(body.id) || readString(body.name)
          const name = readString(body.name) || id
          if (!id || !name) {
            return json({ ok: false, error: 'Agent id and name are required' }, { status: 400 })
          }

          const agent = await upsertAgencyAgent({
            id,
            name,
            profile: readString(body.profile) || id,
            emoji: readString(body.emoji) || '🤖',
            model: readString(body.model),
            description: readString(body.description),
            systemPrompt: readString(body.systemPrompt),
            allowedWriteScope: readString(body.allowedWriteScope),
            forbiddenActions: readString(body.forbiddenActions),
            escalationConditions: readString(body.escalationConditions),
            outputContract: readString(body.outputContract),
            defaultModelLane: readString(body.defaultModelLane),
          })

          return json({ ok: true, agent })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to save agency agent',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
