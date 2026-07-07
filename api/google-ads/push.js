// POST /api/google-ads/push — pushes a saved Hexa Space campaign into a Google Ads
// account as a PAUSED Search campaign (budget → campaign → ad groups → keywords →
// responsive search ads). Nothing spends until the user enables it in Google Ads.
//
// Requires env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//   GOOGLE_ADS_DEVELOPER_TOKEN, SUPABASE_SERVICE_ROLE_KEY,
//   optional GOOGLE_ADS_API_VERSION (default v18).
//
// Body: { campaignId, customerId, loginCustomerId?, finalUrl?, cpc? }

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v18'
const GA = `https://googleads.googleapis.com/${API_VERSION}`

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const micros = (dollars) => Math.round(Number(dollars || 0) * 1_000_000)
const trunc = (s, n) => String(s ?? '').trim().slice(0, n)
const uniq = (arr) => [...new Set(arr.filter(Boolean))]

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'Could not refresh Google token')
  return data.access_token
}

function makeMutate(accessToken, customerId, loginCustomerId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = digits(loginCustomerId)

  return async function mutate(resource, operations) {
    const res = await fetch(`${GA}/customers/${digits(customerId)}/${resource}:mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operations }),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = data?.error?.message
        || data?.error?.details?.[0]?.errors?.[0]?.message
        || JSON.stringify(data?.error ?? data)
      throw new Error(`Google Ads (${resource}): ${msg}`)
    }
    return data.results.map((r) => r.resourceName)
  }
}

// Build one Responsive Search Ad from a group's ads (RSA needs ≥3 headlines, ≥2 descriptions).
function buildRsa(group, finalUrl) {
  let headlines = uniq([
    ...group.ads.map((a) => a.headline),
    ...group.ads.map((a) => a.longHeadline),
  ].map((h) => trunc(h, 30))).slice(0, 15)
  let descriptions = uniq([
    ...group.ads.map((a) => a.description),
    ...group.ads.map((a) => a.primaryText),
  ].map((d) => trunc(d, 90))).slice(0, 4)

  // Pad to the minimums Google requires.
  const padH = [trunc(group.name, 30), 'Enquire today', 'Book a tour', 'Available now']
  while (headlines.length < 3) headlines.push(padH[headlines.length] || `Option ${headlines.length + 1}`)
  const padD = [trunc(group.theme, 90), 'Flexible terms and 24/7 access. Enquire with Hexa Space today.']
  while (descriptions.length < 2) descriptions.push(padD[descriptions.length] || 'Enquire with Hexa Space today.')

  return {
    finalUrls: [finalUrl],
    responsiveSearchAd: {
      headlines: headlines.map((text) => ({ text })),
      descriptions: descriptions.map((text) => ({ text })),
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Admin-only: this writes campaigns/budgets to a Google Ads account via Hexa's token.
  const { requireAdmin } = await import('../_auth.js')
  const _a = await requireAdmin(req)
  if (_a.error) return res.status(_a.status).json({ error: _a.error })

  const { campaignId, customerId, loginCustomerId, finalUrl, cpc } = req.body ?? {}
  if (!campaignId || !customerId) return res.status(400).json({ error: 'Missing campaignId or customerId' })
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return res.status(500).json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    // Refresh token + saved campaign
    const [{ data: metaRows }, { data: campRows }] = await Promise.all([
      supabase.from('meta').select('value').eq('key', 'google_ads_refresh_token'),
      supabase.from('campaigns').select('data').eq('id', campaignId),
    ])
    const refreshToken = metaRows?.[0]?.value
    if (!refreshToken) return res.status(400).json({ error: 'Google Ads not connected' })
    const saved = campRows?.[0]?.data
    const plan = saved?.campaign
    if (!plan?.adGroups?.length) return res.status(400).json({ error: 'Campaign has no ad groups to push' })

    const accessToken = await getAccessToken(refreshToken)
    const mutate = makeMutate(accessToken, customerId, loginCustomerId)

    const url = finalUrl || 'https://www.hexaspace.com.au'
    const cpcMicros = micros(cpc || saved?.math?.inputs?.cpc || 2)
    const dailyBudget = plan.recommendedDailyBudget || (Number(saved?.monthlyBudget || 0) / 30) || 30
    const stamp = Date.now()

    // 1. Budget
    const [budgetRN] = await mutate('campaignBudgets', [{
      create: { name: `${plan.campaignName} budget ${stamp}`, amountMicros: String(micros(dailyBudget)), deliveryMethod: 'STANDARD', explicitlyShared: false },
    }])

    // 2. Campaign (PAUSED, manual CPC, Search)
    const [campaignRN] = await mutate('campaigns', [{
      create: {
        name: `${plan.campaignName} ${stamp}`,
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        manualCpc: {},
        campaignBudget: budgetRN,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      },
    }])

    // 3. Ad groups (+ keywords + RSA) per plan group
    let keywordsCreated = 0
    let adsCreated = 0
    for (const group of plan.adGroups) {
      const [adGroupRN] = await mutate('adGroups', [{
        create: { name: trunc(group.name, 250), campaign: campaignRN, status: 'PAUSED', type: 'SEARCH_STANDARD', cpcBidMicros: String(cpcMicros) },
      }])

      const keywords = uniq(group.keywords ?? []).slice(0, 50)
      if (keywords.length) {
        await mutate('adGroupCriteria', keywords.map((text) => ({
          create: { adGroup: adGroupRN, status: 'ENABLED', keyword: { text: trunc(text, 80), matchType: 'PHRASE' } },
        })))
        keywordsCreated += keywords.length
      }

      await mutate('adGroupAds', [{
        create: { adGroup: adGroupRN, status: 'PAUSED', ad: buildRsa(group, url) },
      }])
      adsCreated += 1
    }

    return res.status(200).json({
      success: true,
      campaignResourceName: campaignRN,
      adGroups: plan.adGroups.length,
      keywordsCreated,
      adsCreated,
    })
  } catch (err) {
    console.error('Google Ads push error:', err)
    return res.status(500).json({ error: err.message ?? 'Push failed' })
  }
}
