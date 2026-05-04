import client from './client'

export async function listEmployees() {
  const { data } = await client.get('/employees/')
  return data
}

export async function createEmployee(payload) {
  const { data } = await client.post('/employees/', payload)
  return data
}

export async function updateEmployee(id, payload) {
  const { data } = await client.patch(`/employees/${id}`, payload)
  return data
}

export async function deleteEmployee(id) {
  await client.delete(`/employees/${id}`)
}

export async function listAvailability(employeeId) {
  const { data } = await client.get(`/employees/${employeeId}/availability`)
  return data
}

export async function createAvailability(employeeId, payload) {
  const { data } = await client.post(`/employees/${employeeId}/availability`, payload)
  return data
}

export async function deleteAvailability(employeeId, availabilityId) {
  await client.delete(`/employees/${employeeId}/availability/${availabilityId}`)
}
