import { describe, expect, it } from 'vitest'

import { fmtMetricSeconds, statusPerformanceLabels } from './statusPerformance.js'

describe('statusPerformanceLabels', () => {
  it('formats the screenshot-style session metrics', () => {
    expect(
      statusPerformanceLabels({
        cache_read: 820,
        cache_write: 0,
        calls: 4,
        input: 180,
        llm_seconds: 115,
        output: 6_700,
        tokens_per_second: 127,
        tool_calls: 18,
        tool_seconds: 264,
        total: 7_700,
        ttft_avg_seconds: 3.4,
        turns: 3
      })
    ).toEqual([
      '3 turns · 18 tools',
      'LLM 1m 55s · tools 4m 24s',
      'TTFT 3.4s · 127 tok/s',
      'cache 82%',
      'in 180 · out 6.7k'
    ])
  })

  it('does not invent a zero cache hit rate when the provider reports no cache counters', () => {
    expect(
      statusPerformanceLabels({
        calls: 1,
        input: 120,
        output: 30,
        total: 150
      })
    ).toEqual(['1 LLM calls', 'in 120 · out 30'])
  })
})

describe('fmtMetricSeconds', () => {
  it('keeps sub-ten-second latency precise and longer durations compact', () => {
    expect(fmtMetricSeconds(3.44)).toBe('3.4s')
    expect(fmtMetricSeconds(115)).toBe('1m 55s')
  })
})
