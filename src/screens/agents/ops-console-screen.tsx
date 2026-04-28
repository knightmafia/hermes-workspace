import { useMemo, useState } from 'react'

const EMBED_PATH = '/hci-ui/'

export function OpsConsoleScreen() {
  const [frameKey, setFrameKey] = useState(0)
  const [lastReloadAt, setLastReloadAt] = useState<string | null>(null)
  const iframeSrc = useMemo(() => `${EMBED_PATH}?embed=1`, [])

  function reloadFrame() {
    setFrameKey((current) => current + 1)
    setLastReloadAt(new Date().toLocaleTimeString())
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-[var(--theme-bg)] p-4 text-[var(--theme-text)] md:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
            Unified shell
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Ops Console</h1>
          <p className="max-w-3xl text-sm text-[var(--theme-muted)]">
            Hermes Control Interface embedded inside Workspace. Phase 1 keeps both apps linked. Phase 2 starts here by proxying HCI through the Workspace shell.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reloadFrame}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--theme-border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--theme-bg-subtle)]"
          >
            Reload panel
          </button>
          <a
            href={EMBED_PATH}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-[var(--theme-accent-foreground,#111)] transition hover:opacity-90"
          >
            Open standalone
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs text-[var(--theme-muted)]">
        <span>Proxy target: HCI_BACKEND_URL or http://127.0.0.1:10272</span>
        <span>{lastReloadAt ? `Reloaded ${lastReloadAt}` : 'Live embed ready'}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-black/10 shadow-sm">
        <iframe
          key={frameKey}
          title="Hermes Control Interface"
          src={iframeSrc}
          className="h-full min-h-[720px] w-full border-0 bg-white"
        />
      </div>
    </div>
  )
}
