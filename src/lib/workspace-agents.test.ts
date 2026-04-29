import { describe, expect, it } from 'vitest'
import { extractWorkspaceAgents } from './workspace-agents'

const baseAgent = {
  id: 'hermes',
  name: 'Hermes',
  role: 'COO',
  adapter_type: 'local',
}

describe('extractWorkspaceAgents avatar normalization', () => {
  it('preserves legacy built-in avatar behavior when no portrait URL is present', () => {
    const [agent] = extractWorkspaceAgents([{ ...baseAgent, avatar: '3' }])

    expect(agent).toMatchObject({
      avatar: '3',
      avatar_url: null,
      avatar_mode: 'builtin',
    })
  })

  it('normalizes non-empty portrait URLs and infers portrait mode', () => {
    const [agent] = extractWorkspaceAgents([
      {
        ...baseAgent,
        avatar: '2',
        avatar_url: '  /avatars/hermes-coo-approved.jpg  ',
      },
    ])

    expect(agent).toMatchObject({
      avatar: '2',
      avatar_url: '/avatars/hermes-coo-approved.jpg',
      avatar_mode: 'portrait',
    })
  })

  it('allows an explicit built-in mode to override a stored portrait URL', () => {
    const [agent] = extractWorkspaceAgents([
      {
        ...baseAgent,
        avatar_url: '/avatars/hermes-coo-approved.jpg',
        avatar_mode: 'builtin',
      },
    ])

    expect(agent).toMatchObject({
      avatar_url: '/avatars/hermes-coo-approved.jpg',
      avatar_mode: 'builtin',
    })
  })
})
