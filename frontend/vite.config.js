import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production: static build deployed to S3/CloudFront.
// Set VITE_API_URL at build time (e.g. https://api.example.com).
// Local dev fallback: proxy /api to localhost:8000 when VITE_API_URL is not set.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
