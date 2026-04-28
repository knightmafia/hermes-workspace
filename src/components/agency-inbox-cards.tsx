'use client'

import type { CSSProperties } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { EyeIcon, Link01Icon } from '@hugeicons/core-free-icons'
import type {
  AgencyActorRole,
  AgencyQueueItem,
  AgencyReviewSummary,
  AgencyState,
  AgencyTaskAction,
} from '@/lib/waymaker-agency-api'
import { cn } from '@/lib/utils'

type AgencyActionId = AgencyTaskAction

type AgencyActionRequest = {
  action: AgencyActionId
  actor?: AgencyActorRole
  missionId: string
  taskId?: string | null
  reviewId?: string
  path: string
  scope: 'queue' | 'review'
  queueKey?: string
  status?: string
}

type AgencyActionSpec = {
  id: AgencyActionId
  label: string
  tone: 'primary' | 'secondary' | 'danger'
}

const AGENCY_ACTION_STYLES: Record<
  AgencyActionSpec['tone'],
  { className: string; style?: CSSProperties }
> = {
  primary: {
    className:
      'border-transparent text-white hover:opacity-90 disabled:hover:opacity-100',
    style: { background: 'var(--theme-accent)' },
  },
  secondary: {
    className:
      'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-hover)]',
  },
  danger: {
    className:
      'text-[var(--theme-danger)] hover:opacity-90 disabled:hover:opacity-100',
    style: {
      borderColor: 'color-mix(in srgb, var(--theme-danger) 24%, transparent)',
      background:
        'color-mix(in srgb, var(--theme-danger) 10%, var(--theme-card))',
    },
  },
}

function formatRunTimestamp(value?: string | null): string {
  if (!value) return 'Never run'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function missionStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'blocked':
      return 'Blocked'
    case 'needs-approval':
      return 'Needs Approval'
    default:
      return 'Proposed'
  }
}

function missionStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'var(--theme-success)'
    case 'paused':
      return 'var(--theme-warning)'
    case 'completed':
      return 'var(--theme-accent)'
    case 'failed':
    case 'blocked':
      return 'var(--theme-danger)'
    case 'needs-approval':
      return 'var(--theme-warning)'
    default:
      return 'var(--theme-muted)'
  }
}

function reviewStatusLabel(status: string): string {
  switch (status) {
    case 'pass':
      return 'Pass'
    case 'pass-with-notes':
      return 'Pass w/ Notes'
    case 'fail':
      return 'Fail'
    case 'needs-followup':
      return 'Follow Up'
    default:
      return status
  }
}

function reviewStatusColor(status: string): string {
  switch (status) {
    case 'pass':
      return 'var(--theme-success)'
    case 'pass-with-notes':
      return 'var(--theme-warning)'
    case 'fail':
      return 'var(--theme-danger)'
    case 'needs-followup':
      return 'var(--theme-warning)'
    default:
      return 'var(--theme-muted)'
  }
}

function queueStatusColor(status: string): string {
  switch (status) {
    case 'running':
    case 'ready':
    case 'review':
      return 'var(--theme-success)'
    case 'needs-approval':
    case 'paused':
      return 'var(--theme-warning)'
    case 'blocked':
    case 'failed':
      return 'var(--theme-danger)'
    case 'complete':
    case 'completed':
      return 'var(--theme-accent)'
    default:
      return 'var(--theme-muted)'
  }
}

function compactAgencyPath(path: string): string {
  return path.replace('/Users/knightmafia/hermes-workspace/', '')
}

function buildAgencyOpenHref(path: string): string {
  return `/api/agency-file?path=${encodeURIComponent(path)}`
}

function AgencyPathActions({
  path,
  onPreview,
}: {
  path: string
  onPreview: (path: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onPreview(path)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-hover)]"
      >
        <HugeiconsIcon icon={EyeIcon} size={11} />
        Preview
      </button>
      <a
        href={buildAgencyOpenHref(path)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-hover)]"
      >
        <HugeiconsIcon icon={Link01Icon} size={11} />
        Open
      </a>
    </div>
  )
}

function getQueueItemActions(
  queueKey: string,
  item: AgencyQueueItem,
): Array<AgencyActionSpec> {
  if (!item.taskId) return []

  if (queueKey === 'approvals' || item.status === 'needs-approval') {
    return [
      { id: 'approve', label: 'Approve', tone: 'primary' },
      { id: 'reject', label: 'Send Back', tone: 'danger' },
    ]
  }
  if (item.status === 'review') {
    return [
      { id: 'mark-passed', label: 'Pass Review', tone: 'primary' },
      { id: 'mark-failed', label: 'Fail Review', tone: 'danger' },
    ]
  }
  if (queueKey === 'failed' || item.status === 'failed') {
    return [
      { id: 'start-review', label: 'Reopen Review', tone: 'secondary' },
      { id: 'reject', label: 'Block', tone: 'danger' },
    ]
  }
  if (queueKey === 'blocked' || item.status === 'blocked') {
    return [{ id: 'start-review', label: 'Review', tone: 'secondary' }]
  }
  if (queueKey === 'stale') {
    return [{ id: 'start-review', label: 'Review', tone: 'secondary' }]
  }
  return [{ id: 'start-review', label: 'Review', tone: 'secondary' }]
}

function getReviewActions(
  review: AgencyReviewSummary,
): Array<AgencyActionSpec> {
  switch (review.status) {
    case 'pass':
      return [{ id: 'approve', label: 'Accept', tone: 'primary' }]
    case 'pass-with-notes':
      return [
        { id: 'approve', label: 'Accept', tone: 'primary' },
        { id: 'start-review', label: 'Follow Up', tone: 'secondary' },
      ]
    case 'fail':
      return [
        { id: 'reject', label: 'Request Changes', tone: 'danger' },
        { id: 'start-review', label: 'Reopen Review', tone: 'secondary' },
      ]
    case 'needs-followup':
      return [
        { id: 'start-review', label: 'Follow Up', tone: 'secondary' },
        { id: 'reject', label: 'Send Back', tone: 'danger' },
      ]
    default:
      return [
        { id: 'approve', label: 'Accept', tone: 'primary' },
        { id: 'reject', label: 'Send Back', tone: 'danger' },
      ]
  }
}

function AgencyActionButtons({
  actions,
  buildRequest,
  onAction,
  pendingActionKey,
}: {
  actions: Array<AgencyActionSpec>
  buildRequest: (action: AgencyActionId) => AgencyActionRequest
  onAction: (input: AgencyActionRequest) => void
  pendingActionKey: string | null
}) {
  if (actions.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {actions.map((action) => {
        const request = buildRequest(action.id)
        const isPending = pendingActionKey === agencyActionKey(request)
        const tone = AGENCY_ACTION_STYLES[action.tone]

        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(request)}
            disabled={isPending}
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:cursor-wait disabled:opacity-60',
              tone.className,
            )}
            style={tone.style}
          >
            {isPending ? 'Working…' : action.label}
          </button>
        )
      })}
    </div>
  )
}

function agencyActionKey(input: AgencyActionRequest): string {
  return [
    input.scope,
    input.queueKey ?? input.reviewId ?? input.missionId,
    input.taskId ?? input.path,
    input.action,
  ].join(':')
}

export function AgencyMissionCard({
  mission,
  onPreview,
}: {
  mission: AgencyState['missions'][number]
  onPreview: (path: string) => void
}) {
  const statusColor = missionStatusColor(mission.status)
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: statusColor }}
            />
            <h3 className="truncate text-sm font-medium text-[var(--theme-text)]">
              {mission.title}
            </h3>
          </div>
          <p className="mt-2 text-[11px] text-[var(--theme-muted)]">
            Started {formatRunTimestamp(mission.startedAt)}
          </p>
          {mission.completedAt ? (
            <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
              Completed {formatRunTimestamp(mission.completedAt)}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[10px] text-[var(--theme-muted)]">
              {compactAgencyPath(mission.path)}
            </p>
            <AgencyPathActions path={mission.path} onPreview={onPreview} />
          </div>
        </div>
        <span
          className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            color: statusColor,
            background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
          }}
        >
          {missionStatusLabel(mission.status)}
        </span>
      </div>
    </div>
  )
}

export function AgencyQueueCard({
  queueKey,
  title,
  subtitle,
  items,
  onAction,
  onPreview,
  pendingActionKey,
}: {
  queueKey: string
  title: string
  subtitle: string
  items: Array<AgencyQueueItem>
  onAction: (input: AgencyActionRequest) => void
  onPreview: (path: string) => void
  pendingActionKey: string | null
}) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--theme-text)]">
            {title}
          </h3>
          <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
            {subtitle}
          </p>
        </div>
        <span className="text-xs text-[var(--theme-muted)]">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-3 text-xs text-[var(--theme-muted)]">
            Nothing queued.
          </div>
        ) : (
          items.slice(0, 4).map((item) => {
            const color = queueStatusColor(item.status)
            const actions = getQueueItemActions(queueKey, item)
            return (
              <div
                key={`${item.path}:${item.taskId ?? item.missionId}`}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-[var(--theme-text)]">
                      {item.taskTitle
                        ? `${item.missionTitle} / ${item.taskTitle}`
                        : item.missionTitle}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
                      {item.detail}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-mono text-[10px] text-[var(--theme-muted)]">
                        {compactAgencyPath(item.path)}
                      </p>
                      <AgencyPathActions path={item.path} onPreview={onPreview} />
                    </div>
                  </div>
                  <span
                    className="inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
                    }}
                  >
                    {item.status}
                  </span>
                </div>
                <AgencyActionButtons
                  actions={actions}
                  buildRequest={(action) => ({
                    action,
                    missionId: item.missionId,
                    taskId: item.taskId,
                    path: item.path,
                    queueKey,
                    scope: 'queue',
                    status: item.status,
                  })}
                  onAction={onAction}
                  pendingActionKey={pendingActionKey}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function AgencyReviewCard({
  review,
  onAction,
  onPreview,
  pendingActionKey,
}: {
  review: AgencyReviewSummary
  onAction: (input: AgencyActionRequest) => void
  onPreview: (path: string) => void
  pendingActionKey: string | null
}) {
  const color = reviewStatusColor(review.status)
  const actions = getReviewActions(review)
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--theme-text)]">
            {review.missionTitle} / {review.taskTitle}
          </div>
          <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
            Reviewer {review.reviewer} · {formatRunTimestamp(review.createdAt)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[10px] text-[var(--theme-muted)]">
              {compactAgencyPath(review.path)}
            </p>
            <AgencyPathActions path={review.path} onPreview={onPreview} />
          </div>
        </div>
        <span
          className="inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
          }}
        >
          {reviewStatusLabel(review.status)}
        </span>
      </div>
      <AgencyActionButtons
        actions={actions}
        buildRequest={(action) => ({
          action,
          missionId: review.missionId,
          taskId: review.taskId,
          reviewId: review.id,
          path: review.path,
          scope: 'review',
          status: review.status,
        })}
        onAction={onAction}
        pendingActionKey={pendingActionKey}
      />
    </div>
  )
}

export { AgencyPathActions }
