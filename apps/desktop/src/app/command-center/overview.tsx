import type { ReactNode } from 'react'

import { type FallbackEntry } from '@/app/settings/fallback-models'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import type { LayoutDashboard } from '@/lib/icons'
import { Activity, ArrowUpRight, GitBranch, MessageCircle, RefreshCw, Settings2, Users, Zap } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { SubagentProgress } from '@/store/subagents'
import type { SessionInfo, StatusResponse } from '@/types/hermes'

interface CommandCenterOverviewProps {
  error: string
  fallbacks: FallbackEntry[]
  kanbanAvailable: boolean
  loading: boolean
  onNavigateRoute?: (path: string) => void
  onOpenSession: (sessionId: string) => void
  onRefresh: () => void
  sessions: readonly SessionInfo[]
  status: StatusResponse | null
  subagents: readonly SubagentProgress[]
}

function Metric({ detail, label, value }: { detail: string; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-(--ui-stroke-tertiary) pl-4 first:border-l-0 first:pl-0 max-sm:border-l-0 max-sm:border-t max-sm:pl-0 max-sm:pt-3 max-sm:first:border-t-0 max-sm:first:pt-0">
      <div className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-(--ui-text-tertiary)">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 line-clamp-2 text-[length:var(--conversation-caption-font-size)] leading-snug text-(--ui-text-tertiary)">
        {detail}
      </div>
    </div>
  )
}

function WorkspaceAction({
  description,
  disabled,
  icon: Icon,
  label,
  onClick
}: {
  description: string
  disabled?: boolean
  icon: typeof LayoutDashboard
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'group flex min-h-24 items-start gap-3 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) p-3 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-(--ui-stroke-secondary) hover:bg-(--chrome-action-hover)'
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[color:var(--dt-primary)]/10 text-[color:var(--dt-primary)]">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-[length:var(--conversation-text-font-size)] font-semibold text-foreground">
          {label}
          {!disabled && (
            <ArrowUpRight className="size-3.5 shrink-0 text-(--ui-text-tertiary) transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          )}
        </span>
        <span className="mt-1 block text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {description}
        </span>
      </span>
    </button>
  )
}

export function CommandCenterOverview({
  error,
  fallbacks,
  kanbanAvailable,
  loading,
  onNavigateRoute,
  onOpenSession,
  onRefresh,
  sessions,
  status,
  subagents
}: CommandCenterOverviewProps) {
  const { t } = useI18n()
  const copy = t.commandCenter.overview

  const sortedSessions = [...sessions]
    .sort((a, b) => (b.last_active || b.started_at || 0) - (a.last_active || a.started_at || 0))
    .slice(0, 4)

  const liveAgents = subagents.filter(agent => agent.status === 'running' || agent.status === 'queued')
  const failedAgents = subagents.filter(agent => agent.status === 'failed')
  const navigate = (path: string) => onNavigateRoute?.(path)
  const gatewayLabel = status ? (status.gateway_running ? copy.operational : copy.attention) : copy.refreshing
  const gatewayValue = status ? (status.gateway_running ? copy.online : copy.offline) : '—'

  const gatewayDetail = status
    ? status.gateway_running
      ? copy.gatewayReady
      : copy.gatewayUnavailable
    : copy.refreshing

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
      <section className="relative overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-5 py-5">
        <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-[color:var(--dt-primary)]/8 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 max-sm:flex-col">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-2 py-1 text-[0.65rem] font-medium text-(--ui-text-secondary)">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  status
                    ? status.gateway_running
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                    : 'animate-pulse bg-muted-foreground'
                )}
              />
              {gatewayLabel}
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{copy.title}</h2>
            <p className="mt-1.5 text-[length:var(--conversation-text-font-size)] leading-relaxed text-(--ui-text-secondary)">
              {copy.subtitle}
            </p>
          </div>
          <Button disabled={loading} onClick={onRefresh} size="sm" variant="outline">
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            {loading ? copy.refreshing : copy.refresh}
          </Button>
        </div>

        <div className="relative mt-5 grid grid-cols-4 gap-4 border-t border-(--ui-stroke-tertiary) pt-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <Metric detail={gatewayDetail} label={copy.gateway} value={gatewayValue} />
          <Metric detail={copy.sessionsDetail} label={copy.activeSessions} value={status?.active_sessions ?? '—'} />
          <Metric
            detail={failedAgents.length ? copy.agentsFailed(failedAgents.length) : copy.agentsDetail}
            label={copy.liveAgents}
            value={liveAgents.length}
          />
          <Metric
            detail={fallbacks.length ? copy.fallbackReady : copy.fallbackEmpty}
            label={copy.fallbackModels}
            value={fallbacks.length}
          />
        </div>
      </section>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[length:var(--conversation-caption-font-size)] text-destructive">
          {error}
        </div>
      )}

      <section className="mt-5">
        <div className="mb-2.5">
          <h3 className="text-[length:var(--conversation-text-font-size)] font-semibold text-foreground">
            {copy.workspaces}
          </h3>
          <p className="mt-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
            {copy.workspacesDetail}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          <WorkspaceAction
            description={kanbanAvailable ? copy.tasksDetail : copy.tasksUnavailable}
            disabled={!kanbanAvailable}
            icon={Zap}
            label={copy.tasks}
            onClick={() => navigate('/kanban')}
          />
          <WorkspaceAction
            description={copy.profilesDetail}
            icon={Users}
            label={copy.profiles}
            onClick={() => navigate('/profiles')}
          />
          <WorkspaceAction
            description={copy.modelsDetail}
            icon={GitBranch}
            label={copy.models}
            onClick={() => navigate('/settings?tab=config%3Amodel')}
          />
          <WorkspaceAction
            description={copy.tracesDetail}
            icon={Activity}
            label={copy.traces}
            onClick={() => navigate('/agents')}
          />
        </div>
      </section>

      <div className="mt-5 grid min-h-0 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--conversation-text-font-size)] font-semibold text-foreground">
            <MessageCircle className="size-4 text-(--ui-text-tertiary)" />
            {copy.recentSessions}
          </h3>
          {sortedSessions.length ? (
            <ul className="divide-y divide-(--ui-stroke-tertiary)">
              {sortedSessions.map(session => (
                <li key={session.id}>
                  <button
                    className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-[color:var(--dt-primary)]"
                    onClick={() => onOpenSession(session.id)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[length:var(--conversation-text-font-size)] font-medium">
                        {sessionTitle(session)}
                      </span>
                      <span className="mt-0.5 block truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                        {session.model || copy.defaultModel} · {session.message_count} {copy.messages}
                      </span>
                    </span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-(--ui-text-tertiary)" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {copy.noSessions}
            </p>
          )}
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-[length:var(--conversation-text-font-size)] font-semibold text-foreground">
              <GitBranch className="size-4 text-(--ui-text-tertiary)" />
              {copy.fallbackChain}
            </h3>
            <Button onClick={() => navigate('/settings?tab=config%3Amodel')} size="xs" variant="text">
              <Settings2 className="size-3.5" />
              {copy.configure}
            </Button>
          </div>
          {fallbacks.length ? (
            <ol className="divide-y divide-(--ui-stroke-tertiary)">
              {fallbacks.map((fallback, index) => (
                <li className="flex items-center gap-3 py-2" key={`${fallback.provider}:${fallback.model}:${index}`}>
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-(--ui-bg-tertiary) font-mono text-[0.62rem] text-(--ui-text-tertiary)">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-foreground">
                    {fallback.provider} / {fallback.model}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-4 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {copy.noFallbacks}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
