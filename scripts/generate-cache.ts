/**
 * 데모 응답 저장본 생성: `npm run cache:generate`
 *
 * .env의 LINER_API_KEY로 실제 Liner Model API를 호출해
 * 데모 거래처별 브리핑·이메일·통화 가이드를 public/cache/llm-cache.json에 저장한다.
 * - 앱은 이 파일을 데모 모드의 "Liner Model API 응답(저장본)"으로 사용한다.
 * - 검증(금지어, 입력 외 숫자, 스키마)을 통과한 live 응답만 저장한다. 폴백 템플릿은 저장하지 않는다.
 * - 가상 데이터(별칭 없이 가상 거래처의 요약 수치)만 전송한다. 실제 거래처 자료는 사용하지 않는다.
 *
 * 옵션: --force  기존 항목도 다시 생성 / --tones=all|default  (기본 all: 우선 확인 4곳은 3가지 톤)
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { generate, getStatus } from '../api/_llm.ts';
import { searchNews } from '../api/_news.ts';
import { DEFAULT_NEWS_QUERY, fetchNews } from '../src/news.ts';
import type { NewsItem } from '../src/types.ts';
import { composeIndustryNews } from '../src/industryNews.ts';
import { analyze, buildClean, prioritize, suggestMapping, summarize } from '../src/analysis.ts';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData.ts';
import {
  briefingCacheKey,
  callCacheKey,
  emailCacheKey,
  FOLLOWUP_PRESET_MEMO,
  followupCacheKey,
  generateAnswer,
  generateBriefing,
  generateCallGuide,
  generateEmail,
  generateFollowup,
  generateNewsQuery,
  newsQueryCacheKey,
  maskMemo,
  QA_PRESET_QUESTIONS,
  qaCacheKey,
  buildQaInput,
  type MessageTone,
} from '../src/llm.ts';

dotenv.config();

const REF = '2026-11-30';
const FLAGS = {
  '대성정밀': { vip: true, project_based: false },
  '미래산업': { vip: true, project_based: false },
  '바른설비': { vip: false, project_based: true },
};
const OUT = path.resolve(process.cwd(), 'public/cache/llm-cache.json');
const force = process.argv.includes('--force');
const toneMode = (process.argv.find(a => a.startsWith('--tones=')) || '--tones=all').split('=')[1];
const ALL_TONES: MessageTone[] = ['정중하게', '친근하게', '간단하게'];

const status = getStatus();
if (status.provider !== 'liner') {
  console.error(`LINER_API_KEY가 없습니다(현재 공급자: ${status.provider}). .env에 키를 넣고 다시 실행하세요.`);
  console.error('키가 없으면 저장본을 만들 수 없습니다. 폴백 템플릿을 저장본으로 위장하지 않습니다.');
  process.exit(2);
}

const realFetch = globalThis.fetch;
// 앱의 llm.ts가 호출하는 /api/llm/generate를 같은 프로세스의 서버 로직으로 연결한다.
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).includes('/api/llm/news')) {
    const body = JSON.parse(init.body);
    const r = await searchNews(body.query, process.env, realFetch as any);
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as any;
  }
  if (String(url).includes('/api/llm/generate')) {
    const body = JSON.parse(init.body);
    const r = await generate(body.systemPrompt, body.userPrompt, process.env, realFetch as any, 1500, body.strategy);
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as any;
  }
  throw new Error('unexpected fetch: ' + url);
}) as any;

const { headers, rows } = parseCSV(DEMO_CSV_DATA);
const quality = buildClean(rows, suggestMapping(headers), REF);
const assessments = analyze(quality.clean_rows, FLAGS, REF);
const priority = prioritize(assessments);
const summary = summarize(assessments);
const topKeys = new Set(priority.slice(0, 4).map(a => a.customer_key));

const cache: Record<string, any> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
let added = 0;
let failed = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ensure(key: string, make: () => Promise<{ source: string; content: any; error_code: string | null }>) {
  if (cache[key] && !force) return;
  const r = await make();
  await sleep(400);
  if (r.source === 'live') {
    cache[key] = r.content;
    added++;
    console.log(`저장: ${key}`);
  } else {
    failed++;
    console.log(`실패(저장 안 함): ${key} -> ${r.source}/${r.error_code}`);
  }
}

const liveOpts = { demoMode: false, forceLive: true };

await ensure(briefingCacheKey(priority), () => generateBriefing(priority, summary, liveOpts));

for (const a of assessments) {
  const tones: MessageTone[] = toneMode === 'all' && topKeys.has(a.customer_key) ? ALL_TONES : ['정중하게'];
  for (const tone of tones) {
    await ensure(emailCacheKey(a, tone), () => generateEmail(a, { ...liveOpts, tone }));
    await ensure(callCacheKey(a, tone), () => generateCallGuide(a, { ...liveOpts, tone }));
  }
}

// 질문하기 예시 질문 3개와 메모 후속 조치 예시 메모 1개를 미리 생성해 저장본에 넣는다.
const qaInput = buildQaInput(assessments, summary);
for (const q of QA_PRESET_QUESTIONS) {
  await ensure(qaCacheKey(q, qaInput.json), () => generateAnswer(q, assessments, summary, liveOpts));
}
const FOLLOWUP_CONTACT_DATE = '2026-11-30';
await ensure(
  followupCacheKey(maskMemo(FOLLOWUP_PRESET_MEMO, ['대성정밀']), FOLLOWUP_CONTACT_DATE),
  () => generateFollowup({ memo: FOLLOWUP_PRESET_MEMO, contactDate: FOLLOWUP_CONTACT_DATE, names: ['대성정밀'] }, liveOpts)
);

// 업종 동향: Liner Search로 기사를 받아 public/cache/news-cache.json에 저장하고,
// 우선 확인 거래처의 이메일을 그 기사를 참고해 다시 만들어 저장본에 넣는다.
const NEWS_OUT = path.resolve(process.cwd(), 'public/cache/news-cache.json');
const newsCache: Record<string, { items: NewsItem[]; fetched_at: string }> = fs.existsSync(NEWS_OUT)
  ? JSON.parse(fs.readFileSync(NEWS_OUT, 'utf8'))
  : {};
if (!newsCache[DEFAULT_NEWS_QUERY] || force) {
  const nr = await fetchNews(DEFAULT_NEWS_QUERY, { demoMode: false, forceLive: true });
  if (nr.items.length > 0) {
    newsCache[DEFAULT_NEWS_QUERY] = { items: nr.items, fetched_at: new Date().toISOString().slice(0, 10) };
    console.log(`저장: 업종 동향 ${nr.items.length}건 (${DEFAULT_NEWS_QUERY})`);
    nr.items.forEach(i => console.log(`  - ${i.date} ${i.hostname} ${i.title}`));
  } else {
    failed++;
    console.log(`실패(저장 안 함): 업종 동향 -> ${nr.error_code}`);
  }
}
const demoNews = newsCache[DEFAULT_NEWS_QUERY]?.items ?? [];
if (demoNews.length > 0) {
  for (const a of priority.slice(0, 4)) {
    // 앱과 같은 순서: Liner가 품목에서 업종 검색어를 만들고(저장), 그 검색어로 기사를 찾아(저장, 0건도 기록)
    // 기본 기사와 합친 목록으로 이메일 저장본을 만든다.
    let primary: NewsItem[] = [];
    if (a.main_item) {
      await ensure(newsQueryCacheKey(a.main_item), () => generateNewsQuery(a.main_item!, liveOpts));
      const q = cache[newsQueryCacheKey(a.main_item)]?.query as string | undefined;
      if (q && q !== DEFAULT_NEWS_QUERY) {
        if (!newsCache[q] || force) {
          const nr = await fetchNews(q, { demoMode: false, forceLive: true });
          newsCache[q] = { items: nr.items, fetched_at: new Date().toISOString().slice(0, 10) };
          console.log(`저장: 업종 동향 ${nr.items.length}건 (${q})`);
          nr.items.forEach(i => console.log(`  - ${i.date} ${i.hostname} ${i.title}`));
        }
        primary = newsCache[q].items;
      }
    }
    const merged = composeIndustryNews(primary, demoNews, a.display_name).items;
    const tones: MessageTone[] = toneMode === 'all' ? ALL_TONES : ['정중하게'];
    for (const tone of tones) {
      await ensure(emailCacheKey(a, tone, merged), () => generateEmail(a, { ...liveOpts, tone, news: merged }));
    }
  }
}
fs.mkdirSync(path.dirname(NEWS_OUT), { recursive: true });
fs.writeFileSync(NEWS_OUT, JSON.stringify(newsCache, null, 2) + '\n', 'utf8');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(cache, null, 2) + '\n', 'utf8');
console.log(`\n완료: 새로 저장 ${added}건, 실패 ${failed}건, 전체 ${Object.keys(cache).length}건 -> ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
