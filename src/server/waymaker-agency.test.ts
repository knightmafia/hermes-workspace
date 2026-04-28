import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AgencyModule = typeof import('./waymaker-agency')

describe('waymaker agency durable workflow', () => {
  let tempRoot: string
  const originalCwd = process.cwd()
  const originalAgencyRoot = process.env.WAYMAKER_AGENCY_ROOT

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-agency-'))
    process.chdir(tempRoot)
    process.env.WAYMAKER_AGENCY_ROOT = path.join(tempRoot, 'Waymaker Agency')
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalAgencyRoot === undefined) {
      delete process.env.WAYMAKER_AGENCY_ROOT
    } else {
      process.env.WAYMAKER_AGENCY_ROOT = originalAgencyRoot
    }
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  async function loadAgencyModule(): Promise<AgencyModule> {
    vi.resetModules()
    return import('./waymaker-agency') as Promise<AgencyModule>
  }

  it('derives queue summaries and review records from task-backed state', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Durable review workflow verification',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Approval gate',
          status: 'needs-approval',
          workerKey: 'builder',
          reviewer: 'manager',
          approvalRequired: true,
          approvalStatus: 'pending',
          nextAction: 'Approve before release',
          output: null,
        },
        {
          id: 'task-002',
          title: 'QA review',
          status: 'review',
          workerKey: 'qa',
          reviewer: 'qa',
          reviewAt: '2025-01-01T00:00:00.000Z',
          nextAction: 'Finish sign-off',
          output: 'artifacts/reviews/qa.md',
        },
      ],
    })

    const state = await agency.getAgencyState()

    expect(state.queues.approvals).toHaveLength(1)
    expect(state.queues.approvals[0]).toMatchObject({
      missionTitle: 'Durable review workflow verification',
      taskId: 'task-001',
      taskTitle: 'Approval gate',
      detail: 'Approve before release',
      status: 'needs-approval',
    })
    expect(state.queues.approvals[0]?.path).toContain('tasks/task-001.md')

    expect(state.queues.stale).toHaveLength(1)
    expect(state.queues.stale[0]).toMatchObject({
      taskId: 'task-002',
      taskTitle: 'QA review',
      detail: 'Finish sign-off',
      status: 'review',
    })
    expect(state.queues.stale[0]?.path).toContain('tasks/task-002.md')

    expect(state.reviews).toHaveLength(1)
    expect(state.reviews[0]).toMatchObject({
      missionTitle: 'Durable review workflow verification',
      taskId: 'task-002',
      taskTitle: 'QA review',
      reviewer: 'qa',
      status: 'needs-followup',
    })
    expect(state.reviews[0]?.path).toContain('reviews/review-task-002.md')
  })

  it('re-derives mission status from task updates written through mission update', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Mission derivation from task updates',
      status: 'running',
    })

    const updated = await agency.updateAgencyMission(mission.id, {
      status: 'running',
      tasks: [
        {
          id: 'task-001',
          title: 'Approval gate task',
          status: 'needs-approval',
          owner: 'builder',
          workerKey: 'builder-approval-task',
          approvalRequired: true,
          approvalStatus: 'pending',
          nextAction: 'Manager approval required',
          output: 'artifacts/outputs/approval-task.md',
        },
      ],
    })

    expect(updated).toMatchObject({
      id: mission.id,
      status: 'needs-approval',
      approvalRequired: true,
      approvalStatus: 'pending',
      nextAction: 'Manager approval required',
    })
  })

  it('blocks non-manager mission updates and approval actions', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Role enforcement verification',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Builder-owned risky task',
          status: 'needs-approval',
          owner: 'builder',
          workerKey: 'builder-risky-task',
          approvalRequired: true,
          approvalStatus: 'pending',
          nextAction: 'Manager approval required',
          output: null,
        },
      ],
    })

    await expect(
      agency.updateAgencyMission(
        mission.id,
        { nextAction: 'Research edited mission state' },
        'research',
      ),
    ).rejects.toThrow('Only manager may update mission state')

    await expect(
      agency.applyAgencyTaskAction(mission.id, 'task-001', {
        action: 'approve',
        actor: 'builder',
      }),
    ).rejects.toThrow('Only manager may approve or reject tasks')
  })

  it('allows task owners to start review but restricts final sign-off to manager or qa', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Review authorization verification',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Research summary',
          status: 'ready',
          owner: 'research',
          workerKey: 'research-summary',
          approvalRequired: false,
          approvalStatus: 'none',
          nextAction: 'Submit for review',
          output: 'artifacts/research/summary.md',
        },
      ],
    })

    const afterReviewStart = await agency.applyAgencyTaskAction(mission.id, 'task-001', {
      action: 'start-review',
      actor: 'research',
    })
    expect(afterReviewStart.tasks[0]).toMatchObject({
      id: 'task-001',
      status: 'review',
      owner: 'research',
    })

    await expect(
      agency.applyAgencyTaskAction(mission.id, 'task-001', {
        action: 'mark-passed',
        actor: 'research',
      }),
    ).rejects.toThrow('Only manager or qa may sign off review outcomes')

    const afterQaPass = await agency.applyAgencyTaskAction(mission.id, 'task-001', {
      action: 'mark-passed',
      actor: 'qa',
    })
    expect(afterQaPass.tasks[0]).toMatchObject({
      id: 'task-001',
      status: 'complete',
    })
  })

  it('exposes ops and outreach in Gate 5 and derives scorecards with bounded auto-requeue', async () => {
    const agency = await loadAgencyModule()
    await agency.upsertAgencyAgent({
      id: 'ops',
      name: 'Ops',
      profile: 'ops',
      emoji: '🛠️',
      model: '',
      description: 'Runtime and workflow operator.',
      systemPrompt: 'Operate safely and record the operational facts.',
      allowedWriteScope: '- operational logs',
      forbiddenActions: '- no risky external ops without approval',
      escalationConditions: '- when service instability persists',
      outputContract: '- current state\n- next action',
      defaultModelLane: 'cheap-reliable-ops',
    })
    await agency.upsertAgencyAgent({
      id: 'outreach',
      name: 'Outreach',
      profile: 'outreach',
      emoji: '📬',
      model: '',
      description: 'Messaging and distribution operator.',
      systemPrompt: 'Draft human outreach and leave the next follow-up obvious.',
      allowedWriteScope: '- outreach drafts',
      forbiddenActions: '- no external sends without approval',
      escalationConditions: '- when send approval is missing',
      outputContract: '- channel\n- message angle\n- CTA',
      defaultModelLane: 'cheap-sensitive-drafting',
    })
    const mission = await agency.createAgencyMission({
      goal: 'Gate 5 expansion verification',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Follow up with waitlist leads',
          status: 'running',
          owner: 'outreach',
          workerKey: 'outreach-followup',
          dueAt: '2025-01-01T00:00:00.000Z',
          nextAction: 'Send follow-up sequence',
          output: 'artifacts/outputs/outreach-followup.md',
        },
        {
          id: 'task-002',
          title: 'Run service audit',
          status: 'complete',
          owner: 'ops',
          workerKey: 'ops-service-audit',
          createdAt: '2025-01-01T00:00:00.000Z',
          startedAt: '2025-01-01T00:00:00.000Z',
          completedAt: '2025-01-01T03:00:00.000Z',
          nextAction: 'Audit complete',
          output: 'artifacts/outputs/service-audit.md',
        },
      ],
    })

    const state = await agency.getAgencyState()
    const refreshedMission = state.missions.find((entry) => entry.id === mission.id)
    const requeuedTask = refreshedMission?.tasks.find((entry) => entry.id === 'task-001')
    const outreachScore = state.scorecards.find((entry) => entry.agentId === 'outreach')
    const opsScore = state.scorecards.find((entry) => entry.agentId === 'ops')

    expect(state.agents.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['ops', 'outreach']),
    )
    expect(requeuedTask).toMatchObject({
      id: 'task-001',
      status: 'ready',
      owner: 'outreach',
      requeueCount: 1,
    })
    expect(state.queues.stale).toHaveLength(0)
    expect(outreachScore).toMatchObject({
      assignedTasks: 1,
      activeTasks: 1,
      completedTasks: 0,
      requeueCount: 1,
    })
    expect(opsScore?.completedTasks).toBe(1)
    expect(opsScore?.averageCycleHours).toBe(3)
  })

  it('does not classify completed missions as stale just because review time has passed', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Completed mission stale regression check',
      status: 'completed',
      reviewAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:00.000Z',
    })

    await agency.updateAgencyMission(mission.id, {
      status: 'completed',
      reviewAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 'task-001',
          title: 'Finished task',
          status: 'complete',
          owner: 'builder',
          workerKey: 'builder-finished-task',
          reviewAt: '2025-01-01T00:00:00.000Z',
          completedAt: '2025-01-01T00:00:00.000Z',
          nextAction: 'Mission complete',
          output: 'artifacts/outputs/finished.md',
        },
      ],
    })

    const state = await agency.getAgencyState()
    expect(state.queues.stale).toHaveLength(0)
    expect(state.dailyReview.risks).toEqual([])
  })

  it('keeps closed missions out of approval queues and daily decisions even if stale task state remains', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Closed mission queue hygiene regression check',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Approval task left behind',
          status: 'needs-approval',
          owner: 'builder',
          workerKey: 'builder-approval-left-behind',
          approvalRequired: true,
          approvalStatus: 'pending',
          nextAction: 'Manager approval required',
          output: 'artifacts/outputs/approval-left-behind.md',
        },
      ],
    })

    await agency.updateAgencyMission(mission.id, {
      status: 'canceled',
      completedAt: '2025-01-01T00:00:00.000Z',
      nextAction: 'Superseded by a newer validation run',
      error: 'Superseded by a newer validation run',
    })

    const state = await agency.getAgencyState()
    expect(state.queues.approvals.find((entry) => entry.missionId === mission.id)).toBeUndefined()
    expect(state.queues.active.find((entry) => entry.missionId === mission.id)).toBeUndefined()
    expect(state.dailyReview.topPriorities.some((entry) => entry.includes('Closed mission queue hygiene regression check'))).toBe(false)
    expect(state.dailyReview.requiredDecisions.some((entry) => entry.includes('Closed mission queue hygiene regression check'))).toBe(false)
  })

  it('does not auto-requeue a newly approved ready task just because another task set mission review time', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Approval path should not trigger auto-requeue',
      status: 'running',
    })

    await agency.updateAgencyMission(mission.id, {
      tasks: [
        {
          id: 'task-001',
          title: 'Completed ops brief',
          status: 'complete',
          owner: 'ops',
          reviewer: 'manager',
          workerKey: 'ops-brief',
          reviewAt: '2025-01-01T00:00:00.000Z',
          completedAt: '2025-01-01T00:00:00.000Z',
          output: 'artifacts/ops/brief.md',
        },
        {
          id: 'task-002',
          title: 'Outreach draft',
          status: 'needs-approval',
          owner: 'outreach',
          reviewer: 'qa',
          workerKey: 'outreach-draft',
          approvalRequired: true,
          approvalStatus: 'pending',
          output: 'artifacts/outputs/draft.md',
          nextAction: 'Manager approval required before review',
        },
      ],
    })

    await agency.applyAgencyTaskAction(mission.id, 'task-002', {
      action: 'approve',
      actor: 'manager',
      nextAction: 'Draft approved for QA review',
    })

    const state = await agency.getAgencyState()
    const refreshedMission = state.missions.find((entry) => entry.id === mission.id)
    const approvedTask = refreshedMission?.tasks.find((entry) => entry.id === 'task-002')

    expect(approvedTask).toMatchObject({
      id: 'task-002',
      status: 'ready',
      requeueCount: 0,
      lastRequeuedAt: '',
    })
    expect(state.queues.stale).toHaveLength(0)
  })

  it('preserves pending approval missions in the approval queue', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Approval mission visibility check',
      status: 'needs-approval',
    })

    await agency.updateAgencyMission(mission.id, {
      status: 'needs-approval',
      approvalRequired: true,
      approvalStatus: 'pending',
      nextAction: 'User approval required before execution',
    })

    const state = await agency.getAgencyState()
    const approvalItem = state.queues.approvals.find((entry) => entry.missionId === mission.id)

    expect(approvalItem).toMatchObject({
      missionTitle: 'Approval mission visibility check',
      detail: 'User approval required before execution',
      status: 'needs-approval',
    })
    expect(state.queues.failed.find((entry) => entry.missionId === mission.id)).toBeUndefined()
  })

  it('auto-cancels stale running Conductor missions that never decomposed tasks', async () => {
    const agency = await loadAgencyModule()
    const mission = await agency.createAgencyMission({
      goal: 'Zero task stalled retry cleanup',
      status: 'running',
      startedAt: '2025-01-01T00:00:00.000Z',
    })

    await agency.updateAgencyMission(mission.id, {
      status: 'running',
      tasks: [],
      nextAction: 'Triage and decompose into tasks',
    })

    const state = await agency.getAgencyState()
    const refreshedMission = state.missions.find((entry) => entry.id === mission.id)

    expect(refreshedMission).toMatchObject({
      status: 'canceled',
      approvalRequired: false,
      approvalStatus: 'none',
      error: 'Auto-canceled stale Conductor run with no decomposed tasks.',
    })
    expect(state.queues.active.find((entry) => entry.missionId === mission.id)).toBeUndefined()
    expect(state.queues.stale.find((entry) => entry.missionId === mission.id)).toBeUndefined()
  })
})
