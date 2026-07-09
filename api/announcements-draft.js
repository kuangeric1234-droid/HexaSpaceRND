// POST /api/announcements-draft — AI drafting for member announcements.
// Admin gives a rough brief ("carpet cleaning this Sunday 9-1, level 4,
// apologise for noise") and Claude returns { subject, content } in the Hexa
// Space voice, ready to drop into the composer (still editable before send).
// Requires ANTHROPIC_API_KEY in the environment; returns 503 until it's set.
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from './_auth.js'

export const config = { maxDuration: 60 }

const SYSTEM = `You write member announcements for Hexa Space, a coworking and
business infrastructure space at Level 4, 402/830 Whitehorse Road, Box Hill,
Melbourne (slogan: "build locally, scale sustainably"). Members are small
businesses and professionals — lawyers, accountants, migration agents,
creatives.

Voice: warm, professional, concise, Australian English. Community-minded but
never gushing; practical details front and centre (dates, times, levels, what
members need to do). Sign-offs like "— The Hexa Space Team" are welcome.

Output rules: the content is PLAIN TEXT that will be typeset into a branded
email template (serif headline from the subject, then paragraphs). Use blank
lines between paragraphs. No markdown, no HTML, no bullets with asterisks —
if a list is needed, use short one-line paragraphs or hyphens. Keep the
subject under 80 characters. Keep the whole message under ~180 words unless
the brief clearly needs more.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI drafting is not configured yet — add ANTHROPIC_API_KEY in Vercel.' })
  }

  const { brief } = req.body ?? {}
  if (!brief?.trim()) return res.status(400).json({ error: 'Tell me what the announcement is about.' })

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system: SYSTEM,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: 'Email subject line, under 80 characters' },
              content: { type: 'string', description: 'Plain-text announcement body, blank lines between paragraphs' },
            },
            required: ['subject', 'content'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: `Draft a member announcement. Brief from the admin:\n\n${brief.trim()}` }],
    })

    if (response.stop_reason === 'refusal') {
      return res.status(400).json({ error: 'The assistant declined to draft that — try rephrasing the brief.' })
    }
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const draft = JSON.parse(text)
    return res.status(200).json({ subject: draft.subject ?? '', content: draft.content ?? '' })
  } catch (err) {
    console.error('announcements-draft error:', err)
    return res.status(500).json({ error: 'Could not draft the announcement — try again.' })
  }
}
