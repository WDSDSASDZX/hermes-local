import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getGlobalModelOptions } from '@/hermes'
import { useI18n } from '@/i18n'
import { Plus, X } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { CONTROL_TEXT } from './constants'
import {
  completeFallbackEntries,
  fallbackEntriesEqual,
  type FallbackEntry,
  normalizeFallbackEntries
} from './fallback-models'

/**
 * Structured editor for the top-level `fallback_providers` config list — a
 * chain of `{provider, model}` pairs tried in order when the default model
 * fails. Replaces the generic comma-string `list` input, which stringified the
 * objects to "[object Object], [object Object]".
 *
 * Mirrors the Auxiliary Models picker in `model-settings.tsx`: provider + model
 * selects sourced from `getGlobalModelOptions()`. Half-filled rows are kept in
 * local state and only complete pairs are emitted upward, so the config
 * autosave never persists a partial `{provider, model: ''}`.
 */
export function FallbackModelsField({
  value,
  onChange
}: {
  value: unknown
  onChange: (next: FallbackEntry[]) => void
}) {
  const { t } = useI18n()
  const m = t.settings.model

  const modelOptions = useQuery({
    queryKey: ['model-options', 'global'],
    queryFn: () => getGlobalModelOptions()
  })

  const providers = (modelOptions.data?.providers ?? []).filter(provider => provider.slug)

  const [rows, setRows] = useState<FallbackEntry[]>(() => normalizeFallbackEntries(value))
  // Last complete chain we emitted (or seeded). Autosave echoes the same
  // filtered list back through `value`; ignore that echo so draft rows stay.
  const lastEmittedRef = useRef(normalizeFallbackEntries(value))

  // Resync on real external changes (profile switch / config reload). Skip
  // when `value` is just our own commit echoing through the parent.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    const persisted = normalizeFallbackEntries(value)

    if (fallbackEntriesEqual(persisted, lastEmittedRef.current)) {
      return
    }

    lastEmittedRef.current = persisted
    setRows(persisted)
  }, [value])

  const commit = (next: FallbackEntry[]) => {
    const complete = completeFallbackEntries(next)

    setRows(next)
    lastEmittedRef.current = complete
    onChange(complete)
  }

  const updateRow = (index: number, patch: Partial<FallbackEntry>) =>
    commit(rows.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))

  return (
    <div className="grid w-full gap-1.5">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">{m.fallbackEmpty}</p>}
      {rows.map((entry, index) => {
        const providerRow = providers.find(provider => provider.slug === entry.provider)
        const catalog = providerRow?.models ?? []
        // Keep an out-of-catalog model selectable so an existing custom
        // provider/model renders instead of showing a blank box.
        const modelItems = entry.model && !catalog.includes(entry.model) ? [entry.model, ...catalog] : catalog

        return (
          <div className="flex flex-wrap items-center gap-2" key={index}>
            <span className="w-4 shrink-0 text-center font-mono text-[0.7rem] text-muted-foreground">{index + 1}</span>
            <Select onValueChange={provider => updateRow(index, { provider, model: '' })} value={entry.provider}>
              <SelectTrigger className={cn('min-w-36', CONTROL_TEXT)}>
                <SelectValue placeholder={m.provider} />
              </SelectTrigger>
              <SelectContent>
                {providers.map(provider => (
                  <SelectItem key={provider.slug} value={provider.slug}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={model => updateRow(index, { model })} value={entry.model}>
              <SelectTrigger className={cn('min-w-52 flex-1', CONTROL_TEXT)}>
                <SelectValue placeholder={m.model} />
              </SelectTrigger>
              <SelectContent>
                {modelItems.map(model => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label={t.common.remove}
              onClick={() => commit(rows.filter((_, i) => i !== index))}
              size="icon-xs"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )
      })}
      <div>
        <Button onClick={() => commit([...rows, { provider: '', model: '' }])} size="sm" variant="textStrong">
          <Plus className="size-3.5" />
          {m.fallbackAdd}
        </Button>
      </div>
    </div>
  )
}
