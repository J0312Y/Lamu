import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3001,
    proxy: {
      // Proxy payment API calls to bypass browser CORS restrictions
      '/proxy': {
        target: 'https://paiement.elembotech.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/proxy/, ''),
      },
      // Proxy Lamu backend — adds auth header server-side, avoids CORS + key exposure
      '/lamu-api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lamu-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', 'Bearer change-this-to-a-long-random-secret')
          })
        },
      },
    },
  },
})
