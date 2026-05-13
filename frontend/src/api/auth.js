import client from './client'

export async function register(username, email, password) {
  const { data } = await client.post('/auth/register', { username, email, password })
  return data
}

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password })
  return data
}

export async function me() {
  const { data } = await client.get('/auth/me')
  return data
}

export async function updateSettings({ country, timezone } = {}) {
  const { data } = await client.patch('/auth/me', { country, timezone })
  return data
}
