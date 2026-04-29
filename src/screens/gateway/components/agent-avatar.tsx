import { useEffect, type CSSProperties } from 'react'
import type { OrchestratorState } from '@/hooks/use-orchestrator-state'

type AgentAccentColor = {
  bar: string
  border: string
  avatar: string
  text: string
  ring: string
  hex: string
}

export const AGENT_AVATARS = ['🔍', '✍️', '📝', '🧪', '🎨', '📊', '🛡️', '⚡', '🔬', '🎯'] as const
export const AGENT_AVATAR_COUNT = 10

const LEGACY_AGENT_AVATAR_INDEX = new Map<string, number>(
  AGENT_AVATARS.map((avatar, index) => [avatar, index]),
)

const LIVE_AGENT_AVATAR_STYLE_ID = 'wm-live-agent-avatar-styles'

function ensureLiveAgentAvatarStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(LIVE_AGENT_AVATAR_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = LIVE_AGENT_AVATAR_STYLE_ID
  style.textContent = `
    @keyframes wm-avatar-breathe {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-1px) scale(1.02); }
    }
    @keyframes wm-avatar-think {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-2px) scale(1.03); }
    }
    @keyframes wm-avatar-listen {
      0%, 100% { transform: rotate(0deg) scale(1); }
      50% { transform: rotate(-1.5deg) scale(1.015); }
    }
    @keyframes wm-avatar-speak {
      0%, 100% { transform: translateY(0) scale(1); }
      35% { transform: translateY(-1px) scale(1.035); }
      70% { transform: translateY(0) scale(0.992); }
    }
    @keyframes wm-avatar-error {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-1px); }
      75% { transform: translateX(1px); }
    }
    @keyframes wm-avatar-ring-think {
      0% { filter: saturate(1); }
      50% { filter: saturate(1.2); }
      100% { filter: saturate(1); }
    }
    @keyframes wm-avatar-ring-speak {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.035); }
    }
    @keyframes wm-avatar-drift {
      0%, 100% { transform: translate3d(0,0,0) rotate(0deg); }
      25% { transform: translate3d(-1%, 0.5%, 0) rotate(-0.6deg); }
      50% { transform: translate3d(0.8%, -0.8%, 0) rotate(0.4deg); }
      75% { transform: translate3d(-0.4%, 0.6%, 0) rotate(-0.35deg); }
    }
    @keyframes wm-avatar-blink {
      0%, 45%, 100% { transform: scaleY(1); opacity: 0; }
      46%, 49% { transform: scaleY(0.18); opacity: 0.92; }
      50%, 53% { transform: scaleY(1); opacity: 0; }
      78%, 80% { transform: scaleY(0.22); opacity: 0.88; }
      81%, 100% { transform: scaleY(1); opacity: 0; }
    }
    @keyframes wm-avatar-mouth-idle {
      0%, 100% { transform: scaleX(0.9) scaleY(0.75); opacity: 0.42; }
      50% { transform: scaleX(1) scaleY(1); opacity: 0.58; }
    }
    @keyframes wm-avatar-mouth-speak {
      0%, 100% { transform: scaleX(0.75) scaleY(0.45); opacity: 0.5; }
      20% { transform: scaleX(1.05) scaleY(1.3); opacity: 0.9; }
      40% { transform: scaleX(0.92) scaleY(0.62); opacity: 0.65; }
      65% { transform: scaleX(1.18) scaleY(1.55); opacity: 0.95; }
      82% { transform: scaleX(0.86) scaleY(0.52); opacity: 0.6; }
    }
  `
  document.head.appendChild(style)
}

export function normalizeAgentAvatarIndex(value: unknown, fallbackIndex = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    if (normalized >= 0) return normalized % AGENT_AVATAR_COUNT
  }
  if (typeof value === 'string') {
    const legacy = LEGACY_AGENT_AVATAR_INDEX.get(value.trim())
    if (legacy !== undefined) return legacy
  }
  const fallback = Math.trunc(fallbackIndex)
  return ((fallback % AGENT_AVATAR_COUNT) + AGENT_AVATAR_COUNT) % AGENT_AVATAR_COUNT
}

export function getAgentAvatarForSlot(index: number): number {
  return normalizeAgentAvatarIndex(index, 0)
}

export function resolveAgentAvatarIndex(member: unknown, index: number): number {
  const row = member && typeof member === 'object' && !Array.isArray(member)
    ? (member as Record<string, unknown>)
    : null
  return normalizeAgentAvatarIndex(row?.avatar, index)
}

export function resolveCustomAgentAvatarUrl(member: unknown): string | null {
  const row = member && typeof member === 'object' && !Array.isArray(member)
    ? (member as Record<string, unknown>)
    : null
  const avatarUrl = typeof row?.avatar_url === 'string' ? row.avatar_url.trim() : ''
  if (!avatarUrl) return null
  const avatarMode = typeof row?.avatar_mode === 'string' ? row.avatar_mode.trim() : ''
  if (avatarMode && avatarMode !== 'portrait') return null
  return avatarUrl
}

export function darkenHexColor(color: string, amount = 0.2): string {
  const hex = color.trim()
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  const expanded =
    normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return color

  const r = Math.round(parseInt(expanded.slice(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(expanded.slice(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(expanded.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface AgentAvatarProps {
  index: number
  color: string
  size?: number
  className?: string
}

export function AgentAvatar({
  index,
  color,
  size = 40,
  className,
}: AgentAvatarProps) {
  const variant = normalizeAgentAvatarIndex(index, 0)
  const shade = darkenHexColor(color, 0.2)
  const outline = darkenHexColor(color, 0.35)
  const eye = '#f8fafc'

  const baseParts = (() => {
    switch (variant) {
      case 2:
        return {
          head: (
            <>
              <rect x="16" y="9" width="16" height="12" fill={color} />
              <rect x="14" y="11" width="20" height="8" fill={color} />
              <rect x="30" y="9" width="2" height="12" fill={shade} />
              <rect x="14" y="17" width="20" height="2" fill={shade} />
              <rect x="16" y="19" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 9, rightX: 35, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
      case 3:
        return {
          head: (
            <>
              <rect x="15" y="10" width="18" height="11" fill={color} />
              <rect x="31" y="10" width="2" height="11" fill={shade} />
              <rect x="14" y="19" width="20" height="3" fill={shade} />
            </>
          ),
          body: { x: 12, y: 22, w: 24, h: 15 },
          arms: { leftX: 7, rightX: 37, y: 24, w: 5, h: 11 },
          legs: { y: 37, w: 6, h: 5, leftX: 16, rightX: 26 },
        }
      case 4:
        return {
          head: (
            <>
              <rect x="18" y="9" width="12" height="14" fill={color} />
              <rect x="28" y="9" width="2" height="14" fill={shade} />
              <rect x="18" y="21" width="12" height="2" fill={shade} />
            </>
          ),
          body: { x: 17, y: 23, w: 14, h: 15 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 4, h: 10 },
          legs: { y: 38, w: 4, h: 5, leftX: 19, rightX: 25 },
        }
      case 8:
        return {
          head: (
            <>
              <rect x="17" y="12" width="14" height="11" fill={color} />
              <rect x="29" y="12" width="2" height="11" fill={shade} />
              <rect x="17" y="21" width="14" height="2" fill={shade} />
            </>
          ),
          body: { x: 16, y: 23, w: 16, h: 12 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 3, h: 8 },
          legs: { y: 35, w: 4, h: 6, leftX: 18, rightX: 25 },
        }
      default:
        return {
          head: (
            <>
              <rect x="16" y="10" width="16" height="12" fill={color} />
              <rect x="30" y="10" width="2" height="12" fill={shade} />
              <rect x="16" y="20" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 10, rightX: 34, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
    }
  })()

  const bodyParts = (
    <>
      {baseParts.head}
      <rect x={baseParts.body.x} y={baseParts.body.y} width={baseParts.body.w} height={baseParts.body.h} fill={color} />
      <rect x={baseParts.body.x + baseParts.body.w - 2} y={baseParts.body.y} width="2" height={baseParts.body.h} fill={shade} />
      <rect x={baseParts.body.x} y={baseParts.body.y + baseParts.body.h - 2} width={baseParts.body.w} height="2" fill={shade} />
      <rect x={baseParts.arms.leftX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.rightX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.leftX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.arms.rightX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.legs.leftX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.rightX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.leftX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
      <rect x={baseParts.legs.rightX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
    </>
  )

  const details = (() => {
    switch (variant) {
      case 0:
        return (
          <>
            <rect x="23" y="6" width="2" height="4" fill={color} />
            <circle cx="24" cy="5" r="1.5" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 1:
        return (
          <>
            <rect x="17" y="14" width="14" height="5" fill={eye} opacity="0.95" />
            <rect x="17" y="18" width="14" height="1" fill={shade} />
            <rect x="19" y="28" width="10" height="2" fill={shade} />
            <rect x="13" y="15" width="3" height="2" fill={shade} />
            <rect x="32" y="15" width="3" height="2" fill={shade} />
          </>
        )
      case 2:
        return (
          <>
            <circle cx="19" cy="16" r="2.2" fill={eye} />
            <circle cx="29" cy="16" r="2.2" fill={eye} />
            <rect x="20" y="20" width="8" height="2" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
          </>
        )
      case 3:
        return (
          <>
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="16" y="18" width="16" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={outline} />
            <rect x="16" y="31" width="16" height="2" fill={shade} />
          </>
        )
      case 4:
        return (
          <>
            <circle cx="21" cy="16" r="1.7" fill={eye} />
            <circle cx="27" cy="16" r="1.7" fill={eye} />
            <rect x="22" y="20" width="4" height="1" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
            <rect x="21" y="32" width="6" height="1" fill={outline} />
          </>
        )
      case 5:
        return (
          <>
            <rect x="18" y="5" width="2" height="5" fill={color} />
            <rect x="28" y="5" width="2" height="5" fill={color} />
            <circle cx="19" cy="4" r="1.6" fill={eye} />
            <circle cx="29" cy="4" r="1.6" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={shade} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 6:
        return (
          <>
            <circle cx="24" cy="16" r="3.2" fill={eye} />
            <circle cx="24" cy="16" r="1.3" fill={shade} />
            <rect x="18" y="20" width="12" height="2" fill={outline} />
            <rect x="17" y="28" width="2" height="2" fill={shade} />
            <rect x="19" y="30" width="2" height="2" fill={shade} />
            <rect x="21" y="28" width="2" height="2" fill={shade} />
            <rect x="23" y="30" width="2" height="2" fill={shade} />
            <rect x="25" y="28" width="2" height="2" fill={shade} />
            <rect x="27" y="30" width="2" height="2" fill={shade} />
            <rect x="29" y="28" width="2" height="2" fill={shade} />
          </>
        )
      case 7:
        return (
          <>
            <rect x="21" y="7" width="6" height="3" fill={color} />
            <rect x="22" y="5" width="4" height="2" fill={color} />
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="17" y="18" width="14" height="2" fill={outline} />
            <rect x="19" y="28" width="10" height="2" fill={outline} />
          </>
        )
      case 8:
        return (
          <>
            <circle cx="20" cy="17" r="2.3" fill={eye} />
            <circle cx="28" cy="17" r="2.3" fill={eye} />
            <rect x="21" y="21" width="6" height="1" fill={shade} />
            <rect x="20" y="27" width="8" height="2" fill={shade} />
          </>
        )
      case 9:
      default:
        return (
          <>
            <circle cx="19" cy="16" r="2.4" fill={eye} />
            <circle cx="29" cy="16" r="1.4" fill={eye} />
            <rect x="17" y="20" width="4" height="1" fill={shade} />
            <rect x="23" y="20" width="3" height="1" fill={shade} />
            <rect x="28" y="20" width="2" height="1" fill={shade} />
            <rect x="18" y="28" width="2" height="2" fill={outline} />
            <rect x="20" y="30" width="2" height="2" fill={outline} />
            <rect x="22" y="28" width="2" height="2" fill={outline} />
            <rect x="24" y="30" width="2" height="2" fill={outline} />
            <rect x="26" y="28" width="2" height="2" fill={outline} />
            <rect x="28" y="30" width="2" height="2" fill={outline} />
            <rect x="31" y="24" width="2" height="4" fill={shade} />
          </>
        )
    }
  })()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="5" y="5" width="38" height="38" fill={color} opacity="0.08" />
      <rect x="7" y="7" width="34" height="34" fill="white" opacity="0.92" />
      <rect x="7" y="7" width="34" height="34" fill="none" stroke={outline} strokeWidth="1" />
      {bodyParts}
      {details}
    </svg>
  )
}

export type AgentAvatarActivityState =
  | OrchestratorState
  | 'active'
  | 'spawning'
  | 'paused'
  | 'error'
  | 'offline'

function normalizeAgentAvatarActivityState(
  state?: AgentAvatarActivityState,
): OrchestratorState | 'error' {
  switch (state) {
    case 'active':
      return 'responding'
    case 'spawning':
      return 'thinking'
    case 'paused':
      return 'reading'
    case 'error':
      return 'error'
    case 'offline':
      return 'idle'
    default:
      return state ?? 'idle'
  }
}

function getAvatarAnimationStyle(
  state: OrchestratorState | 'error',
): CSSProperties {
  switch (state) {
    case 'thinking':
      return { animation: 'wm-avatar-think 1.9s ease-in-out infinite' }
    case 'responding':
    case 'tool-use':
    case 'orchestrating':
      return { animation: 'wm-avatar-speak 0.72s ease-in-out infinite' }
    case 'reading':
      return { animation: 'wm-avatar-listen 1.4s ease-in-out infinite' }
    case 'error':
      return { animation: 'wm-avatar-error 0.52s ease-in-out 3' }
    case 'idle':
    default:
      return { animation: 'wm-avatar-breathe 3.2s ease-in-out infinite' }
  }
}

function getAvatarRingStyle(
  color: string,
  state: OrchestratorState | 'error',
): CSSProperties {
  const soft = `${color}33`
  const hard = `${color}66`
  switch (state) {
    case 'thinking':
      return { boxShadow: `0 0 0 2px ${soft}, 0 0 22px ${hard}`, animation: 'wm-avatar-ring-think 2s linear infinite' }
    case 'responding':
    case 'tool-use':
    case 'orchestrating':
      return { boxShadow: `0 0 0 2px ${soft}, 0 0 26px ${hard}`, animation: 'wm-avatar-ring-speak 1s ease-in-out infinite' }
    case 'reading':
      return { boxShadow: `0 0 0 2px ${soft}, 0 0 16px ${soft}` }
    case 'error':
      return { boxShadow: '0 0 0 2px rgba(239,68,68,0.28), 0 0 18px rgba(239,68,68,0.42)' }
    case 'idle':
    default:
      return { boxShadow: `0 0 0 1px ${soft}, 0 0 12px ${soft}` }
  }
}

function getAvatarOverlay(state: OrchestratorState | 'error'): string | null {
  switch (state) {
    case 'thinking':
      return 'Thinking'
    case 'responding':
      return 'Speaking'
    case 'tool-use':
      return 'Tools'
    case 'orchestrating':
      return 'Directing'
    case 'reading':
      return 'Listening'
    case 'error':
      return 'Error'
    default:
      return null
  }
}

function getAvatarStatusDotColor(state: OrchestratorState | 'error'): string {
  switch (state) {
    case 'thinking':
      return '#f59e0b'
    case 'responding':
    case 'tool-use':
    case 'orchestrating':
      return '#10b981'
    case 'reading':
      return '#3b82f6'
    case 'error':
      return '#ef4444'
    default:
      return '#94a3b8'
  }
}

export interface AgentAvatarDisplayProps {
  member?: unknown
  fallbackIndex: number
  color: string
  size?: number
  className?: string
  alt?: string
  activityState?: AgentAvatarActivityState
  animate?: boolean
}

export function AgentAvatarDisplay({
  member,
  fallbackIndex,
  color,
  size = 40,
  className,
  alt = 'Agent avatar',
  activityState,
  animate = false,
}: AgentAvatarDisplayProps) {
  useEffect(() => {
    if (animate) ensureLiveAgentAvatarStyles()
  }, [animate])

  const imageUrl = resolveCustomAgentAvatarUrl(member)
  const state = normalizeAgentAvatarActivityState(activityState)
  const outline = darkenHexColor(color, 0.3)
  const radius = Math.max(10, Math.round(size * 0.32))
  const shellStyle = animate ? getAvatarAnimationStyle(state) : undefined
  const ringStyle = animate ? getAvatarRingStyle(color, state) : undefined
  const overlayLabel = animate ? getAvatarOverlay(state) : null
  const dotColor = getAvatarStatusDotColor(state)
  const shouldSpeak =
    state === 'responding' || state === 'tool-use' || state === 'orchestrating'
  const portraitMotionStyle = animate
    ? ({
        animation: `wm-avatar-drift ${state === 'reading' ? '3.8s' : '5.4s'} ease-in-out infinite`,
        transformOrigin: '50% 42%',
      } satisfies CSSProperties)
    : undefined
  const blinkStyle = animate
    ? ({
        animation: `wm-avatar-blink ${state === 'thinking' ? '5.6s' : '7.4s'} ease-in-out infinite`,
      } satisfies CSSProperties)
    : undefined
  const mouthStyle = animate
    ? ({
        animation: shouldSpeak
          ? 'wm-avatar-mouth-speak 0.72s ease-in-out infinite'
          : 'wm-avatar-mouth-idle 3.2s ease-in-out infinite',
        transformOrigin: '50% 50%',
      } satisfies CSSProperties)
    : undefined

  if (imageUrl) {
    return (
      <span
        className={className}
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: size,
          height: size,
          borderRadius: radius,
          ...ringStyle,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: size,
            height: size,
            borderRadius: radius,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.94)',
            boxShadow: `inset 0 0 0 1px ${outline}`,
            ...shellStyle,
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'relative',
              display: 'block',
              width: '100%',
              height: '100%',
              ...portraitMotionStyle,
            }}
          >
            <img
              src={imageUrl}
              alt={alt}
              width={size}
              height={size}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 24%',
                display: 'block',
                filter: state === 'error' ? 'saturate(0.9)' : undefined,
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '27%',
                top: '38%',
                width: '46%',
                height: '8%',
                display: animate ? 'block' : 'none',
                ...blinkStyle,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '34%',
                  height: '100%',
                  borderRadius: 999,
                  background: 'rgba(15,23,42,0.78)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.18)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: '34%',
                  height: '100%',
                  borderRadius: 999,
                  background: 'rgba(15,23,42,0.78)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.18)',
                }}
              />
            </span>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                top: shouldSpeak ? '69.5%' : '71%',
                width: shouldSpeak ? '18%' : '14%',
                height: shouldSpeak ? '9%' : '5%',
                marginLeft: shouldSpeak ? '-9%' : '-7%',
                borderRadius: 999,
                background: shouldSpeak ? 'rgba(127,29,29,0.68)' : 'rgba(71,85,105,0.46)',
                boxShadow: shouldSpeak
                  ? '0 0 18px rgba(248,113,113,0.22)'
                  : '0 0 10px rgba(148,163,184,0.14)',
                ...mouthStyle,
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  state === 'thinking'
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.08), transparent 45%, rgba(245,158,11,0.12))'
                    : shouldSpeak
                      ? 'linear-gradient(180deg, transparent 55%, rgba(16,185,129,0.08) 100%)'
                      : state === 'reading'
                        ? 'linear-gradient(135deg, rgba(59,130,246,0.08), transparent 42%, rgba(59,130,246,0.12))'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.04))',
                pointerEvents: 'none',
              }}
            />
          </span>
        </span>
        {animate ? (
          <>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                right: Math.max(2, Math.round(size * 0.05)),
                top: Math.max(2, Math.round(size * 0.05)),
                width: Math.max(6, Math.round(size * 0.16)),
                height: Math.max(6, Math.round(size * 0.16)),
                borderRadius: 999,
                background: dotColor,
                boxShadow: '0 0 0 2px rgba(255,255,255,0.92)',
              }}
            />
            {overlayLabel ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: -Math.max(10, Math.round(size * 0.22)),
                  transform: 'translateX(-50%)',
                  borderRadius: 999,
                  background: 'rgba(15,23,42,0.78)',
                  color: 'white',
                  fontSize: Math.max(8, Math.round(size * 0.16)),
                  lineHeight: 1,
                  padding: `${Math.max(2, Math.round(size * 0.07))}px ${Math.max(5, Math.round(size * 0.12))}px`,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.01em',
                }}
              >
                {overlayLabel}
              </span>
            ) : null}
          </>
        ) : null}
      </span>
    )
  }

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: radius,
        ...ringStyle,
      }}
    >
      <AgentAvatar
        index={resolveAgentAvatarIndex(member, fallbackIndex)}
        color={color}
        size={size}
        className={className}
      />
    </span>
  )
}

export const AGENT_ACCENT_COLORS: AgentAccentColor[] = [
  { bar: 'bg-orange-500', border: 'border-orange-500', avatar: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-500/20' },
  { bar: 'bg-blue-500', border: 'border-blue-500', avatar: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-500/20' },
  { bar: 'bg-violet-500', border: 'border-violet-500', avatar: 'bg-violet-100', text: 'text-violet-600', ring: 'ring-violet-500/20' },
  { bar: 'bg-emerald-500', border: 'border-emerald-500', avatar: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  { bar: 'bg-rose-500', border: 'border-rose-500', avatar: 'bg-rose-100', text: 'text-rose-600', ring: 'ring-rose-500/20' },
  { bar: 'bg-amber-500', border: 'border-amber-500', avatar: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-500/20' },
  { bar: 'bg-cyan-500', border: 'border-cyan-500', avatar: 'bg-cyan-100', text: 'text-cyan-600', ring: 'ring-cyan-500/20' },
  { bar: 'bg-fuchsia-500', border: 'border-fuchsia-500', avatar: 'bg-fuchsia-100', text: 'text-fuchsia-600', ring: 'ring-fuchsia-500/20' },
  { bar: 'bg-lime-500', border: 'border-lime-500', avatar: 'bg-lime-100', text: 'text-lime-700', ring: 'ring-lime-500/20' },
  { bar: 'bg-sky-500', border: 'border-sky-500', avatar: 'bg-sky-100', text: 'text-sky-600', ring: 'ring-sky-500/20' },
].map((accent, index) => ({
  ...accent,
  hex: ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16', '#0ea5e9'][index] ?? '#f97316',
}))
