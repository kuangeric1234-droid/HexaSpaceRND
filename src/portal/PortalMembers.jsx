import { useState, useMemo } from 'react'
import { Search, Mail, Building2 } from 'lucide-react'
import { Page, PageHeader, Card, SubTabs, Monogram, Empty } from './ui.jsx'

export default function PortalMembers({ members, companies }) {
  const [tab, setTab] = useState('members')
  const [q, setQ] = useState('')

  const visibleMembers = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...members]
      .filter(m => m.status !== 'archived')
      .filter(m => !term || `${m.name} ${m.email}`.toLowerCase().includes(term))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members, q])

  const visibleCompanies = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...companies]
      .filter(c => !term || `${c.businessName} ${c.industry || ''}`.toLowerCase().includes(term))
      .sort((a, b) => (a.businessName || '').localeCompare(b.businessName || ''))
  }, [companies, q])

  const nameFor = (id) => companies.find(c => c.id === id)?.businessName

  return (
    <Page>
      <PageHeader kicker="Community" title="Members">
        The people and companies who call Hexa Space home.
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <SubTabs
          tabs={[
            { key: 'members', label: `Members · ${visibleMembers.length}` },
            { key: 'companies', label: `Companies · ${visibleCompanies.length}` },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="hx-input pl-9 w-64"
          />
        </div>
      </div>

      {tab === 'members' ? (
        visibleMembers.length === 0 ? <Empty label="No members found." /> : (
          <div className="grid gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleMembers.map(m => (
              <Card key={m.id} className="p-6 flex gap-4 hover:bg-bone transition-colors">
                <Monogram name={m.name} className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <div className="font-heading uppercase tracking-nav text-[12px] text-ink truncate">{m.name}</div>
                  {nameFor(m.companyId) && (
                    <div className="hx-prose text-[13px] truncate">{nameFor(m.companyId)}</div>
                  )}
                  {m.bio && <p className="hx-prose text-[13px] mt-2 line-clamp-2">{m.bio}</p>}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 mt-3 text-hexa-green hover:text-ink transition-colors">
                      <Mail size={13} />
                      <span className="font-heading uppercase tracking-nav text-[10px]">Contact</span>
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        visibleCompanies.length === 0 ? <Empty label="No companies found." /> : (
          <div className="grid gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCompanies.map(c => (
              <Card key={c.id} className="p-6 flex gap-4 hover:bg-bone transition-colors">
                <Monogram name={c.businessName} className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <div className="font-heading uppercase tracking-nav text-[12px] text-ink truncate">{c.businessName}</div>
                  {c.industry && (
                    <div className="inline-flex items-center gap-1.5 hx-prose text-[13px] mt-1">
                      <Building2 size={12} /> {c.industry}
                    </div>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 mt-3 text-hexa-green hover:text-ink transition-colors">
                      <Mail size={13} />
                      <span className="font-heading uppercase tracking-nav text-[10px]">Contact</span>
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </Page>
  )
}
