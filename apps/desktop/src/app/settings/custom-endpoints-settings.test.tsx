import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const activateCustomEndpoint = vi.fn()
const deleteCustomEndpoint = vi.fn()
const getCustomEndpoints = vi.fn()
const saveCustomEndpoint = vi.fn()
const validateCustomEndpoint = vi.fn()

vi.mock('@/hermes', () => ({
  activateCustomEndpoint: (id: string) => activateCustomEndpoint(id),
  deleteCustomEndpoint: (id: string) => deleteCustomEndpoint(id),
  getCustomEndpoints: () => getCustomEndpoints(),
  saveCustomEndpoint: (body: unknown) => saveCustomEndpoint(body),
  validateCustomEndpoint: (body: unknown) => validateCustomEndpoint(body)
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

beforeEach(() => {
  getCustomEndpoints.mockResolvedValue({
    current: {
      provider: 'claude-relay',
      model: 'claude-opus-test',
      base_url: 'https://relay.example.test'
    },
    endpoints: [
      {
        id: 'claude-relay',
        name: 'Claude Relay',
        base_url: 'https://relay.example.test',
        model: 'claude-opus-test',
        models: ['claude-opus-test'],
        api_mode: 'anthropic_messages',
        anthropic_auth: 'bearer',
        context_length: 200000,
        discover_models: true,
        has_api_key: true,
        api_key_preview: 'API key set',
        is_current: true,
        source: 'providers'
      }
    ]
  })
  validateCustomEndpoint.mockResolvedValue({
    ok: true,
    reachable: true,
    message: '',
    models: ['claude-opus-test'],
    latency_ms: 123
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CustomEndpointsSettings', () => {
  it('loads an Anthropic relay and probes with its protocol and auth settings', async () => {
    const { CustomEndpointsSettings } = await import('./custom-endpoints-settings')
    render(<CustomEndpointsSettings />)

    expect(await screen.findByText('Relay Providers')).toBeTruthy()
    expect(screen.getAllByText('Anthropic Messages').length).toBeGreaterThan(0)
    expect(screen.getByText('Authorization: Bearer')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await waitFor(() =>
      expect(validateCustomEndpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'claude-relay',
          base_url: 'https://relay.example.test',
          model: 'claude-opus-test',
          api_mode: 'anthropic_messages',
          anthropic_auth: 'bearer'
        })
      )
    )
  })
})
