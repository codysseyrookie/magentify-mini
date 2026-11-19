// Vercel 서버리스 함수: GET /api/llm/status
import { getStatus } from '../_llm.js';

export default function handler(_req: any, res: any) {
  res.status(200).json(getStatus());
}
