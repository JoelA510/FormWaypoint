import { useId, useLayoutEffect } from 'react'
import type { AppearancePreference } from '../store/local-store'
import { Select } from './ui'

export function Appearance({ value, onChange }: {
  value: AppearancePreference
  onChange: (value: AppearancePreference) => void
}) {
  const id = useId()
  useLayoutEffect(() => {
    document.documentElement.dataset.appearance = value
  }, [value])

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
      Appearance
      <Select id={id} className="w-auto" value={value} onChange={e => onChange(e.target.value as AppearancePreference)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </label>
  )
}
