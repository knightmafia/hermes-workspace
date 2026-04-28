import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { applyAgencyTaskAction, type AgencyTaskActionInput } from '../../server/waymaker-agency'

type Body = {
  missionId?: unknown
  taskId?: unknown
  action?: unknown
  actor?: unknown
  note?: unknown
  nextAction?: unknown
  output?: unknown
  reviewAt?: unknown
  dueAt?: unknown
  workerKey?: unknown
  blockedBy?: unknown
  artifactPaths?: unknown
}

const VALID_ACTIONS = new Set<AgencyTaskActionInput['action']>([
  'approve',
  'reject',
  'start-review',
  'mark-passed',
  'mark-failed',
])

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  return typeof value === 'string' ? value.trim() : undefined
}

function readStringArray(value: unknown): string[] | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
}

export const Route = createFileRoute('/api/agency-task-action')({
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
          const taskId = readString(body.taskId)
          const action = readString(body.action) as AgencyTaskActionInput['action']

          if (!missionId) {
            return json({ ok: false, error: 'missionId is required' }, { status: 400 })
          }
          if (!taskId) {
            return json({ ok: false, error: 'taskId is required' }, { status: 400 })
          }
          if (!action) {
            return json({ ok: false, error: 'action is required' }, { status: 400 })
          }
          if (!VALID_ACTIONS.has(action)) {
            return json({ ok: false, error: 'action is invalid' }, { status: 400 })
          }

          const mission = await applyAgencyTaskAction(missionId, taskId, {
            action,
            actor: readString(body.actor) || 'manager',
            note: readString(body.note),
            nextAction: readString(body.nextAction),
            output: readNullableString(body.output),
            reviewAt: readNullableString(body.reviewAt) ?? undefined,
            dueAt: readNullableString(body.dueAt) ?? undefined,
            workerKey: readNullableString(body.workerKey) ?? undefined,
            blockedBy: readStringArray(body.blockedBy),
            artifactPaths: readStringArray(body.artifactPaths),
          })

          return json({ ok: true, mission })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to apply agency task action',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
