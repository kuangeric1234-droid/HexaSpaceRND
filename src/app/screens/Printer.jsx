import { Printer as PrinterIcon, Download, ExternalLink } from 'lucide-react'
import { useApp } from '../context.js'
import { usePrintPin } from '../lib/usePrintPin.js'
import { platform, apiUrl, IOS_PRINT_PROFILE, ANDROID_PRINT_APP } from '../lib/native.js'
import { Screen, BackHeader, Label, Card } from '../ui.jsx'

// Printer setup — mirrors the portal guide (PaperCut) plus the member's own
// print account details, phone-sized.
export default function Printer() {
  const { data } = useApp()
  const email = data.member?.email || data.company?.email || ''
  const pin = usePrintPin()

  return (
    <Screen>
      <BackHeader title="Printing" />
      <div className="bg-charcoal text-paper p-6 mt-2">
        <div className="flex items-center justify-between">
          <Label className="text-paper/50">Your print account</Label>
          <PrinterIcon size={16} strokeWidth={1.4} className="text-paper/40" />
        </div>
        <p className="font-display font-extralight text-2xl mt-4">PaperCut · Hexa-Secure</p>

        {/* Print PIN — prominent, since members type it at the copier keypad */}
        {pin && (
          <div className="mt-5 border border-paper/20 bg-paper/5 px-4 py-3.5 flex items-end justify-between">
            <div>
              <span className="block font-heading uppercase tracking-label text-[10px] text-paper/50">Your print PIN</span>
              <span className="block hx-prose text-[11px] text-paper/40 mt-1">Type at the keypad, or tap your pass</span>
            </div>
            <span className="font-mono text-3xl tracking-[0.3em] text-hexa-green leading-none">{pin}</span>
          </div>
        )}

        <div className="border-t border-paper/15 my-4" />
        <div className="space-y-2">
          <KV k="Sign-in" v={email || 'your member email'} />
          <KV k="Portal" v="print.hexaspace.com.au" />
          <KV k="Queue" v="Hexa-Secure" />
          <KV k="Release" v="Tap your access pass at any printer" />
        </div>
      </div>

      <Label className="mt-9 mb-3">Print from this phone</Label>
      <PhoneSetup />

      <Label className="mt-9 mb-3">On a laptop?</Label>
      <Card className="p-5">
        <p className="hx-prose text-[13px] text-ink">
          Open the member portal → <span className="font-heading uppercase tracking-nav text-[11px]">Guides → Printer Setup</span> for the Windows and Mac installers.
        </p>
      </Card>

      <Label className="mt-9 mb-3">Level 2 (Canon) printers</Label>
      <Card className="p-5">
        <p className="hx-prose text-[13px] text-ink">
          Level 2 uses uniFlow, with its own PIN. Register at{' '}
          <a href="https://hexa-space.au.uniflowonline.com/public/signup/user/PAXZ272ONN5S" target="_blank" rel="noreferrer" className="text-hexa-green break-all">the uniFlow sign-up page</a>{' '}
          (or scan the QR at the printer) and your PIN is emailed to you. Full steps are in the portal guides.
        </p>
      </Card>

      <p className="hx-prose text-[12px] mt-6">
        Trouble printing? Message the team from the More tab and we'll sort it out.
      </p>
    </Screen>
  )
}

// Platform-aware phone setup: iOS installs the AirPrint profile, Android gets the
// Mobility Print app (pre-pointed at the server). On desktop web we show both.
function PhoneSetup() {
  const plat = platform()

  if (plat === 'ios') {
    return (
      <>
        <PrintBtn href={apiUrl(IOS_PRINT_PROFILE)} icon={Download} label="Add iPhone / iPad printer" />
        <Steps title="iPhone & iPad" items={[
          'Tap the button above and install the printer profile (Settings will ask you to confirm).',
          'On the “Hexa Space” Wi-Fi, open your document → Share → Print → “Hexa-Secure”.',
          'First time only: enter your Hexa Space email and password.',
          'Release at any printer with your PIN above, or tap your pass.',
        ]} />
      </>
    )
  }
  if (plat === 'android') {
    return (
      <>
        <PrintBtn href={ANDROID_PRINT_APP} icon={ExternalLink} label="Get the printing app" external />
        <Steps title="Android" items={[
          'Tap the button above to install “Mobility Print” (already set to our server).',
          'On the “Hexa Space” Wi-Fi, print as usual and pick the “Hexa-Secure” printer.',
          'Enter your Hexa Space email and password when prompted.',
          'Release at any printer with your PIN above, or tap your pass.',
        ]} />
      </>
    )
  }
  // Desktop web — show both options.
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-5">
        <PrintBtn href={apiUrl(IOS_PRINT_PROFILE)} icon={Download} label="iPhone / iPad profile" inline />
        <PrintBtn href={ANDROID_PRINT_APP} icon={ExternalLink} label="Android app" external inline />
      </div>
      <Steps title="iPhone & iPad" items={[
        'Install the iPhone/iPad profile above.',
        'On the “Hexa Space” Wi-Fi, print → choose “Hexa-Secure”.',
        'First time only: enter your Hexa Space email and password.',
        'Release with your PIN above, or tap your pass.',
      ]} />
      <Steps title="Android" items={[
        'Install the Android app above (already set to our server).',
        'Print as usual and pick “Hexa-Secure”.',
        'Enter your Hexa Space email and password when prompted.',
        'Release with your PIN above, or tap your pass.',
      ]} />
    </>
  )
}

function PrintBtn({ href, icon: Icon, label, external, inline }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={`${inline ? 'inline-flex' : 'flex w-full'} items-center justify-center gap-2 bg-charcoal text-paper px-5 py-3.5 mb-4 font-heading uppercase tracking-nav text-[11px] active:opacity-80`}
    >
      <Icon size={15} strokeWidth={1.6} /> {label}
    </a>
  )
}

function Steps({ title, items }) {
  return (
    <div className="mb-5">
      <p className="hx-eyebrow mb-2">{title}</p>
      <div className="space-y-px bg-ink/10">
        {items.map((step, i) => (
          <Card key={i} className="p-4 flex gap-3">
            <span className="font-heading text-hexa-green text-[12px] tracking-label mt-0.5 shrink-0">0{i + 1}</span>
            <span className="hx-prose text-[13px] text-ink">{step}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}

function KV({ k, v }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="hx-prose text-[12px] text-paper/50">{k}</span>
      <span className="font-body text-[13px] text-paper text-right break-all">{v}</span>
    </div>
  )
}
