import { WAYMAKER_AGENCY_ROOT } from './waymaker-agency'

export type HermesJobLike = {
  id?: string
  name?: string
  prompt?: string | null
  schedule?: string | Record<string, unknown> | null
  schedule_display?: string | null
  deliver?: string | string[] | null
  last_delivery_error?: string | null
  last_run_at?: string | null
}

export type AgencyHeartbeatSpec = {
  key: string
  name: string
  schedule: string
  prompt: string
  deliver: string
}

export type AgencyHeartbeatStatus = AgencyHeartbeatSpec & {
  installed: boolean
  existingJobId: string
  needsUpdate: boolean
  driftReasons: string[]
}

const AGENCY_HEARTBEAT_NAMES = {
  stale: 'Agency Stale Task Check',
  blocked: 'Agency Blocked Task Reminder',
  approvals: 'Agency Approval Reminder',
  daily: 'Agency Daily Review',
} as const

function includesDeliver(value: HermesJobLike['deliver'], target: string): boolean {
  if (Array.isArray(value)) return value.includes(target)
  return typeof value === 'string' ? value === target : false
}

function normalizePrompt(value: string | null | undefined): string {
  return (value || '').replace(/\r\n/g, '\n').trim()
}

function normalizeSchedule(value: HermesJobLike['schedule_display'] | HermesJobLike['schedule']): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const record = value as Record<string, unknown>
  if (typeof record.display === 'string' && record.display.trim()) return record.display.trim()
  if (typeof record.expr === 'string' && record.expr.trim()) return record.expr.trim()
  if (record.kind === 'interval' && typeof record.minutes === 'number' && Number.isFinite(record.minutes)) {
    return `every ${Math.round(record.minutes)}m`
  }
  return ''
}

function promptPrefix(): string {
  return [
    'You are the manager heartbeat for Waymaker Agency.',
    `Durable source of truth lives under: ${WAYMAKER_AGENCY_ROOT}`,
    'Read the relevant queue and mission/task files directly from that folder tree.',
    'Do not invent state. Use the files.',
    'If there is nothing actionable, respond with exactly: [SILENT]',
    'Keep alerts short, operational, and specific.',
    '',
  ].join('\n')
}

function buildAgencyHeartbeatSpecs(deliver: string): AgencyHeartbeatSpec[] {
  return [
    {
      key: 'stale',
      name: AGENCY_HEARTBEAT_NAMES.stale,
      schedule: 'every 60m',
      deliver,
      prompt: `${promptPrefix()}Read these files:
- ${WAYMAKER_AGENCY_ROOT}/queues/stale.md
- ${WAYMAKER_AGENCY_ROOT}/queues/active.md

Task:
1. Identify stale tasks that missed due/review thresholds.
2. Confirm the mission/task reference and next action from the underlying task file when possible.
3. If stale queue is empty, reply [SILENT].

Output:
- One line summary.
- One line per stale task: mission / task / why stale / next action.`,
    },
    {
      key: 'blocked',
      name: AGENCY_HEARTBEAT_NAMES.blocked,
      schedule: 'every 120m',
      deliver,
      prompt: `${promptPrefix()}Read these files:
- ${WAYMAKER_AGENCY_ROOT}/queues/blocked.md
- ${WAYMAKER_AGENCY_ROOT}/memory/shared-memory.md

Task:
1. Identify blocked tasks that still need escalation or missing context.
2. If blocked queue is empty, reply [SILENT].

Output:
- One line summary.
- One line per blocked task: mission / task / blocker / who or what must unblock it.`,
    },
    {
      key: 'approvals',
      name: AGENCY_HEARTBEAT_NAMES.approvals,
      schedule: 'every 60m',
      deliver,
      prompt: `${promptPrefix()}Read these files:
- ${WAYMAKER_AGENCY_ROOT}/queues/approvals.md

Task:
1. Identify approval-needed tasks still waiting on a human decision.
2. If approvals queue is empty, reply [SILENT].

Output:
- One line summary.
- One line per approval: mission / task / decision needed / risk if delayed.`,
    },
    {
      key: 'daily',
      name: AGENCY_HEARTBEAT_NAMES.daily,
      schedule: '0 9 * * 1-5',
      deliver,
      prompt: `${promptPrefix()}Read these files:
- ${WAYMAKER_AGENCY_ROOT}/queues/active.md
- ${WAYMAKER_AGENCY_ROOT}/queues/blocked.md
- ${WAYMAKER_AGENCY_ROOT}/queues/approvals.md
- ${WAYMAKER_AGENCY_ROOT}/memory/decisions.md

Task:
Produce the manager daily review.

Output format:
Top Priorities
- up to 3 items
Risks
- up to 3 items
Required Decisions
- up to 3 items

Be concise. No filler.`,
    },
  ]
}

export function detectAgencyHeartbeatDeliver(jobs: HermesJobLike[]): string {
  const discordJobs = jobs.filter((job) => includesDeliver(job.deliver, 'discord'))
  const hasHealthyDiscord = discordJobs.some(
    (job) =>
      Boolean(job.last_run_at) &&
      !String(job.last_delivery_error || '').includes('Unknown Channel'),
  )
  if (hasHealthyDiscord) return 'discord'

  const hasLocal = jobs.some((job) => includesDeliver(job.deliver, 'local'))
  if (hasLocal) return 'local'

  if (discordJobs.length > 0) return 'local'
  return 'local'
}

export function getAgencyHeartbeatStatuses(jobs: HermesJobLike[]): {
  deliver: string
  jobs: AgencyHeartbeatStatus[]
} {
  const deliver = detectAgencyHeartbeatDeliver(jobs)
  const specs = buildAgencyHeartbeatSpecs(deliver)

  return {
    deliver,
    jobs: specs.map((spec) => {
      const existing = jobs.find((job) => job.name === spec.name)
      const driftReasons: string[] = []
      if (existing?.id) {
        if (normalizePrompt(existing.prompt) !== normalizePrompt(spec.prompt)) {
          driftReasons.push('prompt')
        }
        if (normalizeSchedule(existing.schedule_display || existing.schedule) !== spec.schedule) {
          driftReasons.push('schedule')
        }
        if (!includesDeliver(existing.deliver, spec.deliver)) {
          driftReasons.push('deliver')
        }
      }
      return {
        ...spec,
        installed: Boolean(existing?.id),
        existingJobId: existing?.id?.trim() || '',
        needsUpdate: driftReasons.length > 0,
        driftReasons,
      }
    }),
  }
}
