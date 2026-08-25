import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { SubagentProgress } from '@/store/subagents'
import type { SessionInfo, StatusResponse } from '@/types/hermes'

import { CommandCenterOverview } from './overview'

const STATUS = {
  active_sessions: 2,
  gateway_running: true,
  version: '0.17.0'
} as StatusResponse

const SESSIONS = [
  {
    id: 'session-1',
    input_tokens: 10,
    is_active: true,
    last_active: 20,
    message_count: 6,
    model: 'claude-opus-5',
    output_tokens: 5,
    preview: 'Working',
    source: 'desktop',
    started_at: 10,
    title: 'Build release',
    tool_call_count: 2
  }
] as SessionInfo[]

const SUBAGENTS = [
  {
    filesRead: [],
    filesWritten: [],
    goal: 'Check the build',
    id: 'agent-1',
    parentId: null,
    startedAt: 1,
    status: 'running',
    stream: [],
    taskCount: 1,
    taskIndex: 0,
    updatedAt: 2
  }
] as SubagentProgress[]

function renderOverview({
  kanbanAvailable = true,
  loading = false,
  onNavigateRoute = vi.fn(),
  status = STATUS
}: {
  kanbanAvailable?: boolean
  loading?: boolean
  onNavigateRoute?: (path: string) => void
  status?: StatusResponse | null
} = {}) {
  render(
    <I18nProvider configClient={null} initialLocale="en">
      <CommandCenterOverview
        error=""
        fallbacks={[{ model: 'gpt-5.6-sol', provider: 'openai' }]}
        kanbanAvailable={kanbanAvailable}
        loading={loading}
        onNavigateRoute={onNavigateRoute}
        onOpenSession={vi.fn()}
        onRefresh={vi.fn()}
        sessions={SESSIONS}
        status={status}
        subagents={SUBAGENTS}
      />
    </I18nProvider>
  )

  return onNavigateRoute
}

describe('CommandCenterOverview', () => {
  afterEach(cleanup)

  it('shows live operational data and the configured fallback chain', () => {
    renderOverview()

    expect(screen.getByText('Online')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('openai / gpt-5.6-sol')).toBeTruthy()
    expect(screen.getByText('Build release')).toBeTruthy()
    expect(screen.getByText(/claude-opus-5/)).toBeTruthy()
  })

  it('opens task and model workspaces from their action cards', () => {
    const onNavigateRoute = renderOverview()

    fireEvent.click(screen.getByRole('button', { name: /Task board/ }))
    fireEvent.click(screen.getByRole('button', { name: /Model routing/ }))

    expect(onNavigateRoute).toHaveBeenNthCalledWith(1, '/kanban')
    expect(onNavigateRoute).toHaveBeenNthCalledWith(2, '/settings?tab=config%3Amodel')
  })

  it('does not report an offline gateway before status loading finishes', () => {
    renderOverview({ loading: true, status: null })

    expect(screen.queryByText('Offline')).toBeNull()
    expect(screen.getAllByText('Refreshing').length).toBeGreaterThan(0)
  })

  it('disables task navigation when the Kanban contribution is unavailable', () => {
    const onNavigateRoute = renderOverview({ kanbanAvailable: false })
    const button = screen.getByRole('button', { name: /Task board/ })

    expect(button).toHaveProperty('disabled', true)
    fireEvent.click(button)
    expect(onNavigateRoute).not.toHaveBeenCalled()
  })
})
