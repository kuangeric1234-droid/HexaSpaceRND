import { Printer, CalendarClock, Receipt, Wifi, KeyRound, Coffee } from 'lucide-react'
import { Page, PageHeader, Card, Eyebrow } from './ui.jsx'

const GUIDES = [
  { icon: CalendarClock, title: 'Book a meeting room', body: 'Browse rooms under Meeting Rooms, request your time, and our team confirms availability — usually within the hour.' },
  { icon: Receipt, title: 'View & download invoices', body: 'Every invoice lives under Billing → Invoices. Download a PDF any time, and check your next bill under Membership.' },
  { icon: KeyRound, title: '24/7 access', body: 'Your access pass works around the clock. Lost your pass? Submit a ticket and reception will reissue one.' },
  { icon: Wifi, title: 'Wi-Fi & printing', body: 'Connect to “Hexa Space” with the password at reception. Printing is handled through PaperCut — see Printer Setup below.' },
  { icon: Coffee, title: 'Lounge & amenities', body: 'Barista-style coffee, filtered water and end-of-trip facilities are included with every membership.' },
]

export default function PortalGuides() {
  return (
    <Page>
      <PageHeader kicker="Help · Box Hill" title="How-To Guides">
        Everything you need to get the most from Hexa Space. Level 4, 830 Whitehorse Road, Box Hill.
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
      <Card className="p-8 grid md:grid-cols-[auto_1fr] gap-7 items-start">
        <div className="bg-charcoal text-paper h-16 w-16 flex items-center justify-center">
          <Printer size={26} strokeWidth={1.3} />
        </div>
        <div>
          <h3 className="hx-display text-2xl">PaperCut printing</h3>
          <ol className="mt-5 space-y-3">
            {[
              'Connect to the “Hexa Space” Wi-Fi network.',
              'Visit print.hexaspace.com.au and sign in with your member email.',
              'Install the PaperCut client for your device when prompted.',
              'Send your document to the “Hexa-Secure” queue, then tap your access pass at any printer to release it.',
            ].map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-heading text-hexa-green text-[12px] tracking-label mt-0.5">0{i + 1}</span>
                <span className="hx-prose text-[14px]">{step}</span>
              </li>
            ))}
          </ol>
          <p className="hx-prose text-[13px] mt-6 border-t border-ink/10 pt-4">
            Trouble printing? Submit a ticket under Account → Tickets and our team will help.
          </p>
        </div>
      </Card>
    </Page>
  )
}
