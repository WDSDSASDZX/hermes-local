export interface FallbackEntry {
  provider: string
  model: string
}

/** Normalize the current object format plus legacy `provider/model` strings. */
export function normalizeFallbackEntries(value: unknown): FallbackEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map(item => {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>

      return { provider: String(record.provider ?? ''), model: String(record.model ?? '') }
    }

    if (typeof item === 'string') {
      const slash = item.indexOf('/')

      return slash > 0
        ? { provider: item.slice(0, slash), model: item.slice(slash + 1) }
        : { provider: '', model: item }
    }

    return { provider: '', model: '' }
  })
}

export function completeFallbackEntries(rows: FallbackEntry[]): FallbackEntry[] {
  return rows.filter(entry => entry.provider && entry.model)
}

export function fallbackEntriesEqual(a: FallbackEntry[], b: FallbackEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => entry.provider === b[index]?.provider && entry.model === b[index]?.model)
  )
}
