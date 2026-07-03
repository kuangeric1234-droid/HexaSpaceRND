// Shared Xero helpers for the api/xero/* routes.
//
// Connection state (OAuth tokens + tenant) lives in the `integrations` table
// (id = 'xero') — service-role only, no anon RLS policy, so tokens never
// reach the browser. See xero-schema.sql.
//
// Xero access tokens last 30 minutes; refresh tokens rotate on every refresh,
// so the new refresh token must be persisted immediately.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL

export const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
export const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'
export const XERO_API = 'https://api.xero.com/api.xro/2.0'
// Granular scopes — apps created after 2 Mar 2026 can't request the old broad
// accounting.transactions scope (Xero rejects the whole request: invalid_scope).
export const XERO_SCOPES = 'openid profile email offline_access accounting.invoices accounting.payments.read accounting.contacts accounting.settings.read'

export function getSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function loadConnection(supabase) {
  const { data, error } = await supabase.from('integrations').select('data').eq('id', 'xero').maybeSingle()
  if (error) {
    // 42P01 = table missing — surface a setup hint instead of a cryptic failure
    if (error.code === '42P01') throw new Error('`integrations` table missing — run xero-schema.sql in the Supabase SQL editor.')
    throw new Error(error.message)
  }
  return data?.data ?? null
}

export async function saveConnection(supabase, conn) {
  const { error } = await supabase.from('integrations').upsert({
    id: 'xero',
    data: conn,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export function basicAuth() {
  const id = process.env.XERO_CLIENT_ID
  const secret = process.env.XERO_CLIENT_SECRET
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

// Returns { accessToken, tenantId, conn } refreshing (and persisting) if the
// access token is within 60s of expiry.
export async function getAccessToken(supabase) {
  const conn = await loadConnection(supabase)
  if (!conn?.refreshToken) throw new Error('Xero is not connected.')

  if (conn.expiresAt && Date.now() < conn.expiresAt - 60_000 && conn.accessToken) {
    return { accessToken: conn.accessToken, tenantId: conn.tenantId, conn }
  }

  const r = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.access_token) {
    console.error('Xero token refresh failed:', tok)
    throw new Error('Xero token refresh failed — reconnect from Settings → Integrations → Xero.')
  }

  const next = {
    ...conn,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? conn.refreshToken, // rotation
    expiresAt: Date.now() + (tok.expires_in ?? 1800) * 1000,
  }
  await saveConnection(supabase, next)
  return { accessToken: next.accessToken, tenantId: next.tenantId, conn: next }
}

export async function xeroFetch(supabase, path, { method = 'GET', body } = {}) {
  const { accessToken, tenantId } = await getAccessToken(supabase)
  const r = await fetch(`${XERO_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await r.json() } catch { /* some errors return empty bodies */ }
  return { ok: r.ok, status: r.status, json }
}

// Xero's accounting API returns .NET JSON dates like "/Date(1725148800000+0000)/".
export function parseXeroDate(s) {
  const m = String(s ?? '').match(/\/Date\((\d+)/)
  return m ? new Date(Number(m[1])).toISOString().split('T')[0] : null
}
