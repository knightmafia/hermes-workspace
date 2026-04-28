import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import YAML from 'yaml'

const AGENCY_FOLDER_NAME = 'Waymaker Agency'

function resolveWaymakerAgencyRoot(): string {
  const override = process.env.WAYMAKER_AGENCY_ROOT?.trim()
  if (override) {
    return resolve(override)
  }

  const home = homedir()
  const vaultCandidates = [
    resolve(home, 'Documents', 'Waymaker-Brain-v2', 'vault'),
    resolve(home, 'workspace', 'brain-vault'),
  ]

  for (const vaultRoot of vaultCandidates) {
    if (existsSync(vaultRoot)) {
      return resolve(vaultRoot, AGENCY_FOLDER_NAME)
    }
  }

  return resolve(process.cwd(), 'waymaker-agency')
}

export const WAYMAKER_AGENCY_ROOT = resolveWaymakerAgencyRoot()

const AGENTS_DIR = join(WAYMAKER_AGENCY_ROOT, 'agents')
const MISSIONS_DIR = join(WAYMAKER_AGENCY_ROOT, 'missions')
const MEMORY_DIR = join(WAYMAKER_AGENCY_ROOT, 'memory')
const QUEUES_DIR = join(WAYMAKER_AGENCY_ROOT, 'queues')
const SETTINGS_FILE = join(MEMORY_DIR, 'operations-settings.md')

export type AgencyAgentRecord = {
  id: string
  name: string
  profile: string
  emoji: string
  model: string
  description: string
  systemPrompt: string
  allowedWriteScope: string
  forbiddenActions: string
  escalationConditions: string
  outputContract: string
  defaultModelLane: string
  path: string
}

export type AgencySettings = {
  defaultModel: string
  autoApprove: boolean
  activityFeedLength: number
  orchestratorName: string
}

export type AgencyMissionTask = {
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
}

export type AgencyTaskWorkflowAction =
  | 'approve'
  | 'reject'
  | 'start-review'
  | 'mark-passed'
  | 'mark-failed'

export type AgencyMissionRecord = {
  id: string
  title: string
  goal: string
  status:
    | 'proposed'
    | 'running'
    | 'paused'
    | 'blocked'
    | 'needs-approval'
    | 'review'
    | 'completed'
    | 'failed'
    | 'canceled'
  owner: string
  reviewer: string
  priority: 'low' | 'medium' | 'high'
  createdAt: string
  startedAt: string
  completedAt: string
  dueAt: string
  reviewAt: string
  approvalRequired: boolean
  approvalStatus: string
  nextAction: string
  blockers: string[]
  artifacts: string[]
  linkedTasks: string[]
  jobId: string
  orchestratorSessionKey: string
  summary: string
  outputPath: string
  error: string
  workerCount: number
  workerLabels: string[]
  tasks: AgencyMissionTask[]
  streamText: string
  workerOutputs: Record<string, string>
  path: string
}

type ParsedMarkdownDoc = {
  title: string
  metadata: Record<string, unknown>
  sections: Map<string, string>
}

type AgencyTaskRecord = AgencyMissionTask & {
  missionId: string
}

type AgencyQueueItem = {
  label: string
  detail: string
  path: string
}

export type AgencyStateQueueItem = {
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

export type AgencyDailyReviewSummary = {
  generatedAt: string
  topPriorities: string[]
  risks: string[]
  requiredDecisions: string[]
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

export type AgencyTaskActionInput = {
  action: AgencyTaskWorkflowAction
  actor?: string
  note?: string
  nextAction?: string
  output?: string | null
  workerKey?: string | null
  dueAt?: string | null
  reviewAt?: string | null
  blockedBy?: string[] | null
  artifactPaths?: string[] | null
}

const ALL_AGENCY_ROLE_IDS = ['manager', 'research', 'builder', 'qa', 'ops', 'outreach'] as const
type AgencyActorRole = (typeof ALL_AGENCY_ROLE_IDS)[number]
const CORE_AGENCY_ROLE_IDS = ['manager', 'research', 'builder', 'qa'] as const
type CoreAgencyRole = (typeof CORE_AGENCY_ROLE_IDS)[number]
const AUTO_REQUEUE_ROLE_IDS = ['research', 'builder', 'ops', 'outreach'] as const
const AUTO_REQUEUE_LIMIT = 1

const DEFAULT_SETTINGS: AgencySettings = {
  defaultModel: '',
  autoApprove: false,
  activityFeedLength: 5,
  orchestratorName: 'Main Agent',
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeAgencyActorRole(value: string | null | undefined): AgencyActorRole | null {
  const normalized = (value || '').trim().toLowerCase()
  return ALL_AGENCY_ROLE_IDS.includes(normalized as AgencyActorRole)
    ? (normalized as AgencyActorRole)
    : null
}

function normalizeCoreAgencyRole(value: string | null | undefined): CoreAgencyRole | null {
  const normalized = normalizeAgencyActorRole(value)
  return normalized && CORE_AGENCY_ROLE_IDS.includes(normalized as CoreAgencyRole)
    ? (normalized as CoreAgencyRole)
    : null
}

function normalizeAgencyMissionOwner(value: string | null | undefined): CoreAgencyRole {
  return normalizeCoreAgencyRole(value) || 'manager'
}

function normalizeAgencyMissionReviewer(value: string | null | undefined): 'manager' | 'qa' {
  const normalized = normalizeCoreAgencyRole(value)
  return normalized === 'qa' || normalized === 'manager' ? normalized : 'qa'
}

function normalizeAgencyTaskOwner(value: string | null | undefined): AgencyActorRole | null {
  return normalizeAgencyActorRole(value)
}

function normalizeAgencyTaskReviewer(value: string | null | undefined): 'manager' | 'qa' | null {
  const normalized = normalizeAgencyActorRole(value)
  return normalized === 'manager' || normalized === 'qa' ? normalized : null
}

function ensureIso(value: string | null | undefined): string {
  if (!value) return ''
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}

function parseBoolean(value: string | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'true'
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function escapeInline(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function readFrontmatter(content: string): {
  metadata: Record<string, unknown>
  body: string
} {
  if (!content.startsWith('---\n')) {
    return { metadata: {}, body: content }
  }

  const end = content.indexOf('\n---\n', 4)
  if (end === -1) {
    return { metadata: {}, body: content }
  }

  const raw = content.slice(4, end)
  try {
    const parsed = YAML.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        metadata: parsed as Record<string, unknown>,
        body: content.slice(end + 5),
      }
    }
  } catch {
    // Fall through and let the legacy parser handle the file.
  }

  return { metadata: {}, body: content }
}

function readStringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function readStringMetadata(metadata: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = readStringValue(metadata[key])
    if (value) return value
  }
  return ''
}

function readStringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => readStringValue(entry)).filter(Boolean)
  }
  const single = readStringValue(value)
  return single ? [single] : []
}

function readMetadataBoolean(metadata: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return parseBoolean(value)
  }
  return false
}

function normalizeSectionText(value: string | undefined): string {
  const normalized = (value || '').trim()
  if (
    !normalized ||
    normalized === '-' ||
    normalized === 'None yet.' ||
    normalized === 'No stream output captured.' ||
    normalized === 'No worker outputs captured.' ||
    normalized === 'No output captured yet.'
  ) {
    return ''
  }
  return normalized
}

function parseBulletList(section: string | undefined): string[] {
  return (section || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter((line) => line && line !== 'None yet.')
}

function parseDateMs(value: string | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function isPastDue(value: string | undefined): boolean {
  const ms = parseDateMs(value)
  return ms > 0 && ms < Date.now()
}

function latestIso(values: Array<string | undefined | null>): string {
  const withMs = values
    .map((value) => ({ value: ensureIso(value), ms: parseDateMs(value || undefined) }))
    .filter((entry) => entry.ms > 0)
    .sort((left, right) => right.ms - left.ms)
  return withMs[0]?.value || ''
}

function parseMarkdownDoc(content: string): ParsedMarkdownDoc {
  const normalized = content.replace(/\r\n/g, '\n')
  const frontmatter = readFrontmatter(normalized)
  const body = frontmatter.body
  const titleMatch = body.match(/^#\s+(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? 'Untitled'
  const sections = new Map<string, string>()
  const sectionPattern = /^##\s+(.+)$/gm
  const metadata: Record<string, unknown> = { ...frontmatter.metadata }

  let bodyStart = body.length
  const firstSection = body.match(/^##\s+.+$/m)
  if (firstSection?.index !== undefined) {
    bodyStart = firstSection.index
  }
  const headerBody = body.slice(0, bodyStart)
  for (const line of headerBody.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z ]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].trim().toLowerCase()
    if (metadata[key] === undefined) {
      metadata[key] = match[2].trim()
    }
  }

  const matches = [...body.matchAll(sectionPattern)]
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const next = matches[index + 1]
    const heading = current[1]?.trim() ?? ''
    const start = (current.index ?? 0) + current[0].length
    const end = next?.index ?? body.length
    sections.set(heading, body.slice(start, end).trim())
  }

  return { title, metadata, sections }
}

function renderAgentMarkdown(
  record: Omit<AgencyAgentRecord, 'path'>,
  existing?: ParsedMarkdownDoc,
): string {
  const responsibilities =
    existing?.sections.get('Responsibilities') ||
    'Role-specific duties go here.'
  const defaultBehavior =
    existing?.sections.get('Default Behavior') ||
    'Stay direct, pragmatic, and accountable.'
  const inputs =
    existing?.sections.get('Inputs') ||
    '- shared memory\n- mission files\n- queue state'
  const outputs =
    existing?.sections.get('Outputs') ||
    '- concise updates\n- durable mission state changes\n- linked artifacts'
  const allowedWriteScope =
    existing?.sections.get('Allowed Write Scope') ||
    record.allowedWriteScope.trim() ||
    '- task outputs only'
  const forbiddenActions =
    existing?.sections.get('Forbidden Actions') ||
    record.forbiddenActions.trim() ||
    '- do not act outside the assigned role'
  const escalationConditions =
    existing?.sections.get('Escalation Conditions') ||
    record.escalationConditions.trim() ||
    '- escalate when scope, risk, or approvals are unclear'
  const outputContract =
    existing?.sections.get('Output Contract') ||
    record.outputContract.trim() ||
    outputs.trim() ||
    '- concise updates\n- durable mission state changes\n- linked artifacts'
  const defaultModelLane =
    existing?.sections.get('Default Model Lane') ||
    record.defaultModelLane.trim() ||
    record.model.trim() ||
    'inherit-from-settings'

  return [
    `# ${record.name}`,
    '',
    `Id: ${record.id}`,
    `Profile: ${record.profile || record.id}`,
    `Emoji: ${record.emoji || '🤖'}`,
    `Model: ${record.model}`,
    `Description: ${record.description}`,
    '',
    '## System Prompt',
    '',
    record.systemPrompt.trim() || 'Answer from the available context first. Keep updates short and operational.',
    '',
    '## Responsibilities',
    '',
    responsibilities.trim() || '- Role-specific duties go here.',
    '',
    '## Default Behavior',
    '',
    defaultBehavior.trim() || 'Stay direct, pragmatic, and accountable.',
    '',
    '## Inputs',
    '',
    inputs.trim() || '- shared memory\n- mission files\n- queue state',
    '',
    '## Outputs',
    '',
    outputs.trim() || '- concise updates\n- durable mission state changes\n- linked artifacts',
    '',
    '## Allowed Write Scope',
    '',
    allowedWriteScope.trim() || '- task outputs only',
    '',
    '## Forbidden Actions',
    '',
    forbiddenActions.trim() || '- do not act outside the assigned role',
    '',
    '## Escalation Conditions',
    '',
    escalationConditions.trim() || '- escalate when scope, risk, or approvals are unclear',
    '',
    '## Output Contract',
    '',
    outputContract.trim() || outputs.trim() || '- concise updates\n- durable mission state changes\n- linked artifacts',
    '',
    '## Default Model Lane',
    '',
    defaultModelLane.trim() || record.model.trim() || 'inherit-from-settings',
    '',
  ].join('\n')
}

function renderSettingsMarkdown(settings: AgencySettings): string {
  return [
    '# Operations Settings',
    '',
    `Default Model: ${settings.defaultModel}`,
    `Auto Approve: ${settings.autoApprove ? 'true' : 'false'}`,
    `Activity Feed Length: ${Math.min(20, Math.max(1, Math.round(settings.activityFeedLength || 5)))}`,
    `Orchestrator Name: ${settings.orchestratorName || DEFAULT_SETTINGS.orchestratorName}`,
    '',
    'These values are managed by Hermes Workspace and stored in the agency folder',
    'so Operations and Conductor can share one durable control plane.',
    '',
  ].join('\n')
}

function renderMissionMarkdown(record: Omit<AgencyMissionRecord, 'path'>): string {
  const frontmatter = YAML.stringify({
    mission_id: record.id,
    title: record.title,
    status: record.status,
    owner: record.owner,
    reviewer: record.reviewer,
    priority: record.priority,
    created_at: record.createdAt,
    started_at: record.startedAt,
    completed_at: record.completedAt,
    due_at: record.dueAt,
    review_at: record.reviewAt,
    approval_required: record.approvalRequired,
    approval_status: record.approvalStatus,
    next_action: record.nextAction,
    blockers: record.blockers,
    artifacts: record.artifacts,
    linked_tasks: record.linkedTasks.length > 0 ? record.linkedTasks : record.tasks.map((task) => task.id),
    job_id: record.jobId,
    orchestrator_session_key: record.orchestratorSessionKey,
    output_path: record.outputPath,
    error: record.error,
    worker_count: record.workerCount,
    worker_labels: record.workerLabels,
  }).trimEnd()

  const taskLines = record.tasks.length > 0
    ? record.tasks.map((task) => {
        const checkbox = task.status === 'complete' ? 'x' : ' '
        const owner = task.owner || task.workerKey || 'unassigned'
        const output = task.output ? ` — output: ${task.output}` : ''
        return `- [${checkbox}] ${task.id} — ${task.title} — owner: ${owner} — status: ${task.status}${output}`
      }).join('\n')
    : '- None yet.'

  const workerOutputs = Object.entries(record.workerOutputs)
    .map(([key, output]) => `### ${key}\n\n${output.trim() || 'No output captured.'}`)
    .join('\n\n')

  const artifactLines = [
    ...record.artifacts,
    ...(record.outputPath ? [record.outputPath] : []),
  ]
  const uniqueArtifacts = [...new Set(artifactLines.map((value) => value.trim()).filter(Boolean))]
  const riskLines = [
    ...record.blockers,
    ...(record.error ? [record.error] : []),
  ]
  const uniqueRisks = [...new Set(riskLines.map((value) => value.trim()).filter(Boolean))]
  const approvalLines = record.status === 'needs-approval' || record.approvalRequired
    ? [record.nextAction || 'Human review required before proceeding.']
    : []
  const noteLines = [
    record.nextAction ? `- Next action: ${record.nextAction}` : '',
    record.jobId ? `- Job ID: ${record.jobId}` : '',
    record.orchestratorSessionKey ? `- Orchestrator session: ${record.orchestratorSessionKey}` : '',
    record.workerCount > 0 ? `- Worker count: ${record.workerCount}` : '',
    record.workerLabels.length > 0 ? `- Worker labels: ${record.workerLabels.join(', ')}` : '',
  ].filter(Boolean)

  return [
    '---',
    frontmatter,
    '---',
    '',
    `# Mission: ${record.title}`,
    '',
    `Id: ${record.id}`,
    '## Summary',
    '',
    record.summary.trim() || '-',
    '',
    '## Objective',
    '',
    escapeInline(record.goal) || '-',
    '',
    '## Success Criteria',
    '',
    '- Deliver the requested outcome and keep the mission record current.',
    '',
    '## Scope',
    '',
    '- Execute the stated objective through supervised manager and worker coordination.',
    '',
    '## Out Of Scope',
    '',
    '- Undefined follow-on work outside this mission record.',
    '',
    '## Task Index',
    '',
    taskLines,
    '',
    '## Artifacts',
    '',
    uniqueArtifacts.length > 0 ? uniqueArtifacts.map((artifact) => `- ${artifact}`).join('\n') : '- None yet.',
    '',
    '## Risks',
    '',
    uniqueRisks.length > 0 ? uniqueRisks.map((risk) => `- ${risk}`).join('\n') : '- None yet.',
    '',
    '## Approvals Needed',
    '',
    approvalLines.length > 0 ? approvalLines.map((line) => `- ${line}`).join('\n') : '- None yet.',
    '',
    '## Notes',
    '',
    noteLines.length > 0 ? noteLines.join('\n') : '- None yet.',
    '',
    '## Worker Outputs',
    '',
    workerOutputs || 'No worker outputs captured.',
    '',
    '## Execution Log',
    '',
    record.streamText.trim() || 'No stream output captured.',
    '',
  ].join('\n')
}

function renderTaskMarkdown(
  mission: Omit<AgencyMissionRecord, 'path'>,
  task: AgencyMissionTask,
  existing?: ParsedMarkdownDoc,
): string {
  const taskId = task.id.trim() || 'task'
  const assignedAgent = task.owner || task.workerKey || 'unassigned'
  const reviewer = normalizeAgencyTaskReviewer(task.reviewer) || normalizeAgencyMissionReviewer(mission.reviewer)
  const taskCreatedAt = task.createdAt || mission.createdAt || mission.startedAt || new Date().toISOString()
  const taskStartedAt = task.startedAt || (
    task.status === 'running' || task.status === 'review' || task.status === 'complete'
      ? mission.startedAt || mission.createdAt
      : ''
  )
  const taskCompletedAt = task.completedAt || (
    task.status === 'complete' ? mission.completedAt || new Date().toISOString() : ''
  )
  const taskDueAt = ensureIso(task.dueAt) || ''
  const taskReviewAt = ensureIso(task.reviewAt) || ''
  const persistedTaskReviewAt =
    taskReviewAt || (
      task.status === 'review' || task.status === 'complete' || task.status === 'failed'
        ? mission.reviewAt
        : ''
    )
  const taskApprovalRequired =
    typeof task.approvalRequired === 'boolean'
      ? task.approvalRequired
      : task.status === 'needs-approval'
  const taskApprovalStatus =
    task.approvalStatus || (task.status === 'needs-approval' ? 'pending' : 'none')
  const taskRequeueCount = Math.max(0, Math.round(task.requeueCount || 0))
  const taskLastRequeuedAt = ensureIso(task.lastRequeuedAt) || ''
  const taskArtifacts = task.artifactPaths && task.artifactPaths.length > 0
    ? task.artifactPaths
    : task.output
      ? [task.output]
      : []
  const taskBlockers = task.blockedBy && task.blockedBy.length > 0
    ? task.blockedBy
    : task.status === 'blocked'
      ? mission.blockers
      : []
  const taskBrief = existing?.sections.get('Task Brief') || task.title
  const inputs =
    existing?.sections.get('Inputs') ||
    [
      `- Mission objective: ${mission.goal || mission.title}`,
      '- Shared memory and mission record',
    ].join('\n')
  const outputContract =
    existing?.sections.get('Output Contract') ||
    [
      '- Produce the requested task output.',
      '- Update artifacts or mission notes if execution changes state.',
    ].join('\n')
  const constraints =
    existing?.sections.get('Constraints') ||
    [
      '- Stay within the assigned role.',
      '- Escalate risky actions instead of executing them directly.',
    ].join('\n')
  const reviewNotes = existing?.sections.get('Review Notes') || 'None yet.'
  const taskNextAction =
    task.nextAction || (task.status === 'complete'
      ? 'Await manager review'
      : task.status === 'running'
        ? 'Continue execution'
        : task.status === 'blocked'
          ? 'Resolve blocker before resuming'
          : 'Start work')

  return [
    '---',
    YAML.stringify({
      task_id: taskId,
      mission_id: mission.id,
      title: task.title,
      status: task.status,
      assigned_agent: assignedAgent,
      owner: assignedAgent,
      session_key: task.workerKey || '',
      reviewer,
      created_at: taskCreatedAt,
      started_at: taskStartedAt,
      completed_at: taskCompletedAt,
      due_at: taskDueAt || mission.dueAt,
      review_at: persistedTaskReviewAt,
      approval_required: taskApprovalRequired,
      approval_status: taskApprovalStatus,
      blocked_by: taskBlockers,
      artifact_paths: taskArtifacts,
      depends_on: [],
      next_action: taskNextAction,
      requeue_count: taskRequeueCount,
      last_requeued_at: taskLastRequeuedAt,
    }).trimEnd(),
    '---',
    '',
    `# Task: ${task.title}`,
    '',
    '## Task Brief',
    '',
    taskBrief.trim() || '-',
    '',
    '## Inputs',
    '',
    inputs.trim() || '-',
    '',
    '## Output Contract',
    '',
    outputContract.trim() || '-',
    '',
    '## Constraints',
    '',
    constraints.trim() || '-',
    '',
    '## Artifacts',
    '',
    taskArtifacts.length > 0 ? taskArtifacts.map((artifact) => `- ${artifact}`).join('\n') : '- None yet.',
    '',
    '## Blockers',
    '',
    taskBlockers.length > 0 ? taskBlockers.map((blocker) => `- ${blocker}`).join('\n') : '- None yet.',
    '',
    '## Review Notes',
    '',
    reviewNotes.trim() || '- None yet.',
    '',
    '## Execution Log',
    '',
    task.output?.trim() || 'No output captured yet.',
    '',
  ].join('\n')
}

function renderReviewMarkdown(
  mission: Omit<AgencyMissionRecord, 'path'>,
  task: AgencyMissionTask,
  existing?: ParsedMarkdownDoc,
): string {
  const reviewStatus =
    task.status === 'failed'
      ? 'fail'
      : task.status === 'review'
        ? 'needs-followup'
        : task.status === 'complete'
          ? 'pass'
          : 'pass-with-notes'
  const reviewer = normalizeAgencyTaskReviewer(task.reviewer) || normalizeAgencyMissionReviewer(mission.reviewer)
  const findings = reviewStatus === 'pass'
    ? '- None yet.'
    : existing?.sections.get('Findings') ||
      (task.status === 'failed'
        ? '- Task failed and requires manager disposition.'
        : task.status === 'review'
          ? '- Review in progress.'
          : '- None yet.')
  const requiredFixes = reviewStatus === 'pass'
    ? '- None yet.'
    : existing?.sections.get('Required Fixes') ||
      (task.status === 'failed' || task.status === 'review'
        ? '- Follow up on the task findings before sign-off.'
        : '- None yet.')

  return [
    '---',
    YAML.stringify({
      review_id: `review-${slugify(task.id) || 'task'}`,
      mission_id: mission.id,
      task_id: task.id,
      reviewer,
      status: reviewStatus,
      created_at: mission.completedAt || mission.reviewAt || new Date().toISOString(),
      artifact_paths: task.artifactPaths || (task.output ? [task.output] : []),
      findings_count: reviewStatus === 'pass' ? 0 : 1,
    }).trimEnd(),
    '---',
    '',
    `# Review: ${task.title}`,
    '',
    '## Scope Reviewed',
    '',
    `- Task: ${task.id}`,
    `- Mission: ${mission.title}`,
    '',
    '## Findings',
    '',
    findings.trim() || '- None yet.',
    '',
    '## Required Fixes',
    '',
    requiredFixes.trim() || '- None yet.',
    '',
    '## Sign-Off',
    '',
    reviewStatus === 'pass'
      ? '- Signed off.'
      : reviewStatus === 'fail'
        ? '- Not signed off.'
        : '- Pending review.',
    '',
  ].join('\n')
}

function parseAgentRecord(content: string, path: string): AgencyAgentRecord {
  const parsed = parseMarkdownDoc(content)
  const id = slugify(readStringMetadata(parsed.metadata, 'id') || basename(path, '.md'))
  return {
    id,
    name: parsed.title || basename(path, '.md'),
    profile: readStringMetadata(parsed.metadata, 'profile') || id,
    emoji: readStringMetadata(parsed.metadata, 'emoji') || '🤖',
    model: readStringMetadata(parsed.metadata, 'model'),
    description: readStringMetadata(parsed.metadata, 'description'),
    systemPrompt: parsed.sections.get('System Prompt') || '',
    allowedWriteScope: parsed.sections.get('Allowed Write Scope') || '',
    forbiddenActions: parsed.sections.get('Forbidden Actions') || '',
    escalationConditions: parsed.sections.get('Escalation Conditions') || '',
    outputContract: parsed.sections.get('Output Contract') || '',
    defaultModelLane: parsed.sections.get('Default Model Lane') || readStringMetadata(parsed.metadata, 'model'),
    path,
  }
}

function parseTaskRecord(content: string, path: string): AgencyTaskRecord {
  const parsed = parseMarkdownDoc(content)
  const artifactPaths = readStringArrayValue(parsed.metadata.artifact_paths)
  const executionLog = normalizeSectionText(parsed.sections.get('Execution Log'))
  const owner = readStringMetadata(parsed.metadata, 'assigned_agent', 'owner') || null
  const sessionKey = readStringMetadata(parsed.metadata, 'session_key') || null

  return {
    id: readStringMetadata(parsed.metadata, 'task_id', 'id') || basename(path, '.md'),
    missionId: readStringMetadata(parsed.metadata, 'mission_id'),
    title: readStringMetadata(parsed.metadata, 'title') || parsed.title.replace(/^Task:\s*/i, '') || basename(path, '.md'),
    status: toTaskStatus(readStringMetadata(parsed.metadata, 'status')),
    workerKey: sessionKey,
    owner: normalizeAgencyTaskOwner(owner),
    reviewer: normalizeAgencyTaskReviewer(readStringMetadata(parsed.metadata, 'reviewer')),
    output: artifactPaths[0] || executionLog || null,
    createdAt: ensureIso(readStringMetadata(parsed.metadata, 'created_at')) || '',
    startedAt: ensureIso(readStringMetadata(parsed.metadata, 'started_at')) || '',
    completedAt: ensureIso(readStringMetadata(parsed.metadata, 'completed_at')) || '',
    dueAt: ensureIso(readStringMetadata(parsed.metadata, 'due_at')) || '',
    reviewAt: ensureIso(readStringMetadata(parsed.metadata, 'review_at')) || '',
    approvalRequired: readMetadataBoolean(parsed.metadata, 'approval_required'),
    approvalStatus: readStringMetadata(parsed.metadata, 'approval_status') || 'none',
    blockedBy: readStringArrayValue(parsed.metadata.blocked_by),
    artifactPaths,
    nextAction: readStringMetadata(parsed.metadata, 'next_action'),
    requeueCount: parseNumber(readStringMetadata(parsed.metadata, 'requeue_count'), 0),
    lastRequeuedAt: ensureIso(readStringMetadata(parsed.metadata, 'last_requeued_at')) || '',
    path,
  }
}

function parseReviewSummary(content: string, path: string): AgencyReviewSummary {
  const parsed = parseMarkdownDoc(content)
  return {
    id: readStringMetadata(parsed.metadata, 'review_id', 'id') || basename(path, '.md'),
    missionId: readStringMetadata(parsed.metadata, 'mission_id'),
    missionTitle: '',
    taskId: readStringMetadata(parsed.metadata, 'task_id'),
    taskTitle: parsed.title.replace(/^Review:\s*/i, '') || basename(path, '.md'),
    reviewer: readStringMetadata(parsed.metadata, 'reviewer') || 'qa',
    status: readStringMetadata(parsed.metadata, 'status') || 'pass-with-notes',
    createdAt: ensureIso(readStringMetadata(parsed.metadata, 'created_at')) || '',
    path,
  }
}

function parseMissionTaskIndex(parsed: ParsedMarkdownDoc): AgencyMissionTask[] {
  const tasksBlock = parsed.sections.get('Task Index') || parsed.sections.get('Tasks') || ''
  return tasksBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && line !== '- None yet.' && line !== 'None yet.')
    .map((line, index) => {
      const nextLine = line.replace(/^- \[[ xX]\]\s*/, '').trim()
      const parts = nextLine.split(' — ').map((part) => part.trim()).filter(Boolean)
      if (parts.length >= 2) {
        const metadata = new Map<string, string>()
        for (const fragment of parts.slice(2)) {
          const metaMatch = fragment.match(/^([a-z-]+):\s*(.+)$/i)
          if (metaMatch) {
            metadata.set(metaMatch[1].toLowerCase(), metaMatch[2].trim())
          }
        }
        return {
          id: parts[0] || `task-${index + 1}`,
          title: parts[1] || `Task ${index + 1}`,
          status: toTaskStatus(metadata.get('status')),
          workerKey: metadata.get('session') || null,
          owner: normalizeAgencyTaskOwner(metadata.get('owner')),
          reviewer: normalizeAgencyTaskReviewer(metadata.get('reviewer')),
          output: metadata.get('output') || null,
        } satisfies AgencyMissionTask
      }

      const legacyMatch = line.match(/^- \[([ x])\] ([^—]+)— ([^|]+)\| owner: ([^|]+) \| status: ([^|]+)(?: \| output: (.+))?$/)
      if (legacyMatch) {
        return {
          id: legacyMatch[2].trim(),
          title: legacyMatch[3].trim(),
          status: toTaskStatus(legacyMatch[5].trim()),
          workerKey: null,
          owner: normalizeAgencyTaskOwner(legacyMatch[4].trim()),
          reviewer: null,
          output: legacyMatch[6]?.trim() || null,
        } satisfies AgencyMissionTask
      }

      return {
        id: `task-${index + 1}`,
        title: nextLine,
        status: 'pending',
        workerKey: null,
        owner: null,
        output: null,
      } satisfies AgencyMissionTask
    })
}

async function readMissionTaskRecords(missionPath: string): Promise<AgencyTaskRecord[]> {
  const tasksDir = join(dirname(missionPath), 'tasks')
  let entries: Array<{ isFile(): boolean; name: string }>
  try {
    entries = await readdir(tasksDir, { withFileTypes: true })
  } catch {
    return []
  }

  const tasks = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const path = join(tasksDir, entry.name)
        const content = await readFile(path, 'utf8')
        return parseTaskRecord(content, path)
      }),
  )

  return tasks.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
}

async function readMissionReviewSummaries(
  mission: AgencyMissionRecord,
): Promise<AgencyReviewSummary[]> {
  const reviewsDir = join(dirname(mission.path), 'reviews')
  let entries: Array<{ isFile(): boolean; name: string }>
  try {
    entries = await readdir(reviewsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const reviews = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const path = join(reviewsDir, entry.name)
        const content = await readFile(path, 'utf8')
        return parseReviewSummary(content, path)
      }),
  )

  return reviews
    .map((review) => ({
      ...review,
      missionTitle: mission.title,
      taskTitle: mission.tasks.find((task) => task.id === review.taskId)?.title || review.taskTitle,
    }))
    .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
}

function mergeMissionTasks(
  current: AgencyMissionTask[],
  incoming: AgencyMissionTask[],
): AgencyMissionTask[] {
  const byId = new Map(current.map((task) => [task.id, task]))
  return incoming.map((task) => {
    const existing = byId.get(task.id)
    const normalizedOwner = normalizeAgencyTaskOwner(task.owner)
    if (!existing) {
      return {
        ...task,
        owner: normalizedOwner,
        reviewer: normalizeAgencyTaskReviewer(task.reviewer),
      }
    }
    return {
      ...existing,
      ...task,
      owner: normalizedOwner ?? existing.owner,
      reviewer: normalizeAgencyTaskReviewer(task.reviewer) ?? existing.reviewer,
      createdAt: task.createdAt ?? existing.createdAt,
      startedAt: task.startedAt ?? existing.startedAt,
      completedAt: task.completedAt ?? existing.completedAt,
      blockedBy: task.blockedBy ?? existing.blockedBy,
      artifactPaths: task.artifactPaths ?? existing.artifactPaths,
      approvalRequired: task.approvalRequired ?? existing.approvalRequired,
      approvalStatus: task.approvalStatus ?? existing.approvalStatus,
      dueAt: task.dueAt ?? existing.dueAt,
      reviewAt: task.reviewAt ?? existing.reviewAt,
      nextAction: task.nextAction ?? existing.nextAction,
      requeueCount: task.requeueCount ?? existing.requeueCount,
      lastRequeuedAt: task.lastRequeuedAt ?? existing.lastRequeuedAt,
      path: task.path ?? existing.path,
    }
  })
}

async function parseMissionRecord(content: string, path: string): Promise<AgencyMissionRecord> {
  const parsed = parseMarkdownDoc(content)
  const indexedTasks = parseMissionTaskIndex(parsed)
  const fileTasks = await readMissionTaskRecords(path)
  const tasks = fileTasks.length > 0 ? fileTasks : indexedTasks

  const workerLabels = [
    ...readStringArrayValue(parsed.metadata.worker_labels),
    ...parseBulletList(parsed.sections.get('Worker Labels')),
    ...tasks.map((task) => task.workerKey || '').filter(Boolean),
  ].filter((value, index, values) => value && values.indexOf(value) === index)

  const workerOutputsBlock = parsed.sections.get('Worker Outputs') || ''
  const workerOutputs: Record<string, string> = {}
  const workerMatches = [...workerOutputsBlock.matchAll(/^###\s+(.+)$/gm)]
  for (let index = 0; index < workerMatches.length; index += 1) {
    const current = workerMatches[index]
    const next = workerMatches[index + 1]
    const key = current[1]?.trim()
    if (!key) continue
    const start = (current.index ?? 0) + current[0].length
    const end = next?.index ?? workerOutputsBlock.length
    workerOutputs[key] = workerOutputsBlock.slice(start, end).trim()
  }

  return {
    id: readStringMetadata(parsed.metadata, 'mission_id', 'id') || basename(path, '.md'),
    title: readStringMetadata(parsed.metadata, 'title') || parsed.title.replace(/^Mission:\s*/i, ''),
    goal: normalizeSectionText(parsed.sections.get('Objective')) || readStringMetadata(parsed.metadata, 'goal'),
    status: toMissionStatus(readStringMetadata(parsed.metadata, 'status')),
    owner: normalizeAgencyMissionOwner(readStringMetadata(parsed.metadata, 'owner')),
    reviewer: normalizeAgencyMissionReviewer(readStringMetadata(parsed.metadata, 'reviewer')),
    priority: (readStringMetadata(parsed.metadata, 'priority') as AgencyMissionRecord['priority']) || 'medium',
    createdAt: ensureIso(readStringMetadata(parsed.metadata, 'created_at')) || '',
    startedAt: ensureIso(readStringMetadata(parsed.metadata, 'started_at', 'started at')) || '',
    completedAt: ensureIso(readStringMetadata(parsed.metadata, 'completed_at', 'completed at')) || '',
    dueAt: ensureIso(readStringMetadata(parsed.metadata, 'due_at')) || '',
    reviewAt: ensureIso(readStringMetadata(parsed.metadata, 'review_at')) || '',
    approvalRequired: readMetadataBoolean(parsed.metadata, 'approval_required'),
    approvalStatus: readStringMetadata(parsed.metadata, 'approval_status') || 'none',
    nextAction: readStringMetadata(parsed.metadata, 'next_action'),
    blockers: readStringArrayValue(parsed.metadata.blockers),
    artifacts: readStringArrayValue(parsed.metadata.artifacts),
    linkedTasks: readStringArrayValue(parsed.metadata.linked_tasks),
    jobId: readStringMetadata(parsed.metadata, 'job_id', 'job id'),
    orchestratorSessionKey: readStringMetadata(parsed.metadata, 'orchestrator_session_key', 'orchestrator session'),
    summary: normalizeSectionText(parsed.sections.get('Summary')),
    outputPath: readStringMetadata(parsed.metadata, 'output_path', 'output path'),
    error: readStringMetadata(parsed.metadata, 'error'),
    workerCount: parseNumber(readStringMetadata(parsed.metadata, 'worker_count', 'worker count'), 0),
    workerLabels,
    tasks,
    streamText: normalizeSectionText(parsed.sections.get('Execution Log')) || normalizeSectionText(parsed.sections.get('Stream Output')),
    workerOutputs,
    path,
  }
}

async function ensureAgencyRoot(): Promise<void> {
  await mkdir(AGENTS_DIR, { recursive: true })
  await mkdir(MISSIONS_DIR, { recursive: true })
  await mkdir(MEMORY_DIR, { recursive: true })
  await mkdir(QUEUES_DIR, { recursive: true })

  try {
    await readFile(SETTINGS_FILE, 'utf8')
  } catch {
    await writeFile(SETTINGS_FILE, renderSettingsMarkdown(DEFAULT_SETTINGS), 'utf8')
  }
}

async function syncMissionTaskFiles(mission: AgencyMissionRecord): Promise<void> {
  const tasksDir = join(dirname(mission.path), 'tasks')
  await mkdir(tasksDir, { recursive: true })

  const desired = new Set<string>()
  for (const task of mission.tasks) {
    const taskSlug = slugify(task.id) || 'task'
    const taskPath = join(tasksDir, `${taskSlug}.md`)
    desired.add(taskPath)

    let existing: ParsedMarkdownDoc | undefined
    try {
      existing = parseMarkdownDoc(await readFile(taskPath, 'utf8'))
    } catch {
      existing = undefined
    }

    await writeFile(taskPath, renderTaskMarkdown(mission, task, existing), 'utf8')
  }

  const entries = await readdir(tasksDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const path = join(tasksDir, entry.name)
        if (desired.has(path)) return
        await rm(path, { force: true })
      }),
  )
}

async function syncMissionReviewFiles(mission: AgencyMissionRecord): Promise<void> {
  const reviewsDir = join(dirname(mission.path), 'reviews')
  await mkdir(reviewsDir, { recursive: true })

  const reviewableTasks = mission.tasks.filter((task) => task.status === 'review' || task.status === 'complete' || task.status === 'failed')
  const desired = new Set<string>()

  for (const task of reviewableTasks) {
    const reviewPath = join(reviewsDir, `review-${slugify(task.id) || 'task'}.md`)
    desired.add(reviewPath)

    let existing: ParsedMarkdownDoc | undefined
    try {
      existing = parseMarkdownDoc(await readFile(reviewPath, 'utf8'))
    } catch {
      existing = undefined
    }

    await writeFile(reviewPath, renderReviewMarkdown(mission, task, existing), 'utf8')
  }

  const entries = await readdir(reviewsDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const path = join(reviewsDir, entry.name)
        if (desired.has(path)) return
        await rm(path, { force: true })
      }),
  )
}

async function persistAgencyMissionInternal(
  mission: AgencyMissionRecord,
  options: { rebuildQueues?: boolean } = {},
): Promise<AgencyMissionRecord> {
  await writeFile(mission.path, renderMissionMarkdown(mission), 'utf8')
  await syncMissionTaskFiles(mission)
  await syncMissionReviewFiles(mission)
  if (options.rebuildQueues !== false) {
    await rebuildAgencyQueues()
  }
  return mission
}

async function persistAgencyMission(mission: AgencyMissionRecord): Promise<AgencyMissionRecord> {
  return await persistAgencyMissionInternal(mission, { rebuildQueues: true })
}

export async function listAgencyAgents(): Promise<AgencyAgentRecord[]> {
  await ensureAgencyRoot()
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true })
  const agents = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const path = join(AGENTS_DIR, entry.name)
        const content = await readFile(path, 'utf8')
        return parseAgentRecord(content, path)
      }),
  )
  return agents.sort((left, right) => left.name.localeCompare(right.name))
}

export async function upsertAgencyAgent(
  record: Omit<AgencyAgentRecord, 'path'>,
): Promise<AgencyAgentRecord> {
  await ensureAgencyRoot()
  const id = slugify(record.id || record.name)
  const path = join(AGENTS_DIR, `${id}.md`)
  let existing: ParsedMarkdownDoc | undefined
  try {
    existing = parseMarkdownDoc(await readFile(path, 'utf8'))
  } catch {
    existing = undefined
  }

  const nextRecord = {
    ...record,
    id,
    profile: record.profile || id,
    emoji: record.emoji || '🤖',
  }

  await writeFile(path, renderAgentMarkdown(nextRecord, existing), 'utf8')
  return { ...nextRecord, path }
}

export async function deleteAgencyAgent(agentId: string): Promise<void> {
  await ensureAgencyRoot()
  const id = slugify(agentId)
  if (!id) return
  await rm(join(AGENTS_DIR, `${id}.md`), { force: true })
}

export async function getAgencySettings(): Promise<AgencySettings> {
  await ensureAgencyRoot()
  const content = await readFile(SETTINGS_FILE, 'utf8')
  const parsed = parseMarkdownDoc(content)
  return {
    defaultModel: readStringMetadata(parsed.metadata, 'default model') || DEFAULT_SETTINGS.defaultModel,
    autoApprove: false,
    activityFeedLength: Math.min(
      20,
      Math.max(1, parseNumber(readStringMetadata(parsed.metadata, 'activity feed length'), DEFAULT_SETTINGS.activityFeedLength)),
    ),
    orchestratorName: readStringMetadata(parsed.metadata, 'orchestrator name') || DEFAULT_SETTINGS.orchestratorName,
  }
}

export async function saveAgencySettings(
  settings: Partial<AgencySettings>,
): Promise<AgencySettings> {
  await ensureAgencyRoot()
  const current = await getAgencySettings()
  const next = {
    ...current,
    ...settings,
    autoApprove: false,
    activityFeedLength: Math.min(
      20,
      Math.max(1, Math.round(settings.activityFeedLength ?? current.activityFeedLength)),
    ),
    orchestratorName: settings.orchestratorName?.trim() || current.orchestratorName,
  }
  await writeFile(SETTINGS_FILE, renderSettingsMarkdown(next), 'utf8')
  return next
}

function missionDirName(goal: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = slugify(goal).slice(0, 48) || 'mission'
  return `${stamp}-${slug}-${Date.now()}`
}

function missionTitleFromGoal(goal: string): string {
  const trimmed = goal.trim()
  if (!trimmed) return 'Untitled mission'
  return trimmed.length > 90 ? `${trimmed.slice(0, 89).trimEnd()}…` : trimmed
}

function toMissionStatus(
  value: string | undefined,
): AgencyMissionRecord['status'] {
  switch ((value || '').trim()) {
    case 'running':
    case 'paused':
    case 'blocked':
    case 'needs-approval':
    case 'review':
    case 'completed':
    case 'failed':
    case 'canceled':
      return value as AgencyMissionRecord['status']
    default:
      return 'proposed'
  }
}

function toTaskStatus(
  value: string | undefined,
): AgencyMissionTask['status'] {
  switch ((value || '').trim()) {
    case 'ready':
    case 'running':
    case 'blocked':
    case 'needs-approval':
    case 'review':
    case 'complete':
    case 'failed':
      return value as AgencyMissionTask['status']
    default:
      return 'pending'
  }
}

export async function listAgencyMissions(): Promise<AgencyMissionRecord[]> {
  await ensureAgencyRoot()
  const entries = await readdir(MISSIONS_DIR, { withFileTypes: true })
  const missions = await Promise.all(
    entries
      .filter((entry) => {
        if (entry.isDirectory()) return true
        return entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md'
      })
      .map(async (entry) => {
        const path = entry.isDirectory()
          ? join(MISSIONS_DIR, entry.name, 'mission.md')
          : join(MISSIONS_DIR, entry.name)
        const content = await readFile(path, 'utf8')
        return await parseMissionRecord(content, path)
      }),
  )
  return missions.sort((left, right) => (right.startedAt || right.createdAt).localeCompare(left.startedAt || left.createdAt))
}

export async function getAgencyMission(missionId: string): Promise<AgencyMissionRecord | null> {
  const missions = await listAgencyMissions()
  return missions.find((mission) => mission.id === missionId) ?? null
}

function taskNeedsApproval(task: AgencyMissionTask): boolean {
  return task.status === 'needs-approval' || task.approvalRequired === true || task.approvalStatus === 'pending'
}

function taskIsBlocked(task: AgencyMissionTask): boolean {
  return task.status === 'blocked' || Boolean(task.blockedBy && task.blockedBy.length > 0)
}

function taskIsFailed(task: AgencyMissionTask): boolean {
  return task.status === 'failed'
}

function taskIsActive(task: AgencyMissionTask): boolean {
  return task.status === 'ready' || task.status === 'running' || task.status === 'review'
}

const STALLED_ZERO_TASK_MISSION_MS = 10 * 60 * 1000

function missionIsStalledZeroTaskRun(mission: AgencyMissionRecord, nowMs: number): boolean {
  if (mission.status !== 'running') return false
  if (mission.tasks.length > 0) return false
  const startedMs = parseDateMs(mission.startedAt || mission.createdAt)
  return startedMs > 0 && nowMs - startedMs >= STALLED_ZERO_TASK_MISSION_MS
}

function cancelStalledZeroTaskMission(mission: AgencyMissionRecord, now: string): AgencyMissionRecord {
  return {
    ...mission,
    status: 'canceled',
    completedAt: now,
    approvalRequired: false,
    approvalStatus: 'none',
    error: 'Auto-canceled stale Conductor run with no decomposed tasks.',
    nextAction: 'Start a new mission after choosing a real execution target.',
    summary:
      mission.summary ||
      'This Conductor run was canceled automatically because it stayed running without producing any tasks.',
  }
}

function taskIsStale(task: AgencyMissionTask): boolean {
  if (task.status === 'complete' || task.status === 'failed') return false
  return isPastDue(task.reviewAt) || isPastDue(task.dueAt)
}

function missionCanBeStale(mission: AgencyMissionRecord): boolean {
  return mission.status !== 'completed' && mission.status !== 'failed' && mission.status !== 'canceled'
}

function missionIsStale(mission: AgencyMissionRecord): boolean {
  if (!missionCanBeStale(mission)) return false
  if (isPastDue(mission.dueAt)) return true
  return (
    (mission.status === 'review' || mission.status === 'needs-approval' || mission.status === 'blocked')
    && isPastDue(mission.reviewAt)
  )
}

function assertMissionMutationAuthorized(actor: string | null | undefined): AgencyActorRole {
  const role = normalizeAgencyActorRole(actor)
  if (role !== 'manager') {
    throw new Error('Only manager may update mission state')
  }
  return role
}

function assertTaskActionAuthorized(
  task: AgencyMissionTask,
  input: AgencyTaskActionInput,
): AgencyActorRole {
  const role = normalizeAgencyActorRole(input.actor)
  if (!role) {
    throw new Error('A valid actor role is required for task actions')
  }

  switch (input.action) {
    case 'approve':
    case 'reject':
      if (role !== 'manager') {
        throw new Error('Only manager may approve or reject tasks')
      }
      return role

    case 'mark-passed':
    case 'mark-failed':
      if (role !== 'manager' && role !== 'qa') {
        throw new Error('Only manager or qa may sign off review outcomes')
      }
      return role

    case 'start-review':
      if (taskNeedsApproval(task)) {
        throw new Error('Task still requires approval before it can enter review')
      }
      if (role === 'manager' || role === 'qa') {
        return role
      }
      if (task.owner && role === task.owner) {
        return role
      }
      throw new Error('Only the task owner, manager, or qa may move a task into review')
  }
}

function dedupeStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = (value || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function withTaskArtifactPaths(task: AgencyMissionTask): string[] {
  if (Array.isArray(task.artifactPaths) && task.artifactPaths.length > 0) {
    return task.artifactPaths
  }
  return task.output ? [task.output] : []
}

function deriveMissionFromTasks(
  mission: AgencyMissionRecord,
  tasks: AgencyMissionTask[],
  now: string,
): Partial<AgencyMissionRecord> {
  const linkedTasks = tasks.map((task) => task.id).filter(Boolean)
  const workerLabels = dedupeStrings([
    ...mission.workerLabels,
    ...tasks.map((task) => task.owner || task.workerKey),
  ])
  const artifacts = dedupeStrings([
    ...mission.artifacts,
    ...tasks.flatMap((task) => withTaskArtifactPaths(task)),
    mission.outputPath,
  ])
  const blockers = dedupeStrings(tasks.flatMap((task) => task.status === 'blocked' ? task.blockedBy || [] : []))
  const pendingApprovalTask = tasks.find((task) => taskNeedsApproval(task))
  const failedTask = tasks.find((task) => task.status === 'failed')
  const blockedTask = tasks.find((task) => task.status === 'blocked')
  const reviewTask = tasks.find((task) => task.status === 'review')
  const activeTask = tasks.find((task) => task.status === 'running' || task.status === 'ready')
  const allComplete = tasks.length > 0 && tasks.every((task) => task.status === 'complete')
  const approvalStatus =
    pendingApprovalTask
      ? 'pending'
      : tasks.some((task) => task.approvalStatus === 'rejected')
        ? 'rejected'
        : tasks.some((task) => task.approvalStatus === 'approved')
          ? 'approved'
          : 'none'
  const reviewAt = latestIso([
    mission.reviewAt,
    ...tasks.map((task) => task.status === 'review' || task.status === 'complete' || task.status === 'failed' ? task.reviewAt : ''),
  ])

  if (pendingApprovalTask) {
    return {
      status: 'needs-approval',
      approvalRequired: true,
      approvalStatus,
      blockers: [],
      error: '',
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: pendingApprovalTask.nextAction || `Approval needed for ${pendingApprovalTask.title}`,
    }
  }

  if (failedTask) {
    return {
      status: 'failed',
      approvalRequired: false,
      approvalStatus,
      blockers: [],
      error: failedTask.nextAction || `Task failed: ${failedTask.title}`,
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: failedTask.nextAction || `Resolve failed task: ${failedTask.title}`,
    }
  }

  if (blockedTask) {
    return {
      status: 'blocked',
      approvalRequired: false,
      approvalStatus,
      blockers,
      error: '',
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: blockedTask.nextAction || `Unblock task: ${blockedTask.title}`,
    }
  }

  if (reviewTask) {
    return {
      status: 'review',
      approvalRequired: false,
      approvalStatus,
      blockers: [],
      error: '',
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: reviewTask.nextAction || `Review ${reviewTask.title}`,
    }
  }

  if (allComplete) {
    return {
      status: 'completed',
      approvalRequired: false,
      approvalStatus,
      blockers: [],
      error: '',
      completedAt: mission.completedAt || now,
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: 'Mission complete',
    }
  }

  if (activeTask) {
    return {
      status: 'running',
      approvalRequired: false,
      approvalStatus,
      blockers: [],
      error: '',
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: activeTask.nextAction || `Continue ${activeTask.title}`,
    }
  }

  if (tasks.length > 0) {
    const nextPending = tasks.find((task) => task.status === 'pending')
    return {
      status: mission.status === 'paused' ? 'paused' : 'running',
      approvalRequired: false,
      approvalStatus,
      blockers: [],
      error: '',
      completedAt: '',
      reviewAt,
      linkedTasks,
      artifacts,
      workerLabels,
      nextAction: nextPending?.nextAction || nextPending?.title || mission.nextAction,
    }
  }

  return {
    linkedTasks,
    artifacts,
    workerLabels,
  }
}

function normalizeAgencyTaskActionTask(
  task: AgencyMissionTask,
  input: AgencyTaskActionInput,
  now: string,
): AgencyMissionTask {
  const note = input.note?.trim()
  const actor = input.actor?.trim()
  const explicitReviewAt = ensureIso(input.reviewAt) || (input.reviewAt === '' ? '' : '')
  const explicitDueAt = ensureIso(input.dueAt) || (input.dueAt === '' ? '' : '')
  const baseArtifacts =
    input.artifactPaths === null
      ? []
      : Array.isArray(input.artifactPaths)
        ? dedupeStrings(input.artifactPaths)
        : task.artifactPaths
  const nextOutput =
    input.output === undefined
      ? task.output
      : input.output === null
        ? null
        : input.output.trim() || null
  const nextWorkerKey =
    input.workerKey === undefined
      ? task.workerKey
      : input.workerKey === null
        ? null
        : input.workerKey.trim() || null

  const next: AgencyMissionTask = {
    ...task,
    createdAt: task.createdAt || now,
    output: nextOutput,
    workerKey: nextWorkerKey,
    dueAt: explicitDueAt || (input.dueAt === '' ? '' : task.dueAt),
    reviewAt: explicitReviewAt || (input.reviewAt === '' ? '' : task.reviewAt),
    artifactPaths: baseArtifacts,
  }

  switch (input.action) {
    case 'approve':
      next.status =
        task.status === 'review' || task.status === 'complete'
          ? task.status
          : 'ready'
      next.approvalRequired = false
      next.approvalStatus = 'approved'
      next.completedAt = ''
      next.reviewAt = next.status === 'review' ? (explicitReviewAt || now) : ''
      next.blockedBy = input.blockedBy === null
        ? []
        : Array.isArray(input.blockedBy)
          ? dedupeStrings(input.blockedBy)
          : []
      next.nextAction = input.nextAction?.trim() || (
        next.status === 'review'
          ? 'Complete review and sign-off'
          : 'Resume task execution'
      )
      return next

    case 'reject':
      next.status = 'blocked'
      next.approvalRequired = false
      next.approvalStatus = 'rejected'
      next.completedAt = ''
      next.blockedBy = input.blockedBy === null
        ? []
        : Array.isArray(input.blockedBy)
          ? dedupeStrings(input.blockedBy)
          : dedupeStrings([
              note ? `Approval rejected: ${note}` : '',
              !note && actor ? `Approval rejected by ${actor}` : '',
              !note && !actor ? 'Approval rejected' : '',
            ])
      next.nextAction = input.nextAction?.trim() || 'Address approval feedback before resubmitting'
      return next

    case 'start-review':
      next.status = 'review'
      next.approvalRequired = false
      next.approvalStatus =
        task.approvalStatus === 'pending'
          ? 'approved'
          : task.approvalStatus || 'none'
      next.startedAt = task.startedAt || now
      next.completedAt = ''
      next.blockedBy = input.blockedBy === null
        ? []
        : Array.isArray(input.blockedBy)
          ? dedupeStrings(input.blockedBy)
          : []
      next.reviewAt = explicitReviewAt || now
      next.nextAction = input.nextAction?.trim() || 'Review in progress'
      return next

    case 'mark-passed':
      next.status = 'complete'
      next.approvalRequired = false
      next.approvalStatus =
        task.approvalStatus === 'rejected'
          ? 'approved'
          : task.approvalStatus === 'none' || !task.approvalStatus
            ? 'approved'
            : task.approvalStatus
      next.blockedBy = input.blockedBy === null
        ? []
        : Array.isArray(input.blockedBy)
          ? dedupeStrings(input.blockedBy)
          : []
      next.reviewAt = explicitReviewAt || now
      next.completedAt = now
      next.nextAction = input.nextAction?.trim() || 'Review passed'
      return next

    case 'mark-failed':
      next.status = 'failed'
      next.approvalRequired = false
      next.approvalStatus =
        task.approvalStatus === 'pending'
          ? 'approved'
          : task.approvalStatus || 'approved'
      next.blockedBy = input.blockedBy === null
        ? []
        : Array.isArray(input.blockedBy)
          ? dedupeStrings(input.blockedBy)
          : dedupeStrings([
              note ? `Review failed: ${note}` : '',
              !note && actor ? `Review failed by ${actor}` : '',
              !note && !actor ? 'Review failed' : '',
            ])
      next.reviewAt = explicitReviewAt || now
      next.completedAt = ''
      next.nextAction = input.nextAction?.trim() || 'Address review findings and resubmit'
      return next
  }
}

function taskMayAutoRequeue(task: AgencyMissionTask): boolean {
  const owner = normalizeAgencyActorRole(task.owner)
  if (!owner || !AUTO_REQUEUE_ROLE_IDS.includes(owner as (typeof AUTO_REQUEUE_ROLE_IDS)[number])) {
    return false
  }
  if ((task.requeueCount || 0) >= AUTO_REQUEUE_LIMIT) {
    return false
  }
  if (taskNeedsApproval(task) || taskIsBlocked(task) || task.status === 'review' || task.status === 'complete') {
    return false
  }
  if (task.status === 'failed') return true
  return task.status === 'pending' || task.status === 'ready' || task.status === 'running'
    ? taskIsStale(task)
    : false
}

function autoRequeueTask(task: AgencyMissionTask, now: string): AgencyMissionTask {
  const nextCount = (task.requeueCount || 0) + 1
  const reason = task.status === 'failed' ? 'failure' : 'staleness'
  return {
    ...task,
    status: 'ready',
    approvalRequired: false,
    approvalStatus: task.approvalStatus === 'pending' ? 'none' : task.approvalStatus || 'none',
    blockedBy: [],
    dueAt: '',
    reviewAt: '',
    completedAt: '',
    requeueCount: nextCount,
    lastRequeuedAt: now,
    nextAction: `Retry after ${reason} (auto-requeued ${nextCount}/${AUTO_REQUEUE_LIMIT})`,
  }
}

function reconcileMissionAutoRequeue(
  mission: AgencyMissionRecord,
  now: string,
): { mission: AgencyMissionRecord; changed: boolean } {
  let changed = false
  const nextTasks = mission.tasks.map((task) => {
    if (!taskMayAutoRequeue(task)) return task
    changed = true
    return autoRequeueTask(task, now)
  })

  if (!changed) {
    return { mission, changed: false }
  }

  const derivedMission = deriveMissionFromTasks(mission, nextTasks, now)
  return {
    changed: true,
    mission: {
      ...mission,
      ...derivedMission,
      tasks: nextTasks,
    },
  }
}

function missionQueueDetail(mission: AgencyMissionRecord, mode: 'default' | 'approvals' | 'blocked' | 'failed' | 'stale'): string {
  if (mode === 'approvals') {
    const task = mission.tasks.find((entry) => taskNeedsApproval(entry))
    if (task) return `approval needed: ${task.title}`
    if (mission.nextAction) return mission.nextAction
  }

  if (mode === 'blocked') {
    const task = mission.tasks.find((entry) => taskIsBlocked(entry))
    if (task) return `blocked: ${task.title}`
    if (mission.blockers.length > 0) return mission.blockers[0] || mission.status
  }

  if (mode === 'failed') {
    const task = mission.tasks.find((entry) => taskIsFailed(entry))
    if (task) return `failed: ${task.title}`
    if (mission.error) return mission.error
  }

  if (mode === 'stale') {
    const task = mission.tasks.find((entry) => taskIsStale(entry))
    if (task) return `stale: ${task.title}`
    if (mission.nextAction) return mission.nextAction
  }

  return mission.summary.trim() || mission.goal.trim() || mission.status
}

function missionQueueItem(
  mission: AgencyMissionRecord,
  detail: string,
): AgencyQueueItem {
  return {
    label: mission.title,
    detail,
    path: mission.path,
  }
}

function taskQueueItem(
  mission: AgencyMissionRecord,
  task: AgencyMissionTask,
  detail: string,
): AgencyQueueItem {
  return {
    label: `${mission.title} / ${task.title}`,
    detail,
    path: task.path || mission.path,
  }
}

function toAgencyStateQueueItem(
  mission: AgencyMissionRecord,
  detail: string,
  status: string,
  task?: AgencyMissionTask,
): AgencyStateQueueItem {
  return {
    missionId: mission.id,
    missionTitle: mission.title,
    taskId: task?.id || null,
    taskTitle: task?.title || null,
    detail,
    status,
    path: task?.path || mission.path,
    dueAt: task?.dueAt || mission.dueAt,
    reviewAt: task?.reviewAt || mission.reviewAt,
  }
}

function buildAgencyQueueBuckets(missions: AgencyMissionRecord[]): {
  inbox: AgencyQueueItem[]
  active: AgencyQueueItem[]
  blocked: AgencyQueueItem[]
  approvals: AgencyQueueItem[]
  failed: AgencyQueueItem[]
  stale: AgencyQueueItem[]
  state: {
    inbox: AgencyStateQueueItem[]
    active: AgencyStateQueueItem[]
    blocked: AgencyStateQueueItem[]
    approvals: AgencyStateQueueItem[]
    failed: AgencyStateQueueItem[]
    stale: AgencyStateQueueItem[]
  }
} {
  const inbox = missions
    .filter((mission) => mission.status === 'proposed')
    .map((mission) => missionQueueItem(mission, missionQueueDetail(mission, 'default')))
  const inboxState = missions
    .filter((mission) => mission.status === 'proposed')
    .map((mission) => toAgencyStateQueueItem(mission, missionQueueDetail(mission, 'default'), mission.status))

  const active: AgencyQueueItem[] = []
  const activeState: AgencyStateQueueItem[] = []
  for (const mission of missions) {
    if (mission.status === 'completed' || mission.status === 'canceled') {
      continue
    }
    const taskItems = mission.tasks.filter((task) => taskIsActive(task))
    if (taskItems.length > 0) {
      for (const task of taskItems) {
        const detail = task.nextAction || task.status
        active.push(taskQueueItem(mission, task, detail))
        activeState.push(toAgencyStateQueueItem(mission, detail, task.status, task))
      }
      continue
    }
    if (mission.status === 'running' || mission.status === 'paused' || mission.status === 'review') {
      const detail = mission.nextAction || mission.status
      active.push(missionQueueItem(mission, detail))
      activeState.push(toAgencyStateQueueItem(mission, detail, mission.status))
    }
  }

  const blocked: AgencyQueueItem[] = []
  const blockedState: AgencyStateQueueItem[] = []
  for (const mission of missions) {
    if (mission.status === 'completed' || mission.status === 'canceled') {
      continue
    }
    const taskItems = mission.tasks.filter((task) => taskIsBlocked(task))
    if (taskItems.length > 0) {
      for (const task of taskItems) {
        const detail = (task.blockedBy && task.blockedBy[0]) || task.nextAction || 'blocked'
        blocked.push(taskQueueItem(mission, task, detail))
        blockedState.push(toAgencyStateQueueItem(mission, detail, task.status, task))
      }
      continue
    }
    if (mission.status === 'blocked') {
      const detail = missionQueueDetail(mission, 'blocked')
      blocked.push(missionQueueItem(mission, detail))
      blockedState.push(toAgencyStateQueueItem(mission, detail, mission.status))
    }
  }

  const approvals: AgencyQueueItem[] = []
  const approvalsState: AgencyStateQueueItem[] = []
  for (const mission of missions) {
    if (mission.status === 'completed' || mission.status === 'canceled') {
      continue
    }
    const taskItems = mission.tasks.filter((task) => taskNeedsApproval(task))
    if (taskItems.length > 0) {
      for (const task of taskItems) {
        const detail = task.nextAction || 'approval required'
        approvals.push(taskQueueItem(mission, task, detail))
        approvalsState.push(toAgencyStateQueueItem(mission, detail, task.status, task))
      }
      continue
    }
    if (mission.status === 'needs-approval' || mission.approvalRequired || mission.approvalStatus === 'pending') {
      const detail = missionQueueDetail(mission, 'approvals')
      approvals.push(missionQueueItem(mission, detail))
      approvalsState.push(toAgencyStateQueueItem(mission, detail, mission.status))
    }
  }

  const failed: AgencyQueueItem[] = []
  const failedState: AgencyStateQueueItem[] = []
  for (const mission of missions) {
    if (mission.status === 'completed' || mission.status === 'canceled') {
      continue
    }
    const taskItems = mission.tasks.filter((task) => taskIsFailed(task))
    if (taskItems.length > 0) {
      for (const task of taskItems) {
        const detail = task.nextAction || 'failed'
        failed.push(taskQueueItem(mission, task, detail))
        failedState.push(toAgencyStateQueueItem(mission, detail, task.status, task))
      }
      continue
    }
    if (mission.status === 'failed') {
      const detail = missionQueueDetail(mission, 'failed')
      failed.push(missionQueueItem(mission, detail))
      failedState.push(toAgencyStateQueueItem(mission, detail, mission.status))
    }
  }

  const stale: AgencyQueueItem[] = []
  const staleState: AgencyStateQueueItem[] = []
  for (const mission of missions) {
    if (mission.status === 'completed' || mission.status === 'canceled') {
      continue
    }
    const taskItems = mission.tasks.filter((task) => taskIsStale(task))
    if (taskItems.length > 0) {
      for (const task of taskItems) {
        const detail = task.nextAction || 'stale'
        stale.push(taskQueueItem(mission, task, detail))
        staleState.push(toAgencyStateQueueItem(mission, detail, task.status, task))
      }
      continue
    }
    if (missionIsStale(mission)) {
      const detail = missionQueueDetail(mission, 'stale')
      stale.push(missionQueueItem(mission, detail))
      staleState.push(toAgencyStateQueueItem(mission, detail, mission.status))
    }
  }

  return {
    inbox,
    active,
    blocked,
    approvals,
    failed,
    stale,
    state: {
      inbox: inboxState,
      active: activeState,
      blocked: blockedState,
      approvals: approvalsState,
      failed: failedState,
      stale: staleState,
    },
  }
}

function renderQueueFile(
  title: string,
  sectionLabel: string,
  items: AgencyQueueItem[],
): string {
  const lines = items.length > 0
    ? items.map((item) => {
        const relPath = relative(QUEUES_DIR, item.path)
        return `- [${item.label}](${relPath}) — ${item.detail}`
      }).join('\n')
    : '- None yet.'

  return [
    `# ${title}`,
    '',
    `## ${sectionLabel}`,
    '',
    lines,
    '',
  ].join('\n')
}

function toManagerLabel(item: AgencyStateQueueItem): string {
  return item.taskTitle
    ? `${item.missionTitle} / ${item.taskTitle}`
    : item.missionTitle
}

function uniqueLines(values: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const line = value.trim()
    if (!line || seen.has(line)) continue
    seen.add(line)
    result.push(line)
    if (result.length >= limit) break
  }
  return result
}

function buildAgencyDailyReviewSummary(input: {
  missions: AgencyMissionRecord[]
  queues: {
    active: AgencyStateQueueItem[]
    blocked: AgencyStateQueueItem[]
    approvals: AgencyStateQueueItem[]
    failed: AgencyStateQueueItem[]
    stale: AgencyStateQueueItem[]
  }
  reviews: AgencyReviewSummary[]
}): AgencyDailyReviewSummary {
  const { missions, queues, reviews } = input
  const openMissionIds = new Set(
    missions
      .filter((mission) => mission.status !== 'completed' && mission.status !== 'canceled')
      .map((mission) => mission.id),
  )
  const running = missions.filter((mission) => mission.status === 'running')
  const priorities = uniqueLines(
    [
      ...queues.approvals.map((item) => `${toManagerLabel(item)}: ${item.detail}`),
      ...queues.active
        .filter((item) => item.status === 'running' || item.status === 'review')
        .map((item) => `${toManagerLabel(item)}: ${item.detail}`),
      ...running
        .filter((mission) => !mission.tasks.length)
        .map((mission) => `${mission.title}: ${mission.nextAction || 'advance mission execution'}`),
    ],
    3,
  )
  const risks = uniqueLines(
    [
      ...queues.blocked.map((item) => `${toManagerLabel(item)}: ${item.detail}`),
      ...queues.stale.map((item) => `${toManagerLabel(item)}: ${item.detail}`),
      ...queues.failed.map((item) => `${toManagerLabel(item)}: ${item.detail}`),
    ],
    3,
  )
  const requiredDecisions = uniqueLines(
    [
      ...queues.approvals.map((item) => `${toManagerLabel(item)}: approval required`),
      ...reviews
        .filter((review) => openMissionIds.has(review.missionId))
        .filter((review) => review.status === 'fail' || review.status === 'needs-followup' || review.status === 'pass-with-notes')
        .map((review) => `${review.missionTitle} / ${review.taskTitle}: ${review.status}`),
      ...queues.failed.map((item) => `${toManagerLabel(item)}: choose retry, block, or close`),
    ],
    3,
  )

  return {
    generatedAt: new Date().toISOString(),
    topPriorities: priorities,
    risks,
    requiredDecisions,
  }
}

function buildAgencyAgentScorecards(input: {
  agents: AgencyAgentRecord[]
  missions: AgencyMissionRecord[]
  reviews: AgencyReviewSummary[]
}): AgencyAgentScorecard[] {
  const scorecards = new Map<string, AgencyAgentScorecard>()
  const taskOwners = new Map<string, AgencyActorRole>()

  for (const agent of input.agents) {
    const agentId = normalizeAgencyActorRole(agent.id)
    if (!agentId) continue
    scorecards.set(agentId, {
      agentId,
      name: agent.name,
      assignedTasks: 0,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      reviewPasses: 0,
      reviewFollowups: 0,
      requeueCount: 0,
      averageCycleHours: 0,
    })
  }

  const durationMsByAgent = new Map<string, number>()
  const durationSamplesByAgent = new Map<string, number>()

  for (const mission of input.missions) {
    for (const task of mission.tasks) {
      const owner = normalizeAgencyActorRole(task.owner)
      if (!owner) continue
      const scorecard = scorecards.get(owner) || {
        agentId: owner,
        name: owner,
        assignedTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        reviewPasses: 0,
        reviewFollowups: 0,
        requeueCount: 0,
        averageCycleHours: 0,
      }
      scorecard.assignedTasks += 1
      if (taskIsActive(task)) scorecard.activeTasks += 1
      if (task.status === 'complete') scorecard.completedTasks += 1
      if (task.status === 'failed') scorecard.failedTasks += 1
      scorecard.requeueCount += Math.max(0, Math.round(task.requeueCount || 0))
      scorecards.set(owner, scorecard)
      taskOwners.set(`${mission.id}:${task.id}`, owner)

      const startMs = parseDateMs(task.startedAt || task.createdAt || mission.startedAt || mission.createdAt)
      const endMs = parseDateMs(task.completedAt || (task.status === 'complete' ? (task.reviewAt || mission.completedAt || mission.reviewAt) : ''))
      if (startMs > 0 && endMs >= startMs) {
        durationMsByAgent.set(owner, (durationMsByAgent.get(owner) || 0) + (endMs - startMs))
        durationSamplesByAgent.set(owner, (durationSamplesByAgent.get(owner) || 0) + 1)
      }
    }
  }

  for (const review of input.reviews) {
    const owner = taskOwners.get(`${review.missionId}:${review.taskId}`)
    if (!owner) continue
    const scorecard = scorecards.get(owner)
    if (!scorecard) continue
    if (review.status === 'pass') {
      scorecard.reviewPasses += 1
    } else {
      scorecard.reviewFollowups += 1
    }
  }

  return [...scorecards.values()]
    .map((scorecard) => {
      const durationMs = durationMsByAgent.get(scorecard.agentId) || 0
      const samples = durationSamplesByAgent.get(scorecard.agentId) || 0
      return {
        ...scorecard,
        averageCycleHours:
          samples > 0 ? Math.round(((durationMs / samples) / 3_600_000) * 10) / 10 : 0,
      }
    })
    .sort((left, right) => {
      const leftWeight = left.completedTasks * 3 + left.activeTasks * 2 + left.reviewPasses
      const rightWeight = right.completedTasks * 3 + right.activeTasks * 2 + right.reviewPasses
      return rightWeight - leftWeight || left.name.localeCompare(right.name)
    })
}

async function reconcileAgencyMissionsForAutoRequeue(
  missions: AgencyMissionRecord[],
): Promise<{ missions: AgencyMissionRecord[]; changed: boolean }> {
  const now = new Date().toISOString()
  const nowMs = Date.parse(now)
  const nextMissions: AgencyMissionRecord[] = []
  let changed = false

  for (const mission of missions) {
    if (missionIsStalledZeroTaskRun(mission, nowMs)) {
      const canceled = cancelStalledZeroTaskMission(mission, now)
      nextMissions.push(canceled)
      changed = true
      await persistAgencyMissionInternal(canceled, { rebuildQueues: false })
      continue
    }
    const reconciled = reconcileMissionAutoRequeue(mission, now)
    nextMissions.push(reconciled.mission)
    if (!reconciled.changed) continue
    changed = true
    await persistAgencyMissionInternal(reconciled.mission, { rebuildQueues: false })
  }

  return { missions: nextMissions, changed }
}

async function writeAgencyQueueFiles(buckets: {
  inbox: AgencyQueueItem[]
  active: AgencyQueueItem[]
  blocked: AgencyQueueItem[]
  approvals: AgencyQueueItem[]
  failed: AgencyQueueItem[]
  stale: AgencyQueueItem[]
}): Promise<void> {
  await writeFile(join(QUEUES_DIR, 'inbox.md'), renderQueueFile('Inbox', 'Items', buckets.inbox), 'utf8')
  await writeFile(join(QUEUES_DIR, 'active.md'), renderQueueFile('Active Work', 'Tasks', buckets.active), 'utf8')
  await writeFile(join(QUEUES_DIR, 'blocked.md'), renderQueueFile('Blocked Work', 'Tasks', buckets.blocked), 'utf8')
  await writeFile(join(QUEUES_DIR, 'approvals.md'), renderQueueFile('Approvals', 'Pending', buckets.approvals), 'utf8')
  await writeFile(join(QUEUES_DIR, 'failed.md'), renderQueueFile('Failed Work', 'Items', buckets.failed), 'utf8')
  await writeFile(join(QUEUES_DIR, 'stale.md'), renderQueueFile('Stale Work', 'Items', buckets.stale), 'utf8')
}

export async function rebuildAgencyQueues(): Promise<void> {
  const initialMissions = await listAgencyMissions()
  const { missions } = await reconcileAgencyMissionsForAutoRequeue(initialMissions)
  const buckets = buildAgencyQueueBuckets(missions)
  await writeAgencyQueueFiles(buckets)
}

export async function createAgencyMission(input: {
  goal: string
  startedAt?: string
  completedAt?: string
  dueAt?: string
  reviewAt?: string
  status?: AgencyMissionRecord['status']
}): Promise<AgencyMissionRecord> {
  await ensureAgencyRoot()
  const startedAt = ensureIso(input.startedAt) || new Date().toISOString()
  const record: AgencyMissionRecord = {
    id: `mission-${Date.now()}`,
    title: missionTitleFromGoal(input.goal),
    goal: input.goal.trim(),
    status: toMissionStatus(input.status),
    owner: 'manager',
    reviewer: 'qa',
    priority: 'medium',
    createdAt: startedAt,
    startedAt,
    completedAt: ensureIso(input.completedAt) || '',
    dueAt: ensureIso(input.dueAt) || '',
    reviewAt: ensureIso(input.reviewAt) || '',
    approvalRequired: false,
    approvalStatus: 'none',
    nextAction: 'Triage and decompose into tasks',
    blockers: [],
    artifacts: [],
    linkedTasks: [],
    jobId: '',
    orchestratorSessionKey: '',
    summary: '',
    outputPath: '',
    error: '',
    workerCount: 0,
    workerLabels: [],
    tasks: [],
    streamText: '',
    workerOutputs: {},
    path: join(MISSIONS_DIR, missionDirName(input.goal), 'mission.md'),
  }

  await mkdir(dirname(record.path), { recursive: true })
  await mkdir(join(dirname(record.path), 'tasks'), { recursive: true })
  await mkdir(join(dirname(record.path), 'reviews'), { recursive: true })
  await mkdir(join(dirname(record.path), 'artifacts', 'specs'), { recursive: true })
  await mkdir(join(dirname(record.path), 'artifacts', 'research'), { recursive: true })
  await mkdir(join(dirname(record.path), 'artifacts', 'outputs'), { recursive: true })
  await mkdir(join(dirname(record.path), 'artifacts', 'reviews'), { recursive: true })
  return await persistAgencyMission(record)
}

export async function updateAgencyMission(
  missionId: string,
  patch: Partial<Omit<AgencyMissionRecord, 'id' | 'path'>>,
  actor = 'manager',
): Promise<AgencyMissionRecord> {
  await ensureAgencyRoot()
  assertMissionMutationAuthorized(actor)
  const missions = await listAgencyMissions()
  const current = missions.find((mission) => mission.id === missionId)
  if (!current) {
    throw new Error(`Mission not found: ${missionId}`)
  }

  const normalizedTasks = Array.isArray(patch.tasks)
    ? patch.tasks.map((task) => ({
        ...task,
        owner: normalizeAgencyTaskOwner(task.owner),
        reviewer: normalizeAgencyTaskReviewer(task.reviewer),
      }))
    : null
  const nextTasks = normalizedTasks ? mergeMissionTasks(current.tasks, normalizedTasks) : current.tasks
  const next: AgencyMissionRecord = {
    ...current,
    ...patch,
    status: patch.status ? toMissionStatus(patch.status) : current.status,
    owner: patch.owner === undefined ? current.owner : normalizeAgencyMissionOwner(patch.owner),
    reviewer: patch.reviewer === undefined ? current.reviewer : normalizeAgencyMissionReviewer(patch.reviewer),
    priority: patch.priority || current.priority,
    createdAt: ensureIso(patch.createdAt) || current.createdAt,
    startedAt: ensureIso(patch.startedAt) || current.startedAt,
    completedAt: ensureIso(patch.completedAt) || (patch.completedAt === '' ? '' : current.completedAt),
    dueAt: ensureIso(patch.dueAt) || (patch.dueAt === '' ? '' : current.dueAt),
    reviewAt: ensureIso(patch.reviewAt) || (patch.reviewAt === '' ? '' : current.reviewAt),
    approvalRequired: typeof patch.approvalRequired === 'boolean' ? patch.approvalRequired : current.approvalRequired,
    approvalStatus: patch.approvalStatus ?? current.approvalStatus,
    nextAction: patch.nextAction ?? current.nextAction,
    blockers: Array.isArray(patch.blockers) ? patch.blockers.filter(Boolean) : current.blockers,
    artifacts: Array.isArray(patch.artifacts) ? patch.artifacts.filter(Boolean) : current.artifacts,
    linkedTasks: Array.isArray(patch.linkedTasks) ? patch.linkedTasks.filter(Boolean) : current.linkedTasks,
    title: patch.title?.trim() || current.title,
    goal: patch.goal?.trim() || current.goal,
    summary: patch.summary ?? current.summary,
    outputPath: patch.outputPath ?? current.outputPath,
    error: patch.error ?? current.error,
    workerCount: typeof patch.workerCount === 'number' ? patch.workerCount : current.workerCount,
    workerLabels: Array.isArray(patch.workerLabels) ? patch.workerLabels : current.workerLabels,
    tasks: nextTasks,
    streamText: patch.streamText ?? current.streamText,
    workerOutputs: patch.workerOutputs ?? current.workerOutputs,
    jobId: patch.jobId ?? current.jobId,
    orchestratorSessionKey: patch.orchestratorSessionKey ?? current.orchestratorSessionKey,
    path: current.path,
    id: current.id,
  }
  const derivedMission = normalizedTasks
    ? deriveMissionFromTasks(next, nextTasks, new Date().toISOString())
    : null
  const reconciled: AgencyMissionRecord = derivedMission
    ? {
        ...next,
        ...derivedMission,
        tasks: nextTasks,
      }
    : next

  return await persistAgencyMission(reconciled)
}

export async function applyAgencyTaskAction(
  missionId: string,
  taskId: string,
  input: AgencyTaskActionInput,
): Promise<AgencyMissionRecord> {
  await ensureAgencyRoot()
  const current = await getAgencyMission(missionId)
  if (!current) {
    throw new Error(`Mission not found: ${missionId}`)
  }

  const taskIndex = current.tasks.findIndex((task) => task.id === taskId)
  if (taskIndex === -1) {
    throw new Error(`Task not found: ${taskId}`)
  }
  assertTaskActionAuthorized(current.tasks[taskIndex]!, input)

  const now = new Date().toISOString()
  const nextTasks = current.tasks.map((task, index) => (
    index === taskIndex ? normalizeAgencyTaskActionTask(task, input, now) : task
  ))
  const derivedMission = deriveMissionFromTasks(current, nextTasks, now)
  const next: AgencyMissionRecord = {
    ...current,
    ...derivedMission,
    tasks: nextTasks,
  }

  return await persistAgencyMission(next)
}

export async function getAgencyState(): Promise<{
  root: string
  agents: AgencyAgentRecord[]
  settings: AgencySettings
  missions: Array<AgencyMissionRecord>
  queues: {
    inbox: AgencyStateQueueItem[]
    active: AgencyStateQueueItem[]
    blocked: AgencyStateQueueItem[]
    approvals: AgencyStateQueueItem[]
    failed: AgencyStateQueueItem[]
    stale: AgencyStateQueueItem[]
  }
  reviews: AgencyReviewSummary[]
  dailyReview: AgencyDailyReviewSummary
  scorecards: AgencyAgentScorecard[]
}> {
  await ensureAgencyRoot()
  const [allAgents, settings, initialMissions] = await Promise.all([
    listAgencyAgents(),
    getAgencySettings(),
    listAgencyMissions(),
  ])
  const agents = allAgents.filter((agent) => normalizeAgencyActorRole(agent.id))
  const { missions, changed } = await reconcileAgencyMissionsForAutoRequeue(initialMissions)
  const buckets = buildAgencyQueueBuckets(missions)
  if (changed) {
    await writeAgencyQueueFiles(buckets)
  }
  const queues = buckets.state
  const reviews = (await Promise.all(missions.map((mission) => readMissionReviewSummaries(mission))))
    .flat()
    .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
  const dailyReview = buildAgencyDailyReviewSummary({ missions, queues, reviews })
  const scorecards = buildAgencyAgentScorecards({ agents, missions, reviews })

  return {
    root: WAYMAKER_AGENCY_ROOT,
    agents,
    settings,
    missions,
    queues,
    reviews,
    dailyReview,
    scorecards,
  }
}
