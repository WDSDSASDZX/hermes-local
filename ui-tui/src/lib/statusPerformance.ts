import { fmtDuration } from '../domain/messages.js'
import type { Usage } from '../types.js'

import { fmtK } from './text.js'

export const fmtMetricSeconds = (seconds: number): string => {
  const safe = Math.max(0, seconds)

  return safe < 10 ? `${safe.toFixed(1)}s` : fmtDuration(safe * 1000)
}

/** Session-cumulative performance groups, ordered by user value. */
export function statusPerformanceLabels(usage: Usage): string[] {
  const labels: string[] = []
  const calls = Math.max(0, Math.floor(usage.calls || 0))
  const turns = Math.max(0, Math.floor(usage.turns || 0))
  const toolCalls = Math.max(0, Math.floor(usage.tool_calls || 0))

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
        llmSeconds ? `LLM ${fmtMetricSeconds(llmSeconds)}` : '',
        toolSeconds ? `tools ${fmtMetricSeconds(toolSeconds)}` : ''
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
        ttft ? `TTFT ${fmtMetricSeconds(ttft)}` : '',
        rate ? `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} tok/s` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    )
  }

  const cacheRead = Math.max(0, usage.cache_read || 0)
  const cacheWrite = Math.max(0, usage.cache_write || 0)
  const cacheBase = Math.max(0, usage.input || 0) + cacheRead + cacheWrite

  // Missing cache counters mean the provider did not report them. Hiding the
  // segment is more honest than displaying a fabricated 0% hit rate.
  if ((cacheRead || cacheWrite) && cacheBase > 0) {
    labels.push(`cache ${Math.round((cacheRead / cacheBase) * 100)}%`)
  }

  if (usage.input > 0 || usage.output > 0) {
    labels.push(`in ${fmtK(usage.input)} · out ${fmtK(usage.output)}`)
  }

  return labels
}
