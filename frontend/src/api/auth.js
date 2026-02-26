import client from './client'
import axios from 'axios'

export async function register(username, email, password) {
  const { data } = await axios.post('/api/v1/auth/register', { username, email, password })
  return data
}

export async function login(email, password) {
  const { data } = await axios.post('/api/v1/auth/login', { email, password })
  return data
}

export async function me() {
  const { data } = await client.get('/auth/me')
  return data
}
