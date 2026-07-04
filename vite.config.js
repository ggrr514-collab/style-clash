import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages ではサブパス配信になるため BASE_PATH で切り替える
// (ローカル / Vercel などルート配信のときは "/" のまま)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
