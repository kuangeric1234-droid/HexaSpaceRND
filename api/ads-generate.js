// Vercel serverless function — POST /api/ads-generate
// Claude-powered ads automation for Meta + Google. Modeled on the claude-ads
// skill set: market/audience/competitor research and full campaign generation,
// with paid-media best-practice guardrails baked in.
// Requires env var: ANTHROPIC_API_KEY.
//
// Body: {
//   action: 'research' | 'campaign',
//   platform: 'google' | 'meta' | 'both',
//   objective?: string,        // 'leads' | 'traffic' | 'awareness'
//   monthlyBudget?: number,
//   targetCpa?: number,
//   space?: object,            // a Hexa Space unit the campaign promotes
//   company?: object,          // brand (settings.company)
//   audienceNotes?: string,
//   research?: string,         // research text fed into the campaign step
// }

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-4-8'

// Best-practice guardrails ported from the claude-ads skill.
const GUARDRAILS = `Apply these paid-media best practices:
- Google: never recommend Broad Match without Smart Bidding (tCPA/tROAS). Group tight, intent-matched keyword themes. Always assume conversion tracking is required.
- Meta: prioritise creative diversity (provide multiple distinct angles), advantage+ audiences where sensible, and assume Pixel + Conversions API tracking.
- Use Smart Bidding / value-based bidding by default; flag if a target CPA looks unrealistic (e.g. proposed CPA would exceed 3x a sensible benchmark).
- Be specific and locally relevant (Box Hill / south-east Melbourne, industrial leasing).`

function brandLine(company = {}) {
  return `${company.name || 'Hexa Space'} (${company.website || 'hexaspace.com.au'}) — industrial business hub in Box Hill, Melbourne. Tagline "build locally, scale sustainably". Leases warehouses, storage, offices and pop-up bays.`
}

function unitLine(space) {
  if (!space) return 'No specific unit — general leasing campaign for available spaces.'
  return [`Unit ${space.unitNumber}`, space.type, space.size, space.address,
    space.monthlyRate ? `$${space.monthlyRate.toLocaleString('en-AU')}/mo` : null,
    space.cars ? `${space.cars} car spaces` : null, space.attributes]
    .filter(Boolean).join(' · ')
}

const KEYWORDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          intent: { type: 'string' },     // high | medium | low
          matchType: { type: 'string' },  // phrase | exact | broad
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'keywords'],
      },
    },
    longTail: { type: 'array', items: { type: 'string' } },
    negativeIdeas: { type: 'array', items: { type: 'string' } },
    competitorAngles: { type: 'array', items: { type: 'string' } },
  },
  required: ['groups'],
}

const CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    campaignName: { type: 'string' },
    objective: { type: 'string' },
    platform: { type: 'string' },
    recommendedDailyBudget: { type: 'number' },
    biddingStrategy: { type: 'string' },
    trackingNotes: { type: 'string' },
    audiences: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, targeting: { type: 'string' } },
        required: ['name', 'targeting'],
      },
    },
    adGroups: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          theme: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          ads: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                headline: { type: 'string' },
                longHeadline: { type: 'string' },
                description: { type: 'string' },
                primaryText: { type: 'string' },
                cta: { type: 'string' },
              },
              required: ['headline', 'description', 'cta'],
            },
          },
        },
        required: ['name', 'theme', 'ads'],
      },
    },
  },
  required: ['campaignName', 'objective', 'platform', 'recommendedDailyBudget', 'biddingStrategy', 'audiences', 'adGroups'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { action = 'research', platform = 'both', objective = 'leads', monthlyBudget, targetCpa,
    space, company, audienceNotes, research } = req.body ?? {}

  const platformLabel = platform === 'both' ? 'Google Ads and Meta Ads' : platform === 'google' ? 'Google Ads' : 'Meta Ads'
  const ctx = `${brandLine(company)}
Promoting: ${unitLine(space)}
Objective: ${objective}. Platform(s): ${platformLabel}.${monthlyBudget ? ` Monthly budget: ~$${Number(monthlyBudget).toLocaleString('en-AU')}.` : ''}${targetCpa ? ` Target cost per lead: ~$${targetCpa}.` : ''}${audienceNotes ? ` Notes: ${audienceNotes}` : ''}`

  try {
    const client = new Anthropic({ apiKey })

    if (action === 'research') {
      const system = `You are a senior paid-media strategist. ${GUARDRAILS}
Output clean markdown only — no preamble.`
      const user = `Produce concise campaign research for ${platformLabel}.
${ctx}

Cover, with short headed sections:
1. Ideal customer & audience segments (who leases this kind of space, triggers, pain points)
2. ${platform === 'google' || platform === 'both' ? 'Google keyword themes (head + long-tail, local intent) with rough match-type guidance' : ''}${platform === 'meta' || platform === 'both' ? '\n3. Meta audience targeting (interests, behaviours, lookalike/Advantage+ suggestions)' : ''}
4. 3–4 messaging angles that would resonate
5. Likely objections and how the ad should pre-empt them
Keep it practical and specific to this space.`
      const message = await client.messages.create({ model: MODEL, max_tokens: 3000, system, messages: [{ role: 'user', content: user }] })
      if (message.stop_reason === 'refusal') return res.status(422).json({ error: 'Request declined.' })
      const text = (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      return res.status(200).json({ text })
    }

    if (action === 'keywords') {
      const system = `You are a senior paid-search strategist doing keyword research for Google Ads. ${GUARDRAILS}
Group keywords into tight, intent-matched ad-group themes. Suggest a sensible match type per group (phrase/exact for high intent; avoid broad unless smart bidding). Include local long-tail queries (Box Hill / south-east Melbourne), negative-keyword ideas to exclude irrelevant traffic, and angles competitors likely bid on. Do NOT invent search-volume numbers. Return JSON matching the schema.`
      const user = `Research Google Ads keywords for this space.
${ctx}`
      const message = await client.messages.create({
        model: MODEL, max_tokens: 3000, system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: KEYWORDS_SCHEMA } },
      })
      if (message.stop_reason === 'refusal') return res.status(422).json({ error: 'Request declined.' })
      const raw = (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
      let keywords
      try { keywords = JSON.parse(raw) } catch { return res.status(502).json({ error: 'Could not parse keywords output' }) }
      return res.status(200).json({ keywords })
    }

    // action === 'campaign' — structured JSON
    const system = `You are a senior paid-media strategist building a launch-ready campaign. ${GUARDRAILS}
Return a complete campaign as JSON matching the schema. For Google, populate keywords per ad group; for Meta, leave keywords empty and rely on audiences. Provide at least 3 distinct ad variations per ad group.`
    const user = `Build a ${platformLabel} campaign.
${ctx}
${research ? `\nUse this research:\n${research}` : ''}`

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema: CAMPAIGN_SCHEMA } },
    })
    if (message.stop_reason === 'refusal') return res.status(422).json({ error: 'Request declined.' })
    const raw = (message.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    let campaign
    try { campaign = JSON.parse(raw) } catch { return res.status(502).json({ error: 'Could not parse campaign output' }) }
    return res.status(200).json({ campaign })
  } catch (err) {
    console.error('ads-generate error:', err)
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500
    return res.status(status).json({ error: err?.message ?? 'Generation failed' })
  }
}
