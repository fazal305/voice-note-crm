import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/** Preloads the heading font (Instrument Serif, latin, regular) so the first heading doesn't swap in late. */
function preloadHeadingFont() {
  return {
    name: 'preload-heading-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((name) => /instrument-serif-latin-400-normal-[\w-]+\.woff2$/.test(name))
        if (!file) return html
        return [{ tag: 'link', attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' }]
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadHeadingFont()],
  server: { port: 5473, strictPort: true },
})
