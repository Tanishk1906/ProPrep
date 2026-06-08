import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // pdfjs-dist v5 uses ESM and should NOT be pre-bundled by Vite
    exclude: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      // Prevent Rollup from trying to bundle the PDF worker
      external: [],
    },
  },
})
