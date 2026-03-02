/**
 * Lightweight i18n utility — English / Spanish
 * Activated automatically when user.country === 'ES'
 */

export const translations = {
  en: {
    // Sidebar
    navSchedule: 'Schedule',
    navRules: 'Rules',
    logout: 'Log out',

    // Home — upload card
    uploadSchedule: 'Upload Schedule',
    uploadSubtitle: 'Upload an Excel file with Employees and Shifts sheets',
    downloadTemplate: 'Download Template',
    planPro: 'Unlimited schedules · shifts up to 31 days ahead',
    planFree: '1 auto-schedule per month · shifts up to 14 days ahead',
    dropzone: 'Drag & drop your Excel file here',
    dropzoneSub: 'or click to browse · .xlsx, .xls',
    upload: 'Upload',
    clear: 'Clear',

    // Home — gantt card
    schedulePreview: 'Schedule Preview',
    statLine: (emp, shifts, days) =>
      `${emp} employees · ${shifts} shifts · ${days} days`,
    hardViolations: 'hard violations',
    optimising: 'EascaDesk is optimising your schedule\u2026',
    autoSchedule: 'Auto-Schedule',
    reschedule: 'Re-schedule',
    scheduling: 'Scheduling\u2026',
    downloadExcel: 'Download Excel',

    // Home — empty state
    noSchedule: 'No schedule loaded',
    noScheduleDesc:
      'Upload an Excel file above to see your employees and shifts on the Gantt chart.',

    // Home — toasts
    toastUploaded: (emp, slots) => `Uploaded: ${emp} employees, ${slots} shift slots`,
    toastUploadFail: 'Upload failed. Check your Excel format.',
    toastSolved: 'Schedule solved!',
    toastSolveFail: 'Solve failed. Please try again.',
    toastDownloadFail: 'Could not download the schedule.',
    toastPaymentSuccess: 'You are now on the Pro plan!',
    toastFiletype: 'Please select an Excel file (.xlsx or .xls)',

    // Rules page
    rulesTitle: 'Rules',
    labourLawCountry: 'Labour Law Country',
    labourLawDesc:
      'Select the country whose labour laws apply to your workforce. The scheduler will use this setting to apply the appropriate hard constraints — such as minimum rest periods and maximum shift lengths — when building your schedule.',
    comingSoon: 'Industry-specific rule templates are coming soon.',
    schedulingConstraints: 'Scheduling Constraints',
    constraintsNote: 'These laws will be enforced as hard rules in the solver.',
    saveSettings: 'Save Settings',
    currentlySetTo: 'Currently set to',
    toastCountrySaved: 'Country saved!',
    toastCountryFail: 'Could not save settings.',

    // Country data
    countries: [
      {
        code: 'IE',
        name: 'Ireland',
        flag: '\uD83C\uDDEE\uD83C\uDDEA',
        summary: 'Working Time Act 1997',
        rules: [
          'Maximum 48-hour average working week',
          'Minimum 11 hours rest between shifts',
          'Minimum 24-hour weekly rest period',
          'Minimum 15-minute break after 4.5 hours',
          'Sunday premium pay entitlement',
        ],
      },
      {
        code: 'GB',
        name: 'United Kingdom',
        flag: '\uD83C\uDDEC\uD83C\uDDE7',
        summary: 'Working Time Regulations 1998',
        rules: [
          'Maximum 48-hour average working week (opt-out available)',
          'Minimum 11 hours daily rest',
          'Minimum 24-hour weekly rest period',
          'Minimum 20-minute break after 6 hours',
          '5.6 weeks statutory annual leave',
        ],
      },
      {
        code: 'ES',
        name: 'Spain',
        flag: '\uD83C\uDDEA\uD83C\uDDF8',
        summary: "Workers' Statute (Estatuto de los Trabajadores)",
        rules: [
          'Maximum 40-hour ordinary working week',
          'Maximum 9 hours overtime per day',
          'Minimum 12 hours rest between shifts',
          'Minimum 1.5 days weekly rest',
          '30 calendar days annual leave',
        ],
      },
    ],
  },

  es: {
    // Sidebar
    navSchedule: 'Horario',
    navRules: 'Normativa',
    logout: 'Cerrar sesi\u00f3n',

    // Home — upload card
    uploadSchedule: 'Subir Horario',
    uploadSubtitle: 'Sube un archivo Excel con las hojas de Empleados y Turnos',
    downloadTemplate: 'Descargar Plantilla',
    planPro: 'Horarios ilimitados · turnos hasta 31 d\u00edas de antelaci\u00f3n',
    planFree: '1 horario autom\u00e1tico al mes · turnos hasta 14 d\u00edas de antelaci\u00f3n',
    dropzone: 'Arrastra y suelta tu archivo Excel aqu\u00ed',
    dropzoneSub: 'o haz clic para examinar · .xlsx, .xls',
    upload: 'Subir',
    clear: 'Limpiar',

    // Home — gantt card
    schedulePreview: 'Vista Previa del Horario',
    statLine: (emp, shifts, days) =>
      `${emp} empleados · ${shifts} turnos · ${days} d\u00edas`,
    hardViolations: 'infracciones graves',
    optimising: 'EascaDesk est\u00e1 optimizando tu horario\u2026',
    autoSchedule: 'Horario Autom\u00e1tico',
    reschedule: 'Reprogramar',
    scheduling: 'Programando\u2026',
    downloadExcel: 'Descargar Excel',

    // Home — empty state
    noSchedule: 'No hay horario cargado',
    noScheduleDesc:
      'Sube un archivo Excel arriba para ver tus empleados y turnos en el gr\u00e1fico Gantt.',

    // Home — toasts
    toastUploaded: (emp, slots) => `Subido: ${emp} empleados, ${slots} turnos`,
    toastUploadFail: 'Error al subir. Revisa el formato del archivo Excel.',
    toastSolved: '\u00a1Horario resuelto!',
    toastSolveFail: 'Error al resolver. Por favor, inténtalo de nuevo.',
    toastDownloadFail: 'No se pudo descargar el horario.',
    toastPaymentSuccess: '\u00a1Ya tienes el plan Pro!',
    toastFiletype: 'Por favor selecciona un archivo Excel (.xlsx o .xls)',

    // Rules page
    rulesTitle: 'Normativa',
    labourLawCountry: 'Pa\u00eds de la Normativa Laboral',
    labourLawDesc:
      'Selecciona el pa\u00eds cuya legislaci\u00f3n laboral se aplica a tu plantilla. El planificador usar\u00e1 esta configuraci\u00f3n para aplicar las restricciones obligatorias \u2014 como los per\u00edodos de descanso m\u00ednimos y la duraci\u00f3n m\u00e1xima de los turnos \u2014 al generar el horario.',
    comingSoon: 'Las plantillas de reglas por sector estarán disponibles próximamente.',
    schedulingConstraints: 'Restricciones de Programaci\u00f3n',
    constraintsNote:
      'Estas leyes se aplicar\u00e1n como reglas estrictas en el planificador.',
    saveSettings: 'Guardar Configuraci\u00f3n',
    currentlySetTo: 'Actualmente configurado como',
    toastCountrySaved: '\u00a1Pa\u00eds guardado!',
    toastCountryFail: 'No se pudo guardar la configuraci\u00f3n.',

    // Country data
    countries: [
      {
        code: 'IE',
        name: 'Irlanda',
        flag: '\uD83C\uDDEE\uD83C\uDDEA',
        summary: 'Working Time Act 1997',
        rules: [
          'Semana laboral media m\u00e1xima de 48 horas',
          'M\u00ednimo 11 horas de descanso entre turnos',
          'Per\u00edodo de descanso semanal m\u00ednimo de 24 horas',
          'Descanso m\u00ednimo de 15 minutos tras 4,5 horas',
          'Derecho a pago adicional por trabajo en domingo',
        ],
      },
      {
        code: 'GB',
        name: 'Reino Unido',
        flag: '\uD83C\uDDEC\uD83C\uDDE7',
        summary: 'Working Time Regulations 1998',
        rules: [
          'Semana laboral media m\u00e1xima de 48 horas (con posibilidad de renuncia)',
          'M\u00ednimo 11 horas de descanso diario',
          'Per\u00edodo de descanso semanal m\u00ednimo de 24 horas',
          'Descanso m\u00ednimo de 20 minutos tras 6 horas',
          '5,6 semanas de vacaciones anuales por ley',
        ],
      },
      {
        code: 'ES',
        name: 'Espa\u00f1a',
        flag: '\uD83C\uDDEA\uD83C\uDDF8',
        summary: 'Estatuto de los Trabajadores',
        rules: [
          'Semana laboral ordinaria m\u00e1xima de 40 horas',
          'M\u00e1ximo de 9 horas extraordinarias por d\u00eda',
          'M\u00ednimo 12 horas de descanso entre turnos',
          'M\u00ednimo 1,5 d\u00edas de descanso semanal',
          '30 d\u00edas naturales de vacaciones anuales',
        ],
      },
    ],
  },
}

/**
 * Returns the locale code ('en' | 'es') for a given country code.
 */
export function getLocale(country) {
  return country === 'ES' ? 'es' : 'en'
}

/**
 * Hook-style helper — call with user.country to get t() and isSpanish.
 * t(key) returns the translated string; t(key, ...args) calls it if it's a function.
 */
export function useTranslations(country) {
  const locale = getLocale(country)
  const dict = translations[locale]

  const t = (key, ...args) => {
    const val = dict[key] ?? translations.en[key] ?? key
    return typeof val === 'function' ? val(...args) : val
  }

  return { t, isSpanish: locale === 'es', locale }
}
