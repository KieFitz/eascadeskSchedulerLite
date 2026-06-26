import Layout from '../components/layout/Layout'
import { useTranslations } from '../i18n'

const Section = ({ id, title, children }) => (
  <div id={id} className="bg-white rounded-xl shadow-soft p-6 space-y-3 scroll-mt-6" data-guide-section={id}>
    <h2 className="text-lg font-semibold text-dark border-b border-gray-100 pb-2">{title}</h2>
    {children}
  </div>
)

const Step = ({ number, title, body }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-purple text-white flex items-center justify-center text-sm font-bold">
      {number}
    </div>
    <div>
      <p className="font-medium text-dark">{title}</p>
      <p className="text-sm text-muted mt-0.5" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  </div>
)

const Tip = ({ label, children }) => (
  <div className="bg-brand-lavender/30 border border-brand-lavender rounded-lg px-4 py-3 text-sm text-dark">
    <span className="font-semibold text-brand-purple">{label} </span>
    <span dangerouslySetInnerHTML={{ __html: children }} />
  </div>
)

const Note = ({ label, children }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-dark">
    <span className="font-semibold text-amber-700">{label} </span>
    <span dangerouslySetInnerHTML={{ __html: children }} />
  </div>
)

export default function Guide() {
  const { t } = useTranslations()
  const sections = t('guideSections')
  const quickRef = t('guideQuickRef')

  return (
    <Layout title={t('guideTitle')}>
      {/*
        data-guide="eascadesk-scheduler"
        This attribute marks this page as the canonical user guide for the Eascadesk Scheduler
        application. Each section is tagged with data-guide-section for AI-assisted lookup.
        Sections: schedules, employees, clock, rules, compliance, quick-reference
      */}
      <div className="max-w-3xl mx-auto space-y-6" data-guide="eascadesk-scheduler">

        {/* Intro */}
        <div className="bg-white rounded-xl shadow-soft p-6">
          <h1 className="text-2xl font-bold text-dark mb-2">{t('guideIntroTitle')}</h1>
          <p className="text-muted">{t('guideIntro')}</p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Guide sections">
            {t('guideNav').map(({ label, anchor }) => (
              <a
                key={anchor}
                href={`#${anchor}`}
                className="text-xs px-3 py-1.5 rounded-full bg-brand-lavender/40 text-brand-purple font-medium hover:bg-brand-lavender transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        {/* Sections */}
        {sections.map((section) => (
          <Section key={section.id} id={section.id} title={section.title}>
            {section.intro && <p className="text-sm text-muted">{section.intro}</p>}

            {section.steps && (
              <div className="space-y-4 pt-1">
                {section.steps.map((step, i) => (
                  <Step key={i} number={i + 1} title={step.title} body={step.body} />
                ))}
              </div>
            )}

            {section.bullets && (
              <ul className="text-sm text-muted list-disc list-inside space-y-1.5 pt-1">
                {section.bullets.map((b, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: b }} />
                ))}
              </ul>
            )}

            {section.tip && <Tip label={t('guideTip')}>{section.tip}</Tip>}
            {section.note && <Note label={t('guideNote')}>{section.note}</Note>}
          </Section>
        ))}

        {/* Quick reference */}
        <Section id="quick-reference" title={t('guideQuickRefTitle')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t('guideQuickRefWant')}</th>
                  <th className="px-4 py-2 text-left">{t('guideQuickRefGo')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-dark">
                {quickRef.map(({ action, location, anchor }) => (
                  <tr key={action} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">{action}</td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`#${anchor}`}
                        className="font-medium text-brand-purple hover:underline"
                      >
                        {location}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

      </div>
    </Layout>
  )
}
