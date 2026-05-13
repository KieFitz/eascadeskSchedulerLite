import client from './client'

export async function listClockEvents({ employeeId, dateFrom, dateTo, includeDeleted } = {}) {
  const params = {}
  if (employeeId)     params.employee_id     = employeeId
  if (dateFrom)       params.date_from       = dateFrom
  if (dateTo)         params.date_to         = dateTo
  if (includeDeleted) params.include_deleted = true
  const { data } = await client.get('/clock/events', { params })
  return data
}

export async function createClockEventManual({ employeeId, eventType, eventAt, reason }) {
  const params = { employee_id: employeeId, event_type: eventType }
  if (eventAt) params.event_at = eventAt
  if (reason)  params.reason   = reason
  const { data } = await client.post('/clock/events', null, { params })
  return data
}

export async function deleteClockEvent(eventId, reason) {
  const params = {}
  if (reason) params.reason = reason
  await client.delete(`/clock/events/${eventId}`, { params })
}

export async function getClockEventAudit(eventId) {
  const { data } = await client.get(`/clock/events/${eventId}/audit`)
  return data
}

export async function requestClockEventEdit(eventId, { proposedEventAt, reason } = {}) {
  const params = { proposed_event_at: proposedEventAt }
  if (reason) params.reason = reason
  const { data } = await client.patch(`/clock/events/${eventId}`, null, { params })
  return data
}

export async function exportClockEventsCsv({ employeeId, dateFrom, dateTo, includeDeleted } = {}) {
  const params = {}
  if (employeeId)     params.employee_id     = employeeId
  if (dateFrom)       params.date_from       = dateFrom
  if (dateTo)         params.date_to         = dateTo
  if (includeDeleted) params.include_deleted = true
  const response = await client.get('/clock/events/export.csv', { params, responseType: 'blob' })
  return response.data
}
