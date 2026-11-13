import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));

  // API Status check
  app.get('/api/llm/status', (_req, res) => {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasLiner = Boolean(process.env.LINER_API_KEY);
    res.json({
      configured: hasGemini || hasLiner,
      provider: hasGemini ? 'gemini' : (hasLiner ? 'liner' : 'fallback'),
    });
  });

  // LLM Generation endpoint
  app.post('/api/llm/generate', async (req, res) => {
    const { systemPrompt, userPrompt } = req.body;
    const geminiKey = process.env.GEMINI_API_KEY;
    const linerKey = process.env.LINER_API_KEY;

    // 1. Prefer Gemini API if key is present
    if (geminiKey) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        return res.json({ text: response.text || '' });
      } catch (err: any) {
        console.error('Gemini API call failed:', err.message || err);
        return res.status(502).json({ error: err.message || 'Gemini call failed' });
      }
    }

    // 2. Alternative: Liner API if configured
    if (linerKey) {
      try {
        const linerRes = await fetch(process.env.LINER_BASE_URL || 'https://platform.liner.com/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${linerKey.trim()}`,
          },
          body: JSON.stringify({
            model: process.env.LINER_MODEL || 'liner-gpt-router',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
          }),
        });

        if (!linerRes.ok) {
          throw new Error(`Liner API HTTP error: ${linerRes.status}`);
        }

        const data = await linerRes.json();
        const text = data.choices?.[0]?.message?.content || '';
        return res.json({ text });
      } catch (err: any) {
        console.error('Liner API call failed:', err.message || err);
        return res.status(502).json({ error: err.message || 'Liner call failed' });
      }
    }

    return res.status(503).json({ error: 'No LLM API key configured on server' });
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
