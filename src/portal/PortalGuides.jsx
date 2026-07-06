import { Printer, CalendarClock, Receipt, Wifi, KeyRound, Coffee, Laptop, Smartphone, Download } from 'lucide-react'
import { usePrintPin } from './usePrintPin.js'
import { Page, PageHeader, Card, Eyebrow } from './ui.jsx'

const GUIDES = [
  { icon: CalendarClock, title: 'Book a meeting room', body: 'Browse rooms under Meeting Rooms, request your time, and our team confirms availability — usually within the hour.' },
  { icon: Receipt, title: 'View & download invoices', body: 'Every invoice lives under Billing → Invoices. Download a PDF any time, and check your next bill under Membership.' },
  { icon: KeyRound, title: '24/7 access', body: 'Your access pass works around the clock. Lost your pass? Submit a ticket and reception will reissue one.' },
  { icon: Wifi, title: 'Wi-Fi & printing', body: 'Connect to “Hexa Space” with the password at reception. Set up printing on any device below.' },
  { icon: Coffee, title: 'Lounge & amenities', body: 'Barista-style coffee, filtered water and end-of-trip facilities are included with every membership.' },
]

export default function PortalGuides() {
  return (
    <Page>
      <PageHeader kicker="Help · Box Hill" title="How-To Guides">
        Everything you need to get the most from Hexa Space. 402/830 Whitehorse Road, Box Hill VIC 3128.
      </PageHeader>

      <div className="grid gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        {GUIDES.map((g, i) => (
          <Card key={i} className="p-7">
            <g.icon size={20} strokeWidth={1.4} className="text-hexa-green" />
            <h3 className="font-heading uppercase tracking-nav text-[12px] mt-5">{g.title}</h3>
            <p className="hx-prose text-[14px] mt-2">{g.body}</p>
          </Card>
        ))}
      </div>

      <Eyebrow className="mb-4">Printer Setup</Eyebrow>
      <PrintPin />

      <div className="grid gap-px bg-ink/10 mt-4">
        {/* Laptop / desktop */}
        <MethodCard icon={Laptop} title="Print from your laptop" subtitle="Windows & Mac · “Hexa-Secure” printers">
          <div className="flex flex-wrap gap-3 mb-5">
            <a href="/downloads/hexa-printer-windows.exe" download className="hx-btn inline-flex items-center gap-2"><Download size={13} /> Windows installer</a>
            <a href="/downloads/hexa-printer-mac.dmg" download className="hx-btn-ghost inline-flex items-center gap-2"><Download size={13} /> Mac installer</a>
          </div>
          <Steps items={[
            'Connect to the “Hexa Space” Wi-Fi network.',
            'Download and run the installer above, then follow the prompts.',
            'The “Hexa-Secure” printer is added automatically — print to it like any other printer.',
            'The first time you print, sign in with your Hexa Space email and password (just once).',
            'Release your job at any printer: tap your access pass, or type your print PIN on the keypad.',
          ]} />
        </MethodCard>

        {/* Phone / tablet */}
        <MethodCard icon={Smartphone} title="Print from your phone or tablet" subtitle="iPhone, iPad & Android · “Hexa-Secure” printers">
          <p className="hx-eyebrow mb-2">iPhone &amp; iPad</p>
          <Steps items={[
            'Connect to the “Hexa Space” Wi-Fi.',
            'Open your document → Share → Print, then choose the “Hexa-Secure” printer.',
            'First time only: enter your Hexa Space email and password.',
            'Release at any printer with your access pass or PIN.',
          ]} />
          <p className="hx-eyebrow mb-2 mt-6">Android</p>
          <Steps items={[
            'Install “Mobility Print” from Google Play, then connect to the “Hexa Space” Wi-Fi.',
            'Print as usual and pick the “Hexa-Secure” printer.',
            'Tap the sign-in prompt and enter your Hexa Space email and password.',
            'Release at any printer with your access pass or PIN.',
          ]} />
        </MethodCard>

        {/* Level 2 — uniFlow */}
        <MethodCard icon={Printer} title="Level 2 printers (Canon / uniFlow)" subtitle="A separate system with its own PIN, emailed to you">
          <p className="hx-prose text-[13px] mb-5">The Level 2 Canon printers use uniFlow Online, which issues you a separate printing PIN by email.</p>
          <p className="hx-eyebrow mb-2">1 · Register your account</p>
          <Steps items={[
            <>Visit the <a className="text-hexa-green break-words" href="https://hexa-space.au.uniflowonline.com/public/signup/user/PAXZ272ONN5S" target="_blank" rel="noreferrer">uniFlow sign-up page</a> (or scan the QR code at the printer).</>,
            'Enter your name and email, accept the Terms & Conditions, and click Continue.',
            'Enter the authorisation code emailed to you, then click Login.',
            'You’ll be emailed your personal uniFlow printing PIN.',
          ]} />
          <p className="hx-eyebrow mb-2 mt-6">2 · Install the driver</p>
          <Steps items={[
            'In the uniFlow portal, open the Start Printing tab and click Download driver (Mac or Windows).',
            'Run the installer, then open “uniFlow SmartClient”, enter your email, and click Continue → Start.',
            'A Secure Print Queue is added — print to it, then release at the Level 2 printer with your uniFlow PIN.',
          ]} />
        </MethodCard>
      </div>

      <p className="hx-prose text-[13px] mt-6">
        Trouble printing? Submit a ticket under Account → Tickets and our team will help.
      </p>
    </Page>
  )
}

function MethodCard({ icon: Icon, title, subtitle, children }) {
  return (
    <Card className="p-8 grid md:grid-cols-[auto_1fr] gap-7 items-start">
      <div className="bg-charcoal text-paper h-14 w-14 flex items-center justify-center shrink-0">
        <Icon size={22} strokeWidth={1.3} />
      </div>
      <div className="min-w-0">
        <h3 className="hx-display text-xl">{title}</h3>
        {subtitle && <p className="hx-eyebrow mt-1">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </Card>
  )
}

function Steps({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((step, i) => (
        <li key={i} className="flex gap-4">
          <span className="font-heading text-hexa-green text-[12px] tracking-label mt-0.5 shrink-0">0{i + 1}</span>
          <span className="hx-prose text-[14px]">{step}</span>
        </li>
      ))}
    </ol>
  )
}

// Shows the signed-in member's OWN print PIN (their PaperCut Hexa-Secure number).
// Fetched from the JWT-verified, owner-scoped endpoint — never from the bulk member
// data. Renders nothing until/unless a PIN comes back. (uniFlow issues a separate PIN.)
function PrintPin() {
  const pin = usePrintPin()
  if (!pin) return null
  return (
    <div className="bg-charcoal text-paper px-6 py-5 flex items-center justify-between gap-4">
      <div>
        <span className="block font-heading uppercase tracking-label text-[11px] text-paper/50">Your print PIN · Hexa-Secure</span>
        <span className="block hx-prose text-[12px] text-paper/50 mt-1">Type this at the printer keypad to release your jobs, or tap your access pass.</span>
      </div>
      <span className="font-mono text-3xl tracking-[0.25em] text-paper shrink-0">{pin}</span>
    </div>
  )
}
