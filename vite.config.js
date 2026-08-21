import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Permit ngrok's rotating tunnel subdomains without opening the dev server to arbitrary hosts.
    allowedHosts: ['.ngrok-free.app'],
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
