import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import viteCompression from 'vite-plugin-compression';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    checker({
      typescript: true,
    }),
    dts(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@realmap/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
          map: ['maplibre-gl'],
        },
      },
    },
  },
});
