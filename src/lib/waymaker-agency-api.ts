export type AgencyStateAgent = {
  id: string
  name: string
  profile: string
  emoji: string
  model: string
  description: string
  systemPrompt: string
  allowedWriteScope?: string
  forbiddenActions?: string
  escalationConditions?: string
  outputContract?: string
  defaultModelLane?: string
  path: string
}

export type AgencyStateSettings = {
  defaultModel: string
  autoApprove: boolean
  activityFeedLength: number
  orchestratorName: string
}

export type AgencyState = {
  ok?: boolean
  root: string
  agents: AgencyStateAgent[]
  settings: AgencyStateSettings
  missions: Array<{
    id: string
    title: string
    goal: string
    status: string
    startedAt: string
    completedAt: string
    approvalRequired?: boolean
    approvalStatus?: string
    jobId: string
    orchestratorSessionKey: string
    summary: string
    outputPath: string
    error: string
    workerCount: number
    workerLabels: string[]
    tasks: Array<{
      id: string
      title: string
      status: 'pending' | 'ready' | 'running' | 'blocked' | 'needs-approval' | 'review' | 'complete' | 'failed'
      workerKey: string | null
      owner?: string | null
      reviewer?: string | null
      output: string | null
      createdAt?: string
      startedAt?: string
      completedAt?: string
      dueAt?: string
      reviewAt?: string
      approvalRequired?: boolean
      approvalStatus?: string
      blockedBy?: string[]
      artifactPaths?: string[]
      nextAction?: string
      requeueCount?: number
      lastRequeuedAt?: string
      path?: string
    }>
    streamText: string
    workerOutputs: Record<string, string>
    path: string
  }>
  queues: {
    inbox: AgencyQueueItem[]
    active: AgencyQueueItem[]
    blocked: AgencyQueueItem[]
    approvals: AgencyQueueItem[]
    failed: AgencyQueueItem[]
    stale: AgencyQueueItem[]
  }
  reviews: AgencyReviewSummary[]
  dailyReview: {
    generatedAt: string
    topPriorities: string[]
    risks: string[]
    requiredDecisions: string[]
  }
  scorecards: AgencyAgentScorecard[]
}

export type AgencyQueueItem = {
  missionId: string
  missionTitle: string
  taskId: string | null
  taskTitle: string | null
  detail: string
  status: string
  path: string
  dueAt: string
  reviewAt: string
}

export type AgencyReviewSummary = {
  id: string
  missionId: string
  missionTitle: string
  taskId: string
  taskTitle: string
  reviewer: string
  status: string
  createdAt: string
  path: string
}

export type AgencyAgentScorecard = {
  agentId: string
  name: string
  assignedTasks: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
  reviewPasses: number
  reviewFollowups: number
  requeueCount: number
  averageCycleHours: number
}

export type AgencyTaskAction =
  | 'approve'
  | 'reject'
  | 'start-review'
  | 'mark-passed'
  | 'mark-failed'

export type AgencyActorRole =
  | 'manager'
  | 'research'
  | 'builder'
  | 'qa'
  | 'ops'
  | 'outreach'

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T
}

export async function fetchAgencyState(): Promise<AgencyState> {
  const response = await fetch('/api/agency-state')
  const payload = await readJson<AgencyState & { error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to load agency state (${response.status})`)
  }
  return payload
}

export async function saveAgencyAgent(input: {
  id: string
  name: string
  profile?: string
  emoji: string
  model: string
  description?: string
  systemPrompt: string
  allowedWriteScope?: string
  forbiddenActions?: string
  escalationConditions?: string
  outputContract?: string
  defaultModelLane?: string
}) {
  const response = await fetch('/api/agency-agent-upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await readJson<{ ok?: boolean; error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save agency agent (${response.status})`)
  }
}

export async function deleteAgencyAgentRecord(agentId: string) {
  const response = await fetch('/api/agency-agent-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  })
  const payload = await readJson<{ ok?: boolean; error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete agency agent (${response.status})`)
  }
}

export async function saveAgencySettings(input: Partial<AgencyStateSettings>) {
  const response = await fetch('/api/agency-settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await readJson<{ ok?: boolean; error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to save agency settings (${response.status})`)
  }
}

export async function createAgencyMissionRecord(input: {
  goal: string
  startedAt?: string
  status?: string
}): Promise<{ mission: { id: string } }> {
  const response = await fetch('/api/agency-mission-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await readJson<{ ok?: boolean; error?: string; mission: { id: string } }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to create mission record (${response.status})`)
  }
  return payload
}

export async function updateAgencyMissionRecord(
  missionId: string,
  patch: Record<string, unknown>,
  actor: AgencyActorRole = 'manager',
) {
  const response = await fetch('/api/agency-mission-update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ missionId, patch, actor }),
  })
  const payload = await readJson<{ ok?: boolean; error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update mission record (${response.status})`)
  }
}

export async function runAgencyTaskAction(input: {
  missionId: string
  taskId: string
  action: AgencyTaskAction
  actor?: AgencyActorRole
}) {
  const response = await fetch('/api/agency-task-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...input,
      actor: input.actor || 'manager',
    }),
  })
  const payload = await readJson<{ ok?: boolean; error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to run agency task action (${response.status})`)
  }
}
