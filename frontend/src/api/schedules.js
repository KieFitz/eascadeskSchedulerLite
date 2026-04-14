import client from './client'

export async function downloadTemplate() {
  const response = await client.get('/template', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  link.download = match ? match[1] : 'schedule_template.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function uploadExcel(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function solveSchedule(run_id, timeout_seconds = null) {
  const body = { run_id }
  if (timeout_seconds) body.timeout_seconds = timeout_seconds
  const { data } = await client.post('/solve', body)
  return data
}

export async function listSchedules() {
  const { data } = await client.get('/schedules/')
  return data
}

export async function getSchedule(run_id) {
  const { data } = await client.get(`/schedules/${run_id}`)
  return data
}

export async function getUsage() {
  const { data } = await client.get('/schedules/usage')
  return data
}

export async function updateAssignments(run_id, assignments, shifts = null) {
  const body = { assignments }
  if (shifts !== null) body.shifts = shifts
  const { data } = await client.patch(`/schedules/${run_id}/assignments`, body)
  return data
}

export async function validateSchedule(run_id, assignments, employees = null, shifts = null) {
  const body = { assignments }
  if (employees !== null) body.employees = employees
  if (shifts !== null) body.shifts = shifts
  const { data } = await client.post(`/schedules/${run_id}/validate`, body)
  return data
}

export async function publishSchedule(run_id) {
  const { data } = await client.post(`/schedules/${run_id}/publish`)
  return data
}

export async function unpublishSchedule(run_id) {
  const { data } = await client.delete(`/schedules/${run_id}/publish`)
  return data
}

export async function getSubstitutes(run_id, shift_id, { assignments, employees, shifts } = {}) {
  const body = {}
  if (assignments) body.assignments = assignments
  if (employees)   body.employees   = employees
  if (shifts)      body.shifts      = shifts
  const { data } = await client.post(`/schedules/${run_id}/substitutes/${shift_id}`, body)
  return data.substitutes
}

export async function downloadExport(run_id) {
  const response = await client.get(`/export/${run_id}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  const disposition = response.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  link.download = match ? match[1] : `schedule_${run_id}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
