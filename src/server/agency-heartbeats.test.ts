import { describe, expect, it } from 'vitest'
import {
  detectAgencyHeartbeatDeliver,
  getAgencyHeartbeatStatuses,
} from './agency-heartbeats'

describe('agency heartbeat reconciliation', () => {
  it('prefers healthy discord delivery when an existing discord job is healthy', () => {
    const deliver = detectAgencyHeartbeatDeliver([
      {
        name: 'Agency Approval Reminder',
        deliver: ['discord'],
        last_run_at: '2026-04-23T12:00:00.000Z',
        last_delivery_error: null,
      },
    ])

    expect(deliver).toBe('discord')
  })

  it('marks existing heartbeat jobs as drifted when prompt, schedule, or deliver diverge', () => {
    const state = getAgencyHeartbeatStatuses([
      {
        id: 'job-reference',
        name: 'Agency Stale Task Check',
        prompt: 'healthy prompt',
        schedule_display: 'every 60m',
        deliver: ['discord'],
        last_run_at: '2026-04-23T12:00:00.000Z',
        last_delivery_error: null,
      },
      {
        id: 'job-1',
        name: 'Agency Approval Reminder',
        prompt: 'stale prompt',
        schedule_display: 'every 120m',
        deliver: ['local'],
        last_run_at: '2026-04-23T12:00:00.000Z',
        last_delivery_error: null,
      },
    ])

    const approvalJob = state.jobs.find((job) => job.key === 'approvals')
    expect(approvalJob).toMatchObject({
      installed: true,
      existingJobId: 'job-1',
      needsUpdate: true,
    })
    expect(approvalJob?.driftReasons).toEqual(
      expect.arrayContaining(['prompt', 'schedule', 'deliver']),
    )
  })

  it('does not mark matching heartbeat jobs as drifted', () => {
    const initial = getAgencyHeartbeatStatuses([
      {
        id: 'job-healthy',
        name: 'Agency Approval Reminder',
        deliver: ['discord'],
        last_run_at: '2026-04-23T12:00:00.000Z',
        last_delivery_error: null,
      },
    ])
    const spec = initial.jobs.find((job) => job.key === 'approvals')
    if (!spec) throw new Error('Expected approval heartbeat spec')

    const state = getAgencyHeartbeatStatuses([
      {
        id: 'job-healthy',
        name: spec.name,
        prompt: spec.prompt,
        schedule_display: spec.schedule,
        deliver: [spec.deliver],
        last_run_at: '2026-04-23T12:00:00.000Z',
        last_delivery_error: null,
      },
    ])

    const approvalJob = state.jobs.find((job) => job.key === 'approvals')
    expect(approvalJob).toMatchObject({
      installed: true,
      needsUpdate: false,
      driftReasons: [],
    })
  })
})
