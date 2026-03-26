import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/Facin/',
  plugins: [
    react(),
    tailwindcss(),   // v4: plugin nativo no Vite, sem postcss
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
})
