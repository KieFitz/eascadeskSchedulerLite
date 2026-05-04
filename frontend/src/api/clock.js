import client from './client'

export async function listClockEvents({ employeeId, dateFrom, dateTo } = {}) {
  const params = {}
  if (employeeId) params.employee_id = employeeId
  if (dateFrom)   params.date_from   = dateFrom
  if (dateTo)     params.date_to     = dateTo
  const { data } = await client.get('/clock/events', { params })
  return data
}

export async function createClockEventManual({ employeeId, eventType, eventAt }) {
  const params = { employee_id: employeeId, event_type: eventType }
  if (eventAt) params.event_at = eventAt
  const { data } = await client.post('/clock/events', null, { params })
  return data
}

export async function deleteClockEvent(eventId) {
  await client.delete(`/clock/events/${eventId}`)
}

export function buildCsvExportUrl({ employeeId, dateFrom, dateTo } = {}) {
  const base = (import.meta.env.VITE_API_URL ?? '') + '/api/v1/clock/events/export.csv'
  const params = new URLSearchParams()
  if (employeeId) params.set('employee_id', employeeId)
  if (dateFrom)   params.set('date_from',   dateFrom)
  if (dateTo)     params.set('date_to',     dateTo)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
