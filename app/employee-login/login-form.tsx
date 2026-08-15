'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** Which field the server said was wrong, so it can be highlighted. */
  const [badField, setBadField] = React.useState<'username' | 'password' | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setBadField(null)
    try {
      const res = await fetch('/api/employee-auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error ?? 'Sign-in failed')
        // fail() nests extras under `details`.
        setBadField(json?.details?.field ?? null)
        return
      }
      router.replace('/employee/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const base =
    'h-10 w-full rounded-lg border bg-surface px-3 text-sm focus:outline-none focus:ring-2'
  const ok      = 'border-border focus:border-brand focus:ring-brand/20'
  const invalid = 'border-coral focus:border-coral focus:ring-coral/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Username</span>
        <input
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={badField === 'username'}
          className={`${base} ${badField === 'username' ? invalid : ok}`}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Password</span>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={badField === 'password'}
            className={`${base} pr-11 ${badField === 'password' ? invalid : ok}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            // tabIndex -1 so Tab goes straight from password to Sign in.
            tabIndex={-1}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-brand text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
