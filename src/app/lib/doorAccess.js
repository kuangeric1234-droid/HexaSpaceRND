import { platform } from './native.js'

// Door access — Salto KS. Our locks open over Bluetooth via Salto's own app, and
// the Zapier connector can't do a BLE unlock, so the app doesn't try to be the
// key: the Door Access tile opens the Salto KS app (or its store listing) where
// the member's mobile key lives. Provisioning still happens server-side
// (api/salto/*). Override per-platform via settings.doorAccess.iosUrl/androidUrl.
const SALTO_APP = {
  ios: 'https://apps.apple.com/us/app/salto-ks/id620313998',
  android: 'https://play.google.com/store/apps/details?id=nl.moboa.myclay&hl=en_AU',
}

export function saltoWebUrl(settings) {
  const cfg = settings?.doorAccess ?? {}
  // Android → Play listing; iOS and web preview → the App Store listing.
  return platform() === 'android'
    ? (cfg.androidUrl || SALTO_APP.android)
    : (cfg.iosUrl || SALTO_APP.ios)
}

const floorLabel = (f) => (f ? `Level ${String(f).replace(/^l/i, '')}` : '')

// Whether the member's door access is provisioned yet — drives the tile's chip.
// 'active' (key issued), 'pending' (lease active, still being set up), 'none'.
export function accessSummary(data) {
  const active = (data?.leases ?? []).find((l) => l.status === 'active')
  const space = (data?.spaces ?? []).find((s) => s.id === active?.spaceId)
  const provisioned = !!(data?.member?.saltoAccess || active?.saltoProvisionedAt || active?.onboardedAt)

  const areas = ['Main entrance', 'Lift']
  if (space?.unitNumber) {
    areas.unshift([space.unitNumber, floorLabel(space.floor)].filter(Boolean).join(', '))
  }

  return {
    status: active ? (provisioned ? 'active' : 'pending') : 'none',
    areas,
    email: data?.member?.email || data?.company?.email || '',
  }
}
