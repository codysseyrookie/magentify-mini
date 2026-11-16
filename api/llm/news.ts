// Vercel 서버리스 함수: POST /api/llm/news
import { searchNews } from '../_news.js';
import { guardRequest } from '../_guard.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', code: 'bad_request' });
    return;
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const denied = guardRequest({ method: req.method, headers: req.headers, ip: req.socket?.remoteAddress, body }, 'news');
  if (denied) {
    res.status(denied.status).json(denied.body);
    return;
  }
  const result = await searchNews(body.query);
  res.status(result.status).json(result.body);
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
