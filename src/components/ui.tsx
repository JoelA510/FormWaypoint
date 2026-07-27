/**
 * Small local UI primitives.
 *
 * Plain semantic elements rather than a component library: every control here is a native
 * input, button or table, which keeps keyboard and screen-reader behaviour correct without
 * re-implementing it. Styling goes through the tokens in `styles/globals.css`, so light and
 * dark are handled in one place.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from '../lib/utils'

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' &&
          'border-transparent bg-[var(--color-accent)] text-white hover:brightness-110 disabled:hover:brightness-100',
        variant === 'default' &&
          'border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-sunken)]',
        variant === 'ghost' && 'border-transparent bg-transparent text-[var(--color-ink-soft)] hover:bg-[var(--color-sunken)]',
        variant === 'danger' && 'border-transparent bg-[var(--color-block)] text-white hover:brightness-110',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border bg-[var(--color-surface)] shadow-sm', className)}>{children}</section>
  )
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

export type Tone = 'pass' | 'warn' | 'block' | 'neutral' | 'accent'

const TONE_CLASSES: Record<Tone, string> = {
  pass: 'bg-[var(--color-pass-soft)] text-[var(--color-pass)]',
  warn: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  block: 'bg-[var(--color-block-soft)] text-[var(--color-block)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]',
  neutral: 'bg-[var(--color-sunken)] text-[var(--color-ink-soft)]',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase',
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-[var(--color-ink-soft)] uppercase">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs text-[var(--color-ink-faint)]">{hint}</p> : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-md border bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-20 resize-y', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, className)} {...props}>
      {children}
    </select>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  hint?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--color-accent)]"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-[var(--color-ink)]">
          {label}
        </label>
        {hint ? <p className="text-xs text-[var(--color-ink-faint)]">{hint}</p> : null}
      </div>
    </div>
  )
}

/** A value plus where it came from. The provenance line is the point of this component. */
export function ProvenanceRow({ label, value, source, tone }: { label: string; value: ReactNode; source: string; tone?: Tone }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 last:border-b-0">
      <span className="text-sm text-[var(--color-ink-soft)]">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="text-sm font-medium text-[var(--color-ink)]">{value || <em className="text-[var(--color-ink-faint)]">not set</em>}</span>
        {tone ? <Badge tone={tone}>{source}</Badge> : <span className="text-xs text-[var(--color-ink-faint)]">{source}</span>}
      </span>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
      {children ? <div className="mt-1 text-sm text-[var(--color-ink-soft)]">{children}</div> : null}
    </div>
  )
}
