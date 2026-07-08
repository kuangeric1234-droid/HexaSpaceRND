import { useNavigate } from 'react-router-dom'
import { Printer, CalendarClock, Receipt, Wifi, KeyRound, Coffee, ArrowRight } from 'lucide-react'
import { useApp } from '../context.js'
import { Screen, BackHeader, Label, Card } from '../ui.jsx'

// How-to guides — the portal's guide content, phone-sized.
const GUIDES = [
  { icon: CalendarClock, title: 'Book a meeting room', body: 'Pick a slot under Book — our team confirms availability, usually within the hour.' },
  { icon: Receipt, title: 'Invoices & billing', body: 'Every invoice lives under More → Billing. Pay in the app with your saved card.' },
  { icon: KeyRound, title: '24/7 access', body: 'Your access pass works around the clock. Lost it? Message us and reception will reissue one.' },
  { icon: Coffee, title: 'Lounge & amenities', body: 'Barista-style coffee, filtered water and end-of-trip facilities are included with every membership.' },
]

export default function Guides() {
  const nav = useNavigate()
  const { data } = useApp()
  const wifi = data?.settings?.wifi ?? {}
  return (
    <Screen>
      <BackHeader title="Guides" fallback="/more" />
      <p className="font-display font-extralight text-[28px] leading-tight text-ink mt-2 mb-8">
        Get the most<br />from your space.
      </p>

      <div className="space-y-px bg-ink/10">
        {/* Wi-Fi with the live credentials from settings */}
        <Card className="p-5 flex gap-4">
          <Wifi size={17} strokeWidth={1.4} className="text-hexa-green shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-heading uppercase tracking-nav text-[11px] text-ink">Wi-Fi</h3>
            <p className="hx-prose text-[13px] mt-1.5">
              Network <span className="text-ink font-medium">{wifi.ssid || 'Hexa Spaces'}</span>
              {wifi.password ? <> · password <span className="font-mono text-ink text-[12px] break-all">{wifi.password}</span></> : ' — password at reception.'}
            </p>
          </div>
        </Card>
        {GUIDES.map((g, i) => (
          <Card key={i} className="p-5 flex gap-4">
            <g.icon size={17} strokeWidth={1.4} className="text-hexa-green shrink-0 mt-0.5" />
            <div>
              <h3 className="font-heading uppercase tracking-nav text-[11px] text-ink">{g.title}</h3>
              <p className="hx-prose text-[13px] mt-1.5">{g.body}</p>
            </div>
          </Card>
        ))}
      </div>

      <Label className="mt-9 mb-3">Printing</Label>
      <Card onClick={() => nav('/printer')} className="p-5 flex items-center gap-4">
        <span className="h-11 w-11 shrink-0 bg-charcoal text-paper flex items-center justify-center">
          <Printer size={16} strokeWidth={1.4} />
        </span>
        <span className="flex-1 text-left">
          <span className="block font-heading uppercase tracking-nav text-[11px] text-ink">PaperCut setup</span>
          <span className="block hx-prose text-[12px] mt-0.5">Your print account & step-by-step guide</span>
        </span>
        <ArrowRight size={14} className="text-ink shrink-0" />
      </Card>

      <p className="hx-prose text-[12px] mt-8">
        Anything else? Message the team from More → Messages — we're at reception 9am–5pm weekdays.
      </p>
    </Screen>
  )
}
