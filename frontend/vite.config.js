import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// While you work, any address starting with /api is passed on to your backend on port 5000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})