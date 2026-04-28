export type AgencyHeartbeatJob = {
  key: string
  name: string
  schedule: string
  prompt: string
  deliver: string
  installed: boolean
  existingJobId: string
  needsUpdate: boolean
  driftReasons: string[]
}

export type AgencyHeartbeatsState = {
  ok?: boolean
  deliver: string
  jobs: AgencyHeartbeatJob[]
  created?: number
  updated?: number
  gateLocked?: boolean
  gateReason?: string
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T
}

export async function fetchAgencyHeartbeats(): Promise<AgencyHeartbeatsState> {
  const response = await fetch('/api/agency-heartbeats')
  const payload = await readJson<AgencyHeartbeatsState & { error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to load agency heartbeats (${response.status})`)
  }
  return payload
}

export async function installAgencyHeartbeats(): Promise<AgencyHeartbeatsState> {
  const response = await fetch('/api/agency-heartbeats', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  const payload = await readJson<AgencyHeartbeatsState & { error?: string }>(response)
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Failed to install agency heartbeats (${response.status})`)
  }
  return payload
}
