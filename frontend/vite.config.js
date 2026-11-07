import { defineConfig } from 'vite';

const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080';
const devPort = Number(process.env.VITE_PORT || 5173);
const previewPort = Number(process.env.VITE_PREVIEW_PORT || 4173);
// Spring WebSocket 按 Origin 白名单握手；只在 upgrade 请求上设置可信 Origin。
function wsProxy() {
  return {
    target: backend,
    ws: true,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReqWs', (proxyReq, req) => {
        if (req.headers.upgrade?.toLowerCase() === 'websocket') {
          proxyReq.setHeader('Origin', process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:5173');
        }
      });
    }
  };
}

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': wsProxy()
    }
  },
  preview: {
    host: '127.0.0.1',
    port: previewPort,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': wsProxy()
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
