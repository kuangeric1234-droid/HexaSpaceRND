import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function PortalLogin() {
  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.hostname.startsWith('members.') ? '' : '/portal'}`,
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="font-heading uppercase text-2xl tracking-[0.22em] text-ink">Hexa&nbsp;Space</div>
          <p className="hx-eyebrow mt-2">Member Portal</p>
        </div>

        <div className="hx-card p-8">
          {mode === 'login' ? (
            <>
              <h1 className="hx-h text-lg mb-6">Sign in</h1>
              {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="hx-eyebrow block mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    autoComplete="email" placeholder="your@email.com" className="hx-input" />
                </div>
                <div>
                  <label className="hx-eyebrow block mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    autoComplete="current-password" placeholder="••••••••" className="hx-input" />
                </div>
                <button type="submit" disabled={loading} className="hx-btn w-full disabled:opacity-50">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <button onClick={() => { setMode('reset'); setError('') }}
                className="mt-5 hx-eyebrow hover:text-ink transition-colors w-full text-center">
                Forgot password?
              </button>
            </>
          ) : (
            <>
              <h1 className="hx-h text-lg mb-2">Reset password</h1>
              <p className="hx-prose mb-6">We'll send a reset link to your email.</p>
              {resetSent ? (
                <div className="text-sm text-hexa-green bg-hexa-green/5 border border-hexa-green/30 px-3 py-3 text-center">
                  Check your email for a reset link.
                </div>
              ) : (
                <>
                  {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <label className="hx-eyebrow block mb-1.5">Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                        placeholder="your@email.com" className="hx-input" />
                    </div>
                    <button type="submit" disabled={loading} className="hx-btn w-full disabled:opacity-50">
                      {loading ? 'Sending…' : 'Send reset link'}
                    </button>
                  </form>
                </>
              )}
              <button onClick={() => { setMode('login'); setError(''); setResetSent(false) }}
                className="mt-5 hx-eyebrow hover:text-ink transition-colors w-full text-center">
                ← Back to sign in
              </button>
            </>
          )}
        </div>

        <p className="text-center hx-eyebrow mt-6 normal-case tracking-normal">
          Level 4, 830 Whitehorse Road, Box Hill · hexaspace.com.au
        </p>
      </div>
    </div>
  )
}
