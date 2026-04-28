import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  HERMES_API,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import { requireJsonContentType } from '../../server/rate-limit'
import { getAgencyHeartbeatStatuses } from '../../server/agency-heartbeats'

const GATE_LOCKED = false
const GATE_LOCK_REASON = ''

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function normalizeJobsPayload(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object') {
    const record = data as { jobs?: unknown; items?: unknown }
    if (Array.isArray(record.jobs)) return record.jobs as Array<Record<string, unknown>>
    if (Array.isArray(record.items)) return record.items as Array<Record<string, unknown>>
  }
  return []
}

async function fetchCurrentJobs(): Promise<Array<Record<string, unknown>>> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Jobs capability is unavailable')
  }

  const response = capabilities.dashboard.available
    ? await dashboardFetch('/api/cron/jobs?include_disabled=true')
    : await fetch(`${HERMES_API}/api/jobs?include_disabled=true`, {
        headers: authHeaders(),
      })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to fetch jobs (${response.status})`)
  }

  return normalizeJobsPayload(await response.json().catch(() => ({})))
}

async function createCronJob(payload: {
  name: string
  prompt: string
  schedule: string
  deliver: string
}) {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Jobs capability is unavailable')
  }

  const response = capabilities.dashboard.available
    ? await dashboardFetch('/api/cron/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    : await fetch(`${HERMES_API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to create heartbeat job (${response.status})`)
  }

  return await response.json().catch(() => ({}))
}

async function updateCronJob(
  jobId: string,
  updates: {
    name: string
    prompt: string
    schedule: string
    deliver: string
  },
) {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Jobs capability is unavailable')
  }

  const response = capabilities.dashboard.available
    ? await dashboardFetch(`/api/cron/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
    : await fetch(`${HERMES_API}/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(updates),
      })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to update heartbeat job (${response.status})`)
  }

  return await response.json().catch(() => ({}))
}

function toHeartbeatJobLike(job: Record<string, unknown>) {
  return {
    id: typeof job.id === 'string' ? job.id : '',
    name: typeof job.name === 'string' ? job.name : '',
    prompt: typeof job.prompt === 'string' ? job.prompt : '',
    schedule:
      typeof job.schedule === 'string' || (job.schedule && typeof job.schedule === 'object' && !Array.isArray(job.schedule))
        ? (job.schedule as string | Record<string, unknown>)
        : null,
    schedule_display:
      typeof job.schedule_display === 'string'
        ? job.schedule_display
        : null,
    deliver:
      Array.isArray(job.deliver) || typeof job.deliver === 'string'
        ? (job.deliver as string | string[])
        : null,
    last_delivery_error:
      typeof job.last_delivery_error === 'string'
        ? job.last_delivery_error
        : null,
    last_run_at:
      typeof job.last_run_at === 'string'
        ? job.last_run_at
        : null,
  }
}

export const Route = createFileRoute('/api/agency-heartbeats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const jobs = await fetchCurrentJobs()
          const result = getAgencyHeartbeatStatuses(jobs.map(toHeartbeatJobLike))

          return json({ ok: true, gateLocked: GATE_LOCKED, gateReason: GATE_LOCK_REASON, ...result })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to load agency heartbeats',
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          if (GATE_LOCKED) {
            return json(
              { ok: false, error: GATE_LOCK_REASON, gateLocked: true, gateReason: GATE_LOCK_REASON },
              { status: 409 },
            )
          }
          const jobs = await fetchCurrentJobs()
          const result = getAgencyHeartbeatStatuses(jobs.map(toHeartbeatJobLike))

          const missing = result.jobs.filter((job) => !job.installed)
          const drifted = result.jobs.filter((job) => job.installed && job.needsUpdate)
          for (const job of missing) {
            await createCronJob({
              name: job.name,
              prompt: job.prompt,
              schedule: job.schedule,
              deliver: job.deliver,
            })
          }
          for (const job of drifted) {
            await updateCronJob(job.existingJobId, {
              name: job.name,
              prompt: job.prompt,
              schedule: job.schedule,
              deliver: job.deliver,
            })
          }

          const refreshedJobs = await fetchCurrentJobs()
          const refreshed = getAgencyHeartbeatStatuses(refreshedJobs.map(toHeartbeatJobLike))

          return json({
            ok: true,
            created: missing.length,
            updated: drifted.length,
            gateLocked: GATE_LOCKED,
            gateReason: GATE_LOCK_REASON,
            ...refreshed,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Failed to install agency heartbeats',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
