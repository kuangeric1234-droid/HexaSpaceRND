// Vercel serverless function — POST /api/marketing-generate
// Claude-powered marketing copy generator (social posts, ad copy, SEO).
// Requires env var: ANTHROPIC_API_KEY.
//
// Body: {
//   kind: 'post' | 'ad' | 'seo',
//   platform?: string,      // e.g. 'instagram' | 'linkedin' | 'facebook' | 'google' | 'meta'
//   tone?: string,          // e.g. 'professional' | 'friendly' | 'bold'
//   count?: number,         // how many variations
//   space?: object,         // a Hexa Space space (unit) the copy is about
//   company?: object,       // brand info from settings.company
//   notes?: string,         // freeform extra direction
// }

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-4-8'

function brandBlock(company = {}) {
  const name = company.name || 'Hexa Space'
  const website = company.website || 'hexaspace.com.au'
  return `Brand: ${name} (${website}) — an industrial business hub in Box Hill, Melbourne, Australia.
Tagline: "build locally, scale sustainably". We lease warehouse units, storage, offices and pop-up/retail bays to growing businesses.
Voice: clean, professional, grounded, Australian. No hype, no emoji spam, no exclamation overload.`
}

function unitBlock(space) {
  if (!space) return 'No specific unit — write for the brand / general leasing enquiries.'
  const parts = [
    `Unit ${space.unitNumber}`,
    space.type,
    space.size,
    space.address,
    space.monthlyRate ? `$${space.monthlyRate.toLocaleString('en-AU')}/month` : null,
    space.cars ? `${space.cars} car spaces` : null,
    space.attributes,
  ].filter(Boolean)
  return `Unit details: ${parts.join(' · ')}.`
}

function buildPrompts({ kind, platform, tone, count, space, company, notes }) {
  const brand = brandBlock(company)
  const unit = unitBlock(space)
  const toneLine = tone ? `Tone: ${tone}.` : ''
  const extra = notes ? `Extra direction: ${notes}` : ''
  const n = Math.min(Math.max(Number(count) || 3, 1), 6)

  const system = `You are a senior marketing copywriter for a commercial property brand.
${brand}
Write copy that is specific (use the real unit facts), benefit-led, and locally relevant.
Output ONLY the requested copy — no preamble, no explanations, no notes about your reasoning.`

  if (kind === 'post') {
    return {
      system,
      user: `Write ${n} ${platform || 'social media'} post options to promote this space and attract a tenant.
${unit}
${toneLine}
For each option: a scroll-stopping hook, 2–3 short lines of body highlighting the best features and who it suits, a clear call to action (enquire / book a tour), and 4–6 relevant hashtags.
Number each option. ${extra}`.trim(),
    }
  }

  if (kind === 'ad') {
    return {
      system,
      user: `Write ${n} ${platform || 'Google/Meta'} ad variations to drive leasing enquiries for this space.
${unit}
${toneLine}
For each: a headline (max ~30 chars), a longer headline (~90 chars), a primary text / description (~90 words), and a call-to-action button label.
Lead with the strongest benefit. Number each variation. ${extra}`.trim(),
    }
  }

  // seo
  return {
    system,
    user: `Produce SEO assets for the listing page for this space, optimised for local search (e.g. "warehouse for lease Box Hill").
${unit}
${toneLine}
Provide: 1) an SEO page title (~60 chars), 2) a meta description (~155 chars), 3) 8–12 target keywords (mix of head and long-tail, local), 4) 3 H2 heading suggestions, 5) a 60–90 word optimised intro paragraph.
Label each section. ${extra}`.trim(),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { kind = 'post' } = req.body ?? {}
  if (!['post', 'ad', 'seo'].includes(kind)) return res.status(400).json({ error: 'Invalid kind' })

  try {
    const client = new Anthropic({ apiKey })
    const { system, user } = buildPrompts(req.body ?? {})

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    })

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The request was declined. Try rephrasing.' })
    }

    const text = (message.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return res.status(200).json({ text })
  } catch (err) {
    console.error('marketing-generate error:', err)
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500
    return res.status(status).json({ error: err?.message ?? 'Generation failed' })
  }
}
