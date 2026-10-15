import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'http';
import https from 'https';
import { defineConfig, Plugin } from 'vite';

function audioStreamProxyPlugin(): Plugin {
  return {
    name: 'audio-stream-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/proxy-stream')) {
          const urlObj = new URL(req.url, 'http://localhost');
          const targetUrl = urlObj.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing target url query parameter');
            return;
          }

          try {
            const parsedTarget = new URL(targetUrl);
            const client = parsedTarget.protocol === 'https:' ? https : http;

            const proxyReq = client.get(
              targetUrl,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': '*/*',
                  'Icy-MetaData': '1',
                },
              },
              (proxyRes) => {
                // If redirect, follow redirect
                if (
                  (proxyRes.statusCode === 301 ||
                    proxyRes.statusCode === 302 ||
                    proxyRes.statusCode === 307 ||
                    proxyRes.statusCode === 308) &&
                  proxyRes.headers.location
                ) {
                  const redirectUrl = proxyRes.headers.location;
                  const redirectClient = redirectUrl.startsWith('https') ? https : http;
                  redirectClient.get(redirectUrl, (redRes) => {
                    res.writeHead(redRes.statusCode || 200, {
                      'Access-Control-Allow-Origin': '*',
                      'Access-Control-Allow-Methods': 'GET, OPTIONS',
                      'Access-Control-Allow-Headers': '*',
                      'Content-Type': redRes.headers['content-type'] || 'audio/mpeg',
                      'Cache-Control': 'no-cache',
                    });
                    redRes.pipe(res);
                  });
                  return;
                }

                res.writeHead(proxyRes.statusCode || 200, {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, OPTIONS',
                  'Access-Control-Allow-Headers': '*',
                  'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
                  'Cache-Control': 'no-cache',
                });

                proxyRes.pipe(res);
              }
            );

            proxyReq.on('error', (err) => {
              if (!res.headersSent) {
                res.statusCode = 502;
                res.end(`Proxy stream error: ${err.message}`);
              }
            });

            req.on('close', () => {
              proxyReq.destroy();
            });
          } catch (e: any) {
            res.statusCode = 500;
            res.end(`Invalid URL: ${e?.message}`);
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), audioStreamProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
