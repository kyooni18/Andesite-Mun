import { defineConfig } from 'vite'
import { munPlugin } from '@mun-ui/vite'

export default defineConfig({
  plugins: [munPlugin()],
  // Relative asset URLs let the desktop shell load the same build from its own protocol.
  base: './',
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
    // `pnpm dev` talks to a local andesite-server (serve-all), like the nginx of the deployment does.
    proxy: Object.fromEntries(['/v1', '/auth', '/sync'].map(prefix => [prefix, process.env.ANDESITE_SERVER ?? 'http://127.0.0.1:8788'])),
  },
  build: { target: 'safari16', sourcemap: false },
})
