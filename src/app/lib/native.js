import { Capacitor } from '@capacitor/core'

// Native (Capacitor) glue for the member app. On the web all of this is a
// no-op passthrough, so the same code serves portal.hexaspace.com.au/app and
// the store builds.

export const isNative = () => Capacitor.isNativePlatform()

// 'ios' | 'android' | 'web'. On the web build Capacitor reports 'web', so fall
// back to a userAgent sniff to still tailor the phone print instructions.
export function platform() {
  const p = Capacitor.getPlatform()
  if (p !== 'web') return p
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'web'
}

// Store / profile links for Mobility Print, per platform.
export const ANDROID_PRINT_APP = 'https://play.google.com/store/apps/details?id=com.papercut.projectbanksia&referrer=server=172.16.200.14'
export const IOS_PRINT_PROFILE = '/downloads/hexa-printer-ios.mobileconfig'
export const WINDOWS_PRINT_INSTALLER = '/downloads/hexa-printer-windows.exe'
export const MAC_PRINT_INSTALLER = '/downloads/hexa-printer-mac.dmg'

// The native shell serves bundled assets from https://localhost, so API calls
// must be absolute. On the web, relative paths keep working as before.
export const API_BASE = 'https://portal.hexaspace.com.au'
export const apiUrl = (path) => (isNative() ? `${API_BASE}${path}` : path)

/**
 * Follow a payment URL (Stripe Checkout / card setup). Native: opens a Chrome
 * Custom Tab so the bundled app isn't navigated away; the user returns to the
 * app and a resume refresh picks up the result (webhook writes it server-side).
 * Web: same-tab redirect, exactly as before.
 */
export async function openPayment(url) {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.location.href = url
  }
}

/** Run cb when the app returns to the foreground. Returns an unsubscribe. */
export function onAppResume(cb) {
  if (isNative()) {
    let handle = null
    import('@capacitor/app').then(({ App }) =>
      App.addListener('resume', cb).then((h) => { handle = h })
    ).catch(() => {})
    return () => handle?.remove()
  }
  const fn = () => { if (document.visibilityState === 'visible') cb() }
  document.addEventListener('visibilitychange', fn)
  return () => document.removeEventListener('visibilitychange', fn)
}

/** Native chrome: status bar to match the bone ground. */
export async function applyNativeChrome() {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Light }) // light bg, dark icons
    await StatusBar.setBackgroundColor({ color: '#F6F5F1' })
  } catch { /* plugin unavailable (web/dev) */ }
}
