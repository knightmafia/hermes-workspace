import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CronJob } from '@/components/cron-manager/cron-types'
import { toast } from '@/components/ui/toast'
import { fetchCronJobs } from '@/lib/cron-api'
import { fetchSessions, type GatewaySession } from '@/lib/gateway-api'
import {
  deleteAgencyAgentRecord,
  fetchAgencyState,
  saveAgencyAgent,
  saveAgencySettings as saveAgencySettingsRequest,
  type AgencyAgentScorecard,
} from '@/lib/waymaker-agency-api'
import { formatModelName, formatRelativeTime } from '@/screens/dashboard/lib/formatters'

// Hermes-Workspace adapter: Operations is backed by Hermes profiles
// (each profile = one persistent agent). Profiles live at ~/.hermes/profiles/<name>/
// with their own config.yaml, sessions, skills.
type HermesProfileSummary = {
  name: string
  path: string
  active: boolean
  exists: boolean
  model?: string
  provider?: string
  skillCount: number
  sessionCount: number
  hasEnv: boolean
  updatedAt?: string
}

export type GatewayConfigAgent = {
  id: string
  name: string
  model: string
  workspace?: string
  agentDir?: string
}

export type OperationsAgentMeta = {
  emoji: string
  description: string
  systemPrompt: string
  color: string
  createdAt: string
}

export type OperationsSettings = {
  defaultModel: string
  autoApprove: boolean
  activityFeedLength: number
  orchestratorName: string
}

export type OperationsAgentStatus = 'active' | 'idle' | 'error'

export type OperationsOutputItem = {
  id: string
  agentId: string
  summary: string
  timestamp: number
  source: 'session' | 'cron'
}

export type OperationsAgent = GatewayConfigAgent & {
  meta: OperationsAgentMeta
  allowedWriteScope?: string
  forbiddenActions?: string
  escalationConditions?: string
  outputContract?: string
  defaultModelLane?: string
  shortModel: string
  status: OperationsAgentStatus
  sessionKey: string
  sessions: GatewaySession[]
  latestSession: GatewaySession | null
  jobs: CronJob[]
  nextRunAt: number | null
  lastActivityAt: number | null
  activityLabel: string
  progressValue: number
  progressStatus: 'running' | 'queued' | 'failed' | 'complete' | 'thinking'
  recentOutputs: OperationsOutputItem[]
  scorecard?: AgencyAgentScorecard | null
}

type ConfigPayload = {
  ok?: boolean
  error?: string
  payload?: {
    parsed?: {
      agents?: {
        list?: unknown[]
      }
      defaultModel?: string
      [key: string]: unknown
    }
    defaultModel?: string
    [key: string]: unknown
  }
  parsed?: {
    agents?: {
      list?: unknown[]
    }
    defaultModel?: string
    [key: string]: unknown
  }
  defaultModel?: string
  [key: string]: unknown
}

const COLOR_PALETTE = [
  { body: '#3b82f6', accent: '#93c5fd' },
  { body: '#10b981', accent: '#6ee7b7' },
  { body: '#f97316', accent: '#fdba74' },
  { body: '#8b5cf6', accent: '#c4b5fd' },
  { body: '#ec4899', accent: '#f9a8d4' },
  { body: '#06b6d4', accent: '#67e8f9' },
  { body: '#eab308', accent: '#fde047' },
  { body: '#ef4444', accent: '#fca5a5' },
]

const AGENCY_ROLE_IDS = ['manager', 'research', 'builder', 'qa', 'ops', 'outreach'] as const

function isAgencyRole(value: string): boolean {
  return AGENCY_ROLE_IDS.includes(value as (typeof AGENCY_ROLE_IDS)[number])
}

function hashString(value: string): number {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash
}

function createFallbackColor(agentId: string): string {
  return COLOR_PALETTE[hashString(agentId) % COLOR_PALETTE.length]?.body ?? '#3b82f6'
}

function createFallbackEmoji(agentId: string): string {
  const emojis = ['🤖', '🐦', '🔨', '✍️', '📊', '🛰️', '🧠', '🛠️']
  return emojis[hashString(agentId) % emojis.length] ?? '🤖'
}

function normalizeAgentId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extractSessionText(session: GatewaySession): string {
  const lastMessage = session.lastMessage
  if (lastMessage) {
    if (typeof lastMessage.text === 'string' && lastMessage.text.trim()) {
      return lastMessage.text.trim()
    }
    if (Array.isArray(lastMessage.content)) {
      const text = lastMessage.content
        .filter((part) => !part.type || part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n')
        .trim()
      if (text) return text
    }
  }

  return (
    readString(session.derivedTitle) ||
    readString(session.title) ||
    readString(session.task) ||
    readString(session.initialMessage)
  )
}

function truncate(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeAgentList(input: unknown): GatewayConfigAgent[] {
  if (!Array.isArray(input)) return []

  const agents: GatewayConfigAgent[] = []

  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    const row = entry as Record<string, unknown>
    const id = normalizeAgentId(readString(row.id) || readString(row.name))
    if (!id) continue

    agents.push({
      id,
      name: readString(row.name) || id,
      model: readString(row.model),
      workspace: readString(row.workspace) || undefined,
      agentDir: readString(row.agentDir) || undefined,
    })
  }

  return agents
}

function parseConfigPayload(payload: ConfigPayload): ConfigPayload {
  if (payload.payload && typeof payload.payload === 'object') {
    return payload.payload as ConfigPayload
  }
  return payload
}

async function fetchHermesProfiles(): Promise<HermesProfileSummary[]> {
  const response = await fetch('/api/profiles/list')
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('json')) {
    throw new Error('/api/profiles/list returned non-JSON')
  }
  const payload = (await response.json().catch(() => ({}))) as {
    profiles?: HermesProfileSummary[]
    error?: string
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return Array.isArray(payload.profiles) ? payload.profiles : []
}

// Adapt Hermes profiles into the ConfigPayload shape that the existing
// Operations UI expects. Each profile becomes one agent.
async function fetchOperationsConfig(): Promise<ConfigPayload> {
  const profiles = await fetchHermesProfiles()
  const list = profiles.map((profile) => ({
    id: profile.name,
    name: profile.name === 'default' ? 'Workspace' : profile.name,
    model: profile.model || '',
    workspace: profile.path,
    agentDir: profile.path,
  }))
  // Default-profile model becomes the operations defaultModel suggestion
  const defaultModel = profiles.find((p) => p.name === 'default')?.model || ''
  return {
    ok: true,
    parsed: {
      agents: { list },
      defaultModel,
    },
  }
}

async function createHermesProfile(input: {
  name: string
  model?: string
  provider?: string
  cloneFrom?: string
}) {
  const response = await fetch('/api/profiles/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to create profile (${response.status})`)
  }
}

async function updateHermesProfile(name: string, patch: Record<string, unknown>) {
  const response = await fetch('/api/profiles/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, patch }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to update profile (${response.status})`)
  }
}

async function deleteHermesProfile(name: string) {
  const response = await fetch('/api/profiles/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to delete profile (${response.status})`)
  }
}

function getAgentJobs(agentId: string, jobs: CronJob[]): CronJob[] {
  return jobs.filter((job) => job.name?.startsWith(`ops:${agentId}:`))
}

function getAgentSessions(agentId: string, sessions: GatewaySession[]): GatewaySession[] {
  return [...sessions]
    .filter((session) => {
      const label = readString(session.label)
      const key = readString(session.key)
      return label.includes(agentId) || key.includes(agentId)
    })
    .sort((left, right) => {
      const leftTs = readTimestamp(left.updatedAt) ?? 0
      const rightTs = readTimestamp(right.updatedAt) ?? 0
      return rightTs - leftTs
    })
}

function getAgentStatus(latestSession: GatewaySession | null): OperationsAgentStatus {
  if (!latestSession) return 'idle'

  const status = readString(latestSession.status).toLowerCase()
  if (status.includes('fail') || status.includes('error')) return 'error'

  const updatedAt = readTimestamp(latestSession.updatedAt)
  if (updatedAt && Date.now() - updatedAt < 120_000) return 'active'

  return 'idle'
}

function getProgressStatus(
  status: OperationsAgentStatus,
  latestSession: GatewaySession | null,
): OperationsAgent['progressStatus'] {
  if (status === 'error') return 'failed'
  if (status === 'active') return 'running'

  const sessionStatus = readString(latestSession?.status).toLowerCase()
  if (sessionStatus.includes('complete') || sessionStatus.includes('done')) {
    return 'complete'
  }
  return latestSession ? 'thinking' : 'queued'
}

function getProgressValue(
  status: OperationsAgentStatus,
  latestSession: GatewaySession | null,
): number {
  const rawProgress = latestSession?.progress
  if (typeof rawProgress === 'number' && Number.isFinite(rawProgress)) {
    return Math.max(5, Math.min(100, rawProgress))
  }
  if (status === 'active') return 72
  if (status === 'error') return 100
  if (latestSession) return 100
  return 18
}

function formatUpcomingTime(timestamp: number): string {
  const diff = timestamp - Date.now()
  if (diff <= 0) return 'soon'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function slugifyJobLabel(value: string): string {
  return normalizeAgentId(value) || 'scheduled-run'
}

function buildCronOutput(job: CronJob, agentId: string): OperationsOutputItem | null {
  const startedAt = readTimestamp(job.lastRun?.startedAt)
  const summary = truncate(
    readString(job.lastRun?.deliverySummary) ||
      readString(job.description) ||
      readString(job.name).replace(`ops:${agentId}:`, '').replace(/-/g, ' '),
  )

  if (!startedAt || !summary) return null

  return {
    id: `cron-${job.id}`,
    agentId,
    summary,
    timestamp: startedAt,
    source: 'cron',
  }
}

function buildSessionOutput(
  session: GatewaySession,
  agentId: string,
): OperationsOutputItem | null {
  const timestamp = readTimestamp(session.updatedAt) ?? readTimestamp(session.createdAt)
  const summary = truncate(extractSessionText(session))
  if (!timestamp || !summary) return null

  return {
    id: `session-${readString(session.key) || timestamp}`,
    agentId,
    summary,
    timestamp,
    source: 'session',
  }
}

export function getOperationsSessionKey(agentId: string): string {
  return `agent:main:ops-${agentId}`
}

export function useOperations() {
  const queryClient = useQueryClient()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [settings, setSettings] = useState<OperationsSettings>({
    defaultModel: '',
    autoApprove: false,
    activityFeedLength: 5,
    orchestratorName: 'Main Agent',
  })

  const configQuery = useQuery({
    queryKey: ['operations', 'config'],
    queryFn: fetchOperationsConfig,
    refetchInterval: 30_000,
  })

  const sessionsQuery = useQuery({
    queryKey: ['operations', 'sessions'],
    queryFn: async () => {
      const response = await fetchSessions()
      return Array.isArray(response.sessions) ? response.sessions : []
    },
    refetchInterval: 15_000,
  })

  const cronJobsQuery = useQuery({
    queryKey: ['operations', 'cron'],
    queryFn: fetchCronJobs,
    refetchInterval: 30_000,
  })

  const agencyQuery = useQuery({
    queryKey: ['operations', 'agency'],
    queryFn: fetchAgencyState,
    refetchInterval: 30_000,
  })

  const agencyAgents = (agencyQuery.data?.agents ?? []).filter((agent) => isAgencyRole(normalizeAgentId(agent.id)))
  const agencyAgentsById = useMemo(
    () => new Map(agencyAgents.map((agent) => [normalizeAgentId(agent.id), agent])),
    [agencyAgents],
  )
  const agencyScorecardsById = useMemo(
    () => new Map((agencyQuery.data?.scorecards ?? []).map((scorecard) => [normalizeAgentId(scorecard.agentId), scorecard])),
    [agencyQuery.data?.scorecards],
  )

  const effectiveSettings = agencyQuery.data?.settings ?? settings
  useEffect(() => {
    if (!agencyQuery.data?.settings) return
    const next = agencyQuery.data.settings
    setSettings((current) => {
      if (
        current.defaultModel === next.defaultModel &&
        current.autoApprove === next.autoApprove &&
        current.activityFeedLength === next.activityFeedLength &&
        current.orchestratorName === next.orchestratorName
      ) {
        return current
      }
      return next
    })
  }, [agencyQuery.data?.settings])

  const agents = useMemo(() => {
    const parsed = configQuery.data?.parsed
    const profileAgents = normalizeAgentList(parsed?.agents?.list)
    // Filter out system/internal agents — only show operations agents
    const HIDDEN_AGENTS = new Set(['main', 'pc1-coder', 'pc1-planner', 'pc1-critic'])
    const configAgents = profileAgents.filter((a) => !HIDDEN_AGENTS.has(a.id) && isAgencyRole(a.id))
    const runtimeBackedIds = new Set(configAgents.map((agent) => agent.id))
    const mergedAgents = [...configAgents]

    for (const agencyAgent of agencyAgents) {
      const id = normalizeAgentId(agencyAgent.id)
      if (!id || runtimeBackedIds.has(id) || HIDDEN_AGENTS.has(id) || !isAgencyRole(id)) continue
      mergedAgents.push({
        id,
        name: agencyAgent.name,
        model: agencyAgent.model,
        workspace: agencyAgent.path,
        agentDir: agencyAgent.path,
      })
    }

    const sessions = sessionsQuery.data ?? []
    const cronJobs = cronJobsQuery.data ?? []

    return mergedAgents.map((agent) => {
      const agencyMeta = agencyAgentsById.get(agent.id)
      const runtimeReady = runtimeBackedIds.has(agent.id)
      const scorecard = agencyScorecardsById.get(agent.id) ?? null
      const meta = {
        emoji: readString(agencyMeta?.emoji) || createFallbackEmoji(agent.id),
        description: readString(agencyMeta?.description),
        systemPrompt: readString(agencyMeta?.systemPrompt),
        color: createFallbackColor(agent.id),
        createdAt: '',
      } satisfies OperationsAgentMeta
      const agentSessions = getAgentSessions(agent.id, sessions)
      const latestSession = agentSessions[0] ?? null
      const jobs = getAgentJobs(agent.id, cronJobs)
      const nextRunAt = jobs
        .filter((job) => job.enabled)
        .map((job) => readTimestamp(job.nextRunAt))
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)[0] ?? null
      const lastActivityAt =
        readTimestamp(latestSession?.updatedAt) ??
        jobs
          .map((job) => readTimestamp(job.lastRun?.startedAt))
          .filter((value): value is number => value !== null)
          .sort((left, right) => right - left)[0] ??
        null
      const status = getAgentStatus(latestSession)
      const recentOutputs = [
        ...agentSessions.map((session) => buildSessionOutput(session, agent.id)),
        ...jobs.map((job) => buildCronOutput(job, agent.id)),
      ]
        .filter((item): item is OperationsOutputItem => Boolean(item))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 5)

      return {
        ...agent,
        name: readString(agencyMeta?.name) || agent.name,
        model: readString(agencyMeta?.model) || agent.model,
        workspace: readString(agencyMeta?.path) || agent.workspace,
        agentDir: readString(agencyMeta?.path) || agent.agentDir,
        meta,
        allowedWriteScope: readString(agencyMeta?.allowedWriteScope),
        forbiddenActions: readString(agencyMeta?.forbiddenActions),
        escalationConditions: readString(agencyMeta?.escalationConditions),
        outputContract: readString(agencyMeta?.outputContract),
        defaultModelLane: readString(agencyMeta?.defaultModelLane),
        shortModel: formatModelName(readString(agencyMeta?.model) || agent.model || 'Custom'),
        status,
        sessionKey: runtimeReady ? getOperationsSessionKey(agent.id) : '',
        sessions: agentSessions,
        latestSession,
        jobs,
        nextRunAt,
        lastActivityAt,
        activityLabel: nextRunAt
          ? `Next ${formatUpcomingTime(nextRunAt)}`
          : lastActivityAt
            ? `Last ${formatRelativeTime(lastActivityAt)}`
            : runtimeReady
              ? 'No activity yet'
              : 'Agency record only',
        progressValue: getProgressValue(status, latestSession),
        progressStatus: getProgressStatus(status, latestSession),
        recentOutputs,
        scorecard,
      } satisfies OperationsAgent
    }).sort((left, right) => AGENCY_ROLE_IDS.indexOf(left.id as (typeof AGENCY_ROLE_IDS)[number]) - AGENCY_ROLE_IDS.indexOf(right.id as (typeof AGENCY_ROLE_IDS)[number]))
  }, [
    configQuery.data,
    agencyAgents,
    agencyAgentsById,
    agencyScorecardsById,
    sessionsQuery.data,
    cronJobsQuery.data,
  ])

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null

  const recentActivity = useMemo(() => {
    return agents
      .flatMap((agent) => agent.recentOutputs)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, settings.activityFeedLength)
  }, [agents, settings.activityFeedLength])

  const createAgentMutation = useMutation({
    mutationFn: async (input: {
      name: string
      model: string
      emoji: string
      systemPrompt: string
      description?: string
    }) => {
      const id = normalizeAgentId(input.name)
      if (!id) throw new Error('Agent name is required')
      if (id === 'default') {
        throw new Error('"default" is reserved — pick another name')
      }
      if (!isAgencyRole(id)) {
        throw new Error('Gate 5 allows only manager, research, builder, qa, ops, and outreach')
      }
      const currentAgents = normalizeAgentList(configQuery.data?.parsed?.agents?.list)
      if (currentAgents.some((agent) => agent.id === id)) {
        throw new Error('A profile with this name already exists')
      }

      await createHermesProfile({
        name: id,
        model: input.model.trim() || undefined,
      })
      // Persist system prompt + description into the profile config so they
      // survive across browsers; localStorage meta keeps emoji/color preferences.
      if (input.systemPrompt.trim() || input.description?.trim()) {
        await updateHermesProfile(id, {
          system_prompt: input.systemPrompt.trim() || undefined,
          description: input.description?.trim() || undefined,
        })
      }
      await saveAgencyAgent({
        id,
        name: input.name.trim() || id,
        profile: id,
        emoji: input.emoji.trim() || createFallbackEmoji(id),
        model: input.model.trim(),
        description: input.description?.trim() ?? '',
        systemPrompt: input.systemPrompt.trim(),
      })
      setSelectedAgentId(id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'config'] })
      await queryClient.invalidateQueries({ queryKey: ['operations', 'agency'] })
      toast('Agent created', { type: 'success' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to create agent', {
        type: 'error',
      })
    },
  })

  const saveAgentMutation = useMutation({
    mutationFn: async (input: {
      agentId: string
      name: string
      model: string
      emoji: string
      systemPrompt: string
      allowedWriteScope?: string
      forbiddenActions?: string
      escalationConditions?: string
      outputContract?: string
      defaultModelLane?: string
    }) => {
      // Persist model + system prompt to the profile's config.yaml so they
      // survive across machines / clients.
      const currentAgents = normalizeAgentList(configQuery.data?.parsed?.agents?.list)
      const profileExists = currentAgents.some((agent) => agent.id === input.agentId)
      const patch: Record<string, unknown> = {}
      if (input.model.trim()) patch.model = input.model.trim()
      if (input.systemPrompt.trim()) patch.system_prompt = input.systemPrompt.trim()
      if (!profileExists) {
        await createHermesProfile({
          name: input.agentId,
          model: input.model.trim() || undefined,
        })
      }
      if (Object.keys(patch).length > 0) {
        await updateHermesProfile(input.agentId, patch)
      }
      const currentAgency = agencyAgentsById.get(input.agentId)
      await saveAgencyAgent({
        id: input.agentId,
        name: input.name.trim() || currentAgency?.name || input.agentId,
        profile: currentAgency?.profile || input.agentId,
        emoji: input.emoji.trim() || currentAgency?.emoji || createFallbackEmoji(input.agentId),
        model: input.model.trim(),
        description: currentAgency?.description || '',
        systemPrompt: input.systemPrompt.trim(),
        allowedWriteScope: input.allowedWriteScope?.trim() || '',
        forbiddenActions: input.forbiddenActions?.trim() || '',
        escalationConditions: input.escalationConditions?.trim() || '',
        outputContract: input.outputContract?.trim() || '',
        defaultModelLane: input.defaultModelLane?.trim() || '',
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'config'] })
      await queryClient.invalidateQueries({ queryKey: ['operations', 'agency'] })
      toast('Agent settings saved', { type: 'success' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to save agent', {
        type: 'error',
      })
    },
  })

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (agentId === 'default') {
        throw new Error('Cannot delete the default profile')
      }
      const currentAgents = normalizeAgentList(configQuery.data?.parsed?.agents?.list)
      if (currentAgents.some((agent) => agent.id === agentId)) {
        await deleteHermesProfile(agentId)
      }
      await deleteAgencyAgentRecord(agentId)
      setSelectedAgentId((current) => (current === agentId ? null : current))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'config'] })
      await queryClient.invalidateQueries({ queryKey: ['operations', 'sessions'] })
      await queryClient.invalidateQueries({ queryKey: ['operations', 'agency'] })
      toast('Agent deleted', { type: 'success' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to delete agent', {
        type: 'error',
      })
    },
  })

  function saveAgentMeta(agentId: string, partial: Partial<OperationsAgentMeta>) {
    const currentAgency = agencyAgentsById.get(agentId)
    if (!currentAgency) return
    void saveAgencyAgent({
      id: agentId,
      name: currentAgency.name,
      profile: currentAgency.profile,
      emoji: readString(partial.emoji) || currentAgency.emoji || createFallbackEmoji(agentId),
      model: currentAgency.model,
      description: readString(partial.description) || currentAgency.description,
      systemPrompt: readString(partial.systemPrompt) || currentAgency.systemPrompt,
      allowedWriteScope: currentAgency.allowedWriteScope,
      forbiddenActions: currentAgency.forbiddenActions,
      escalationConditions: currentAgency.escalationConditions,
      outputContract: currentAgency.outputContract,
      defaultModelLane: currentAgency.defaultModelLane,
    }).then(() => queryClient.invalidateQueries({ queryKey: ['operations', 'agency'] }))
  }

  function saveSettings(nextSettings: OperationsSettings) {
    setSettings(nextSettings)
    void saveAgencySettingsRequest(nextSettings).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['operations', 'agency'] })
    })
    toast('Operations settings saved', { type: 'success' })
  }

  return {
    agents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgent: setSelectedAgentId,
    configQuery,
    agencyQuery,
    sessionsQuery,
    cronJobsQuery,
    recentActivity,
    settings,
    saveSettings,
    defaultModel:
      readString(configQuery.data?.parsed?.defaultModel) || effectiveSettings.defaultModel,
    createAgent: createAgentMutation.mutateAsync,
    isCreatingAgent: createAgentMutation.isPending,
    saveAgent: saveAgentMutation.mutateAsync,
    isSavingAgent: saveAgentMutation.isPending,
    deleteAgent: deleteAgentMutation.mutateAsync,
    isDeletingAgent: deleteAgentMutation.isPending,
    saveAgentMeta,
    refreshAll: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operations', 'config'] }),
        queryClient.invalidateQueries({ queryKey: ['operations', 'sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['operations', 'cron'] }),
      ])
    },
    slugifyJobLabel,
  }
}
