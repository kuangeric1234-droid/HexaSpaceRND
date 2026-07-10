// CORS for endpoints the native member app calls. The Capacitor shell serves
// bundled assets from https://localhost, so its fetches to
// portal.hexaspace.com.au are cross-origin. These endpoints were already
// callable from anywhere server-to-server; CORS only lifts the browser block.
// Returns true when the request was an OPTIONS preflight (already answered).
export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}
