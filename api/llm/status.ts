// Vercel 서버리스 함수: GET /api/llm/status
import { createHash } from 'node:crypto';
import { getStatus } from '../_llm.js';

// 임시 진단(키 값 자체는 노출하지 않음): 키 길이와 SHA-256 앞 8자리, 공백/따옴표 여부, 엔드포인트 호스트.
// 원인 확인 후 제거한다.
function diag() {
  const raw = process.env.LINER_API_KEY ?? '';
  const trimmed = raw.trim();
  let baseHost: string | null = null;
  try {
    baseHost = process.env.LINER_BASE_URL ? new URL(process.env.LINER_BASE_URL).host : null;
  } catch {
    baseHost = 'invalid';
  }
  return {
    keyRawLength: raw.length,
    keyTrimmedLength: trimmed.length,
    keySha256Head8: trimmed ? createHash('sha256').update(trimmed).digest('hex').slice(0, 8) : null,
    hasOuterWhitespace: raw !== trimmed,
    hasQuote: /["']/.test(raw),
    baseUrlHost: baseHost,
    modelOverride: Boolean(process.env.LINER_MODEL && process.env.LINER_MODEL.trim()),
  };
}

export default function handler(_req: any, res: any) {
  res.status(200).json({ ...getStatus(), _diag: diag() });
}
