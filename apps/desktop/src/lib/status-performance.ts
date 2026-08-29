import type { UsageStats } from '@/types/hermes'

const compactTokens = (value: number): string => {
  const safe = Math.max(0, value)

  if (safe < 1_000) {
    return String(Math.round(safe))
  }

  if (safe < 1_000_000) {
    return `${Number((safe / 1_000).toFixed(safe < 10_000 ? 1 : 0))}k`
  }

  return `${Number((safe / 1_000_000).toFixed(safe < 10_000_000 ? 1 : 0))}m`
}

export const formatMetricSeconds = (seconds: number): string => {
  const safe = Math.max(0, seconds)

  if (safe < 10) {
    return `${safe.toFixed(1)}s`
  }
  const rounded = Math.round(safe)
  const hours = Math.floor(rounded / 3_600)
  const minutes = Math.floor((rounded % 3_600) / 60)
  const remainder = rounded % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainder}s`
  }

  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

export function statusPerformanceLabels(usage: UsageStats): string[] {
  const labels: string[] = []
  const turns = Math.max(0, Math.floor(usage.turns || 0))
  const toolCalls = Math.max(0, Math.floor(usage.tool_calls || 0))
  const calls = Math.max(0, Math.floor(usage.calls || 0))
  const lastTurn = Math.max(0, usage.last_turn_seconds || 0)

  if (lastTurn > 0) {
    labels.push(`last response ${formatMetricSeconds(lastTurn)}`)
  }

  if (turns || toolCalls) {
    labels.push([turns ? `${turns} turns` : '', toolCalls ? `${toolCalls} tools` : ''].filter(Boolean).join(' · '))
  } else if (calls) {
    labels.push(`${calls} LLM calls`)
  }

  const llmSeconds = Math.max(0, usage.llm_seconds || 0)
  const toolSeconds = Math.max(0, usage.tool_seconds || 0)

  if (llmSeconds || toolSeconds) {
    labels.push(
      [
        llmSeconds ? `LLM ${formatMetricSeconds(llmSeconds)}` : '',
        toolSeconds ? `tools ${formatMetricSeconds(toolSeconds)}` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    )
  }

  const ttft = Math.max(0, usage.ttft_avg_seconds || 0)
  const rate = Math.max(0, usage.tokens_per_second || 0)

  if (ttft || rate) {
    labels.push(
      [
        ttft ? `TTFT ${formatMetricSeconds(ttft)}` : '',
        rate ? `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} tok/s` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    )
  }

  const cacheRead = Math.max(0, usage.cache_read || 0)
  const cacheWrite = Math.max(0, usage.cache_write || 0)
  const cacheBase = Math.max(0, usage.input || 0) + cacheRead + cacheWrite

  if ((cacheRead || cacheWrite) && cacheBase > 0) {
    labels.push(`cache ${Math.round((cacheRead / cacheBase) * 100)}%`)
  }

  if (usage.input > 0 || usage.output > 0) {
    labels.push(`in ${compactTokens(usage.input)} · out ${compactTokens(usage.output)}`)
  }

  return labels
}

export function statusPerformanceSummary(usage: UsageStats): { detail?: string; label?: string } {
  const lastTurn = Math.max(0, usage.last_turn_seconds || 0)
  const ttft = Math.max(0, usage.ttft_avg_seconds || 0)
  const rate = Math.max(0, usage.tokens_per_second || 0)

  const speed = [
    ttft ? `TTFT ${formatMetricSeconds(ttft)}` : '',
    rate ? `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} tok/s` : ''
  ]
    .filter(Boolean)
    .join(' · ')

  if (lastTurn > 0) {
    return { detail: speed || undefined, label: `✓ ${formatMetricSeconds(lastTurn)}` }
  }

  if (speed) {
    return { label: speed }
  }
  const fallback = statusPerformanceLabels(usage)[0]

  return fallback ? { label: fallback } : {}
}
