import client from './client'

export async function createCheckout() {
  const { data } = await client.post('/payments/checkout')
  return data
}

export async function createPortal() {
  const { data } = await client.post('/payments/portal')
  return data
}
