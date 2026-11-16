import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generate, getStatus } from './api/_llm.ts';
import { searchNews } from './api/_news.ts';
import { guardRequest } from './api/_guard.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));

  // LLM 공급자 상태 (Liner 우선, 키가 없으면 폴백). 로직은 api/_llm.ts에 있고 Vercel 함수와 공유한다.
  app.get('/api/llm/status', (_req, res) => {
    res.json(getStatus());
  });

  // LLM 생성 엔드포인트
  app.post('/api/llm/generate', async (req, res) => {
    const denied = guardRequest({ method: req.method, headers: req.headers, ip: req.socket.remoteAddress, body: req.body }, 'generate');
    if (denied) return res.status(denied.status).json(denied.body);
    const { systemPrompt, userPrompt, strategy } = req.body || {};
    const result = await generate(systemPrompt, userPrompt, process.env, undefined, undefined, strategy);
    res.status(result.status).json(result.body);
  });

  // 업종 동향 검색 (Liner Search API)
  app.post('/api/llm/news', async (req, res) => {
    const denied = guardRequest({ method: req.method, headers: req.headers, ip: req.socket.remoteAddress, body: req.body }, 'news');
    if (denied) return res.status(denied.status).json(denied.body);
    const result = await searchNews((req.body || {}).query);
    res.status(result.status).json(result.body);
  });

  if (!isProd) {
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          host: '0.0.0.0',
          allowedHosts: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      })
    );

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
