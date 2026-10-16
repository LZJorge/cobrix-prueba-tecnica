import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        outDir: 'dist/web',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api/cobrix': 'http://127.0.0.1:4300',
            '/enunciado': 'http://127.0.0.1:4300',
        },
    },
})