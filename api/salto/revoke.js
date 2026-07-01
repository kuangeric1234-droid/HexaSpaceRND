// POST /api/salto/revoke
// Revokes a member's Salto access (on lease termination/expiry or when a client
// removes a member from their portal team).
//
// SCAFFOLD: mock-succeeds when Salto is not configured. Swap the marked block for
// real Salto Space (or KS) API calls once you have credentials.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { memberEmail, saltoUserId, doorId } = req.body ?? {}
  if (!memberEmail && !saltoUserId) {
    return res.status(400).json({ error: 'memberEmail or saltoUserId is required.' })
  }

  const apiKey = process.env.SALTO_API_KEY
  const baseUrl = process.env.SALTO_BASE_URL

  if (!apiKey || !baseUrl) {
    return res.status(200).json({ mock: true, revoked: true, saltoUserId: saltoUserId ?? null, door: doorId ?? null })
  }

  try {
    // Revoke the credential / remove the access grant, e.g.:
    // await fetch(`${baseUrl}/access/${saltoUserId}/${doorId}`, {
    //   method: 'DELETE',
    //   headers: { Authorization: `Bearer ${apiKey}` },
    // })
    return res.status(501).json({ error: 'Salto live mode not implemented yet. Fill in api/salto/revoke.js.' })
  } catch (err) {
    console.error('Salto revoke error:', err)
    return res.status(500).json({ error: 'Salto revoke failed' })
  }
}
