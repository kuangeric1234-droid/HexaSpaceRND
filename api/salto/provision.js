// POST /api/salto/provision
// Provisions a Salto Space mobile key / access credential for a member on a
// specific door, scoped to the lease dates. Returns { accessLink, saltoUserId }.
//
// SCAFFOLD: when SALTO_API_KEY / SALTO_BASE_URL are not configured this returns a
// deterministic MOCK so the onboarding flow works end-to-end in dev and staging.
// Swap the marked block for real Salto Space (or KS) API calls once you have
// credentials and the door/site IDs.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { memberEmail, memberName, doorId, spaceLabel, accessFrom, accessUntil } = req.body ?? {}
  if (!memberEmail) return res.status(400).json({ error: 'memberEmail is required.' })

  const apiKey = process.env.SALTO_API_KEY
  const baseUrl = process.env.SALTO_BASE_URL // e.g. https://clp-acc*.saltoks.com or Salto Space API host

  // ── MOCK MODE ──────────────────────────────────────────────────────────────
  // No creds yet → return a mock so onboarding email/flow still works.
  if (!apiKey || !baseUrl) {
    const saltoUserId = `salto_mock_${Buffer.from(memberEmail).toString('hex').slice(0, 10)}`
    return res.status(200).json({
      mock: true,
      saltoUserId,
      accessLink: `https://my.saltoks.com/activate/${saltoUserId}`,
      door: doorId ?? null,
      spaceLabel: spaceLabel ?? null,
      accessFrom: accessFrom ?? null,
      accessUntil: accessUntil ?? null,
      note: 'Salto not configured — mock credential returned. Set SALTO_API_KEY and SALTO_BASE_URL to go live.',
    })
  }

  if (!doorId) return res.status(400).json({ error: 'doorId is required (map the space to a Salto door).' })

  // ── LIVE MODE (implement against your Salto tenant) ─────────────────────────
  try {
    // 1. Create/lookup the Salto user for memberEmail.
    // 2. Grant access to `doorId` (or its access group), scoped to accessFrom..accessUntil.
    // 3. Trigger the mobile-key invitation and capture its activation link.
    //
    // const userRes = await fetch(`${baseUrl}/users`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email: memberEmail, name: memberName }),
    // })
    // const user = await userRes.json()
    // await fetch(`${baseUrl}/access`, { ... grant doorId to user.id, from/until ... })
    // const invite = await fetch(`${baseUrl}/mobile-keys`, { ... }).then(r => r.json())
    // return res.status(200).json({ saltoUserId: user.id, accessLink: invite.activationUrl })

    return res.status(501).json({
      error: 'Salto live mode not implemented yet. Fill in the API calls in api/salto/provision.js.',
    })
  } catch (err) {
    console.error('Salto provision error:', err)
    return res.status(500).json({ error: 'Salto provisioning failed' })
  }
}
