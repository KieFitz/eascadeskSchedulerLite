import Layout from '../components/layout/Layout'

const Section = ({ id, title, children }) => (
  <div id={id} className="bg-white rounded-xl shadow-soft p-6 space-y-3 scroll-mt-6" data-guide-section={id}>
    <h2 className="text-lg font-semibold text-dark border-b border-gray-100 pb-2">{title}</h2>
    {children}
  </div>
)

const Step = ({ number, title, children }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-purple text-white flex items-center justify-center text-sm font-bold">
      {number}
    </div>
    <div>
      <p className="font-medium text-dark">{title}</p>
      <p className="text-sm text-muted mt-0.5">{children}</p>
    </div>
  </div>
)

const Tip = ({ children }) => (
  <div className="bg-brand-lavender/30 border border-brand-lavender rounded-lg px-4 py-3 text-sm text-dark">
    <span className="font-semibold text-brand-purple">Tip: </span>{children}
  </div>
)

const Note = ({ children }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-dark">
    <span className="font-semibold text-amber-700">Note: </span>{children}
  </div>
)

const QUICK_REF = [
  { action: 'Build or view a schedule',        location: 'Part 1 — Building a schedule',          anchor: 'schedules'  },
  { action: 'Add or edit an employee',          location: 'Part 2 — Managing your employee roster', anchor: 'employees'  },
  { action: 'Set employee availability',        location: 'Part 2 — Managing your employee roster', anchor: 'employees'  },
  { action: 'View clock-in / clock-out records',location: 'Part 3 — Clock in / clock out',          anchor: 'clock'      },
  { action: 'Manually add a clock record',      location: 'Part 3 — Clock in / clock out',          anchor: 'clock'      },
  { action: 'Correct a clock time',             location: 'Part 3 — Clock in / clock out',          anchor: 'clock'      },
  { action: 'Export hours to a spreadsheet',    location: 'Part 3 — Clock in / clock out',          anchor: 'clock'      },
  { action: 'Change timezone or scheduling rules', location: 'Part 4 — Rules and settings',         anchor: 'rules'      },
  { action: 'Spanish compliance requirements',  location: 'Part 5 — Compliance (Spain)',            anchor: 'compliance' },
]

export default function Guide() {
  return (
    <Layout title="Manager Guide">
      {/*
        data-guide="eascadesk-scheduler"
        This attribute marks this page as the canonical user guide for the Eascadesk Scheduler
        application. Each section is tagged with data-guide-section for AI-assisted lookup.
        Sections: schedules, employees, clock, rules, compliance, quick-reference
      */}
      <div className="max-w-3xl mx-auto space-y-6" data-guide="eascadesk-scheduler">

        {/* Intro */}
        <div className="bg-white rounded-xl shadow-soft p-6">
          <h1 className="text-2xl font-bold text-dark mb-2">How to use Eascadesk Scheduler</h1>
          <p className="text-muted">
            This guide explains everything a manager needs to know to build schedules, manage staff,
            and track working hours — no technical knowledge required.
          </p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Guide sections">
            {[
              { label: 'Schedules',   anchor: 'schedules'      },
              { label: 'Employees',   anchor: 'employees'      },
              { label: 'Clock in/out',anchor: 'clock'          },
              { label: 'Rules',       anchor: 'rules'          },
              { label: 'Compliance',  anchor: 'compliance'     },
              { label: 'Quick ref',   anchor: 'quick-reference'},
            ].map(({ label, anchor }) => (
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

        {/* Part 1 — Schedules */}
        <Section id="schedules" title="Part 1 — Building a schedule">
          <p className="text-sm text-muted">
            A schedule is a plan that shows which employee works which shift on which day.
            You can build a schedule from scratch or let the system automatically assign employees
            to shifts for you.
          </p>

          <div className="space-y-4 pt-1">
            <Step number="1" title="Go to Schedules">
              Click <strong>Schedules</strong> in the left menu. You will see a list of all schedules
              you have created before.
            </Step>
            <Step number="2" title="Create a new schedule">
              Click the <strong>Build Schedule</strong> button. Give it a name (optional), choose
              a start date, and pick how many weeks it should cover. Then click <strong>Create</strong>.
            </Step>
            <Step number="3" title="Add shifts">
              You will be taken to the schedule editor. Click the <strong>+</strong> button on any
              date cell to add a shift. You can set the start time, end time, and which skills are
              required for that shift.
            </Step>
            <Step number="4" title="Assign employees">
              Each shift chip shows the employee assigned to it (or "Open" if no one is assigned).
              You can drag a shift to a different employee row to reassign it, or click the shift
              to open an edit panel and choose an employee from the drop-down list.
            </Step>
            <Step number="5" title="Auto-assign with the solver (Pro)">
              If you have a Pro account and have set up your employee roster and availability rules,
              click <strong>Auto-assign</strong> to let the system fill all open shifts automatically.
              It will respect availability and minimum-hours rules.
            </Step>
          </div>

          <Tip>
            Use the <strong>By Employee</strong> tab to see who is working when, and the{' '}
            <strong>By Shift</strong> tab to check that all shifts are covered.
          </Tip>
        </Section>

        {/* Part 2 — Employees */}
        <Section id="employees" title="Part 2 — Managing your employee roster (Pro)">
          <p className="text-sm text-muted">
            The employee roster is a permanent list of your staff. Each employee has a phone number
            linked to the WhatsApp clock-in system.
          </p>

          <div className="space-y-4 pt-1">
            <Step number="1" title="Add an employee">
              Go to <strong>Employees</strong> in the left menu and click <strong>Add employee</strong>.
              Fill in their name, mobile number (include the country code, e.g. +353 for Ireland),
              and optionally their NIF (national ID number, required in Spain for payroll reports).
            </Step>
            <Step number="2" title="Set skills">
              In the Skills field, type the roles or abilities the employee has, separated by commas
              (e.g. <em>barista, cashier</em>). Skills are used to match employees to the right shifts.
            </Step>
            <Step number="3" title="Set availability rules">
              Click the arrow on the left of an employee's row to expand their availability panel.
              Add rules to show when they prefer to work, prefer not to work, or are unavailable.
              The auto-assign solver will respect these rules.
            </Step>
            <Step number="4" title="Deactivate instead of deleting">
              If an employee leaves temporarily, uncheck <strong>Active</strong> rather than deleting them.
              This keeps their clock history intact for payroll records.
            </Step>
          </div>

          <Note>
            The phone number must be in international format with a + sign and no spaces
            (e.g. +353871234567). This is how the WhatsApp bot identifies the employee.
          </Note>
        </Section>

        {/* Part 3 — Clock In/Out */}
        <Section id="clock" title="Part 3 — Clock in / clock out (Pro)">
          <p className="text-sm text-muted">
            Employees clock in and out by sending a WhatsApp message. As a manager, you can view
            all clock events, fix mistakes, and export records for payroll.
          </p>

          <div className="space-y-4 pt-1">
            <Step number="1" title="How employees clock in">
              Employees send a WhatsApp message to the business number. They will receive a menu
              with options: <strong>Clock In</strong>, <strong>Clock Out</strong>, and <strong>Break</strong>.
              They can also type <em>in</em> or <em>out</em> directly as a shortcut.
            </Step>
            <Step number="2" title="View the clock log">
              Go to <strong>Clock Events</strong> in the left menu. You will see a list of all
              clock-in and clock-out records, with the time, employee name, and whether the record
              was logged automatically or manually.
            </Step>
            <Step number="3" title="Add a record manually">
              If an employee forgot to clock in or out, click <strong>Add entry</strong> at the top
              right. Choose the employee, the event type (clock in or out), the date and time, and
              optionally add a reason. This reason is saved in the audit log.
            </Step>
            <Step number="4" title="Correct a time">
              Click the pencil icon next to any event to propose a correction. Enter the correct time
              and a reason. The employee will receive a WhatsApp message asking them to confirm the
              change. The correction is only applied after they reply <em>yes</em>.
            </Step>
            <Step number="5" title="Delete a record">
              Click the bin icon to remove a record. You must enter a reason — this is saved for
              compliance purposes. Deleted records are not permanently removed; they remain hidden
              but traceable.
            </Step>
            <Step number="6" title="Export to CSV">
              Click <strong>Export CSV</strong> to download a spreadsheet of all clock events.
              You can use this for payroll, audits, or government reporting.
            </Step>
          </div>

          <Tip>
            Records flagged with <strong>Auto</strong> were created automatically because an employee
            forgot to clock out. Review these and correct the time if needed.
          </Tip>
        </Section>

        {/* Part 4 — Rules & Settings */}
        <Section id="rules" title="Part 4 — Rules and settings">
          <p className="text-sm text-muted">
            The Rules page lets you set your timezone and configure how the scheduler works.
          </p>

          <div className="space-y-4 pt-1">
            <Step number="1" title="Set your timezone">
              Go to <strong>Rules</strong> in the left menu. Choose your timezone from the list
              (e.g. Europe/Dublin or Europe/Madrid). This ensures clock-in times are shown in your
              local time, not UTC.
            </Step>
            <Step number="2" title="Scheduling rules">
              You can configure minimum and maximum hours per employee per week. These rules are
              used by the auto-assign solver to build fair schedules.
            </Step>
          </div>
        </Section>

        {/* Part 5 — Compliance */}
        <Section id="compliance" title="Part 5 — Compliance (Spain)">
          <p className="text-sm text-muted">
            If you operate in Spain, the clock-in system is designed to meet the requirements of
            Real Decreto-ley 8/2019, which requires employers to keep a daily record of working hours.
          </p>
          <ul className="text-sm text-muted list-disc list-inside space-y-1.5 pt-1">
            <li>Every clock event is stored permanently — even deleted ones remain in the system.</li>
            <li>Any correction or deletion requires a written reason.</li>
            <li>All changes are recorded in an audit trail that shows who changed what and when.</li>
            <li>Employees must approve time corrections before they take effect.</li>
            <li>
              Adding a <strong>NIF</strong> (national ID) to each employee allows you to include
              it in exported reports for official submissions.
            </li>
          </ul>
          <Note>
            The CSV export includes all required fields — employee name, NIF, clock-in, clock-out,
            breaks, and any manual adjustments — ready for payroll or labour inspections.
          </Note>
        </Section>

        {/* Quick reference */}
        <Section id="quick-reference" title="Quick reference — where is everything?">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">I want to…</th>
                  <th className="px-4 py-2 text-left">Go to…</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-dark">
                {QUICK_REF.map(({ action, location, anchor }) => (
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
