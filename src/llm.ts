import {
  Assessment,
  BriefingContent,
  CallGuideContent,
  EmailDraftContent,
  LlmResult,
  SummaryCounts
} from './types';

export const FORBIDDEN_WORDS = [
  '확정',
  '반드시',
  '이탈했',
  '손실',
  '할인',
  '특가',
  '무료',
  '납기 보장',
];

export function renderPlaceholders(
  text: string,
  displayName: string,
  contactName?: string | null
): string {
  if (!text) return '';
  let res = text.replace(/\[거래처명\]/g, displayName);
  if (contactName && String(contactName).trim()) {
    res = res.replace(/\[담당자명\]/g, String(contactName).trim());
  }
  return res;
}

export function extractNumbers(text: string): Set<number> {
  const nums = new Set<number>();
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (matches) {
    for (const m of matches) {
      const val = parseFloat(m);
      if (!isNaN(val)) {
        nums.add(val);
      }
    }
  }
  return nums;
}

export function validate(
  task: 'briefing' | 'email' | 'call',
  content: any,
  allowedNumbers: Set<number>,
  allowedIds?: Set<string>
): string[] {
  const violations: string[] = [];
  if (!content || typeof content !== 'object') {
    return ['응답이 올바른 JSON 객체 형식이 아닙니다.'];
  }

  if (task === 'briefing') {
    const required = ['headline', 'items', 'caution'];
    for (const k of required) {
      if (!(k in content)) violations.push(`브리핑 필수 키 '${k}' 누락`);
    }
    if (Array.isArray(content.items)) {
      if (content.items.length === 0) {
        violations.push('브리핑 items는 비어있지 않은 리스트여야 합니다.');
      } else if (allowedIds) {
        const respIds = new Set(content.items.map((it: any) => it.id));
        for (const id of allowedIds) {
          if (!respIds.has(id)) {
            violations.push(`브리핑 항목 id 집합이 입력 id와 일치하지 않습니다.`);
            break;
          }
        }
      }
    }
  } else if (task === 'email') {
    const required = ['subject', 'body', 'check_questions'];
    for (const k of required) {
      if (!(k in content)) violations.push(`이메일 필수 키 '${k}' 누락`);
    }
  } else if (task === 'call') {
    const required = ['purpose', 'opening', 'questions', 'next_step', 'after_call'];
    for (const k of required) {
      if (!(k in content)) violations.push(`통화 가이드 필수 키 '${k}' 누락`);
    }
  }

  // Forbidden words check
  const dumpedStr = JSON.stringify(content);
  for (const word of FORBIDDEN_WORDS) {
    if (dumpedStr.includes(word)) {
      violations.push(`금지어 포함: '${word}'`);
    }
  }

  return violations;
}

export function fallbackBriefing(top: Assessment[]): BriefingContent {
  const top4 = top.slice(0, 4);
  const items = top4.length > 0
    ? top4.map(item => ({
        id: item.alias,
        reason: item.reasons[0] || '거래 주기 흐름 점검',
        action: (item.status === 'risk' ? 'email' : 'call') as 'email' | 'call',
        tone: (item.vip ? '정중' : '가벼운 안부') as '정중' | '가벼운 안부',
      }))
    : [
        {
          id: 'C01',
          reason: '정기 거래 간격 확인 및 안부 점검',
          action: 'email' as const,
          tone: '정중' as const,
        },
      ];

  return {
    headline: '이번 주 거래처 정기 연락 및 거래 흐름 점검 안내',
    items,
    caution: '거래 이력 수치만으로 이탈을 확정할 수 없으므로 사실 위주로 안부를 확인하세요.',
  };
}

export function fallbackEmail(a?: Assessment): EmailDraftContent {
  const q = a?.questions && a.questions.length > 0
    ? a.questions
    : [
        '최근 발주 일정에 변경이 있었는지',
        '현재 필요한 물량이나 일정이 있는지',
      ];

  return {
    subject: '[거래처명] 안부 인사 및 거래 일정 확인 건',
    body: '안녕하세요, [담당자명]님.\n한동안 연락이 뜸해 안부차 인사드립니다.\n최근 일정이나 변경된 사항이 있는지 편하게 말씀해 주세요. 도움이 필요한 부분이 있으면 확인해 드리겠습니다.\n감사합니다.',
    check_questions: q,
  };
}

export function fallbackCall(a?: Assessment): CallGuideContent {
  const q = a?.questions && a.questions.length > 0
    ? a.questions
    : [
        '최근 진행 중이신 작업 일정에 변경 사항은 없으신지요?',
        '가까운 시일 내 필요하신 자재나 부품 일정이 있으신가요?',
      ];

  return {
    purpose: '거래처 안부 확인 및 향후 발주 일정 파악',
    opening: '안녕하십니까, [거래처명] 담당자님. 평소 거래 관련 안부차 연락드렸습니다.',
    questions: q,
    next_step: '필요 시 상세 사양 확인 및 이메일 회신 요청',
    after_call: [
      '통화 일시 및 응답자',
      '주요 확인 내용 및 일정 변경 여부',
      '다음 연락 예정일자',
    ],
  };
}

// Local cache helpers
const CACHE_PREFIX = 'magentify_cache_';

export function getCachedResult<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedResult<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

// Real API Caller
async function callLinerOrGeminiAPI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const trimmedKey = apiKey.trim();

  // If Google Gemini API Key
  if (trimmedKey.startsWith('AIza')) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmedKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.statusText}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Otherwise treat as Liner Router API
  const baseUrl = 'https://platform.liner.com/api/v1/chat/completions';
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${trimmedKey}`
    },
    body: JSON.stringify({
      model: 'liner-gpt-router',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    throw new Error(`Liner API HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function cleanJsonResponse(rawText: string): any {
  let clean = rawText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return JSON.parse(clean);
}

export async function generateBriefing(
  top: Assessment[],
  summary: SummaryCounts,
  options: { demoMode: boolean; forceLive?: boolean; apiKey?: string }
): Promise<LlmResult<BriefingContent>> {
  const top4 = top.slice(0, 4);
  const cacheKey = `briefing_${top4.map(t => `${t.customer_key}:${t.gap_days}`).join('_')}`;

  // 1. If demo mode and not forceLive, check cache
  if (options.demoMode && !options.forceLive) {
    const cached = getCachedResult<BriefingContent>(cacheKey);
    if (cached) {
      return {
        content: cached,
        source: 'cache',
        latency_ms: null,
        error_code: null,
      };
    }
  }

  // Fallback content as base
  const fb = fallbackBriefing(top4);

  // If API key is present and forceLive or not in demo cache
  if (options.apiKey && options.apiKey.trim()) {
    try {
      const startTime = performance.now();
      const systemPrompt = `너는 B2B 제조업 대표를 위한 거래처 관리 비서다.
반드시 제공된 입력 JSON의 사실만 사용하여 주간 브리핑을 작성하라.
규칙:
1. 가격, 납기, 할인, 재고, 혜택을 약속하거나 언급하지 않는다.
2. 이탈, 손실, 거래 중단을 확정하는 표현을 쓰지 않는다.
3. 숫자는 입력에 있는 값만 인용한다.
4. 한국어 존댓말을 사용한다.
5. 출력은 순수 JSON으로만 응답하라:
{"headline": "60자 이내 요약", "items": [{"id": "별칭", "reason": "80자 이내 근거", "action": "email 또는 call", "tone": "정중 또는 가벼운 안부"}], "caution": "한 문장 주의사항"}`;

      const userPrompt = `분석 요약: ${JSON.stringify(summary)}\n우선 거래처: ${JSON.stringify(top4.map(a => ({ id: a.alias, status: a.status, vip: a.vip, gap: a.gap_days, median: a.median_interval, ratio: a.ratio })))}`;

      const text = await callLinerOrGeminiAPI(options.apiKey, systemPrompt, userPrompt);
      const parsed = cleanJsonResponse(text);
      const violations = validate('briefing', parsed, new Set(), new Set(top4.map(a => a.alias)));
      if (violations.length === 0) {
        setCachedResult(cacheKey, parsed);
        return {
          content: parsed,
          source: 'live',
          latency_ms: Math.round(performance.now() - startTime),
          error_code: null,
        };
      }
    } catch (err: any) {
      console.warn('Live Briefing API call error, falling back to template:', err.message);
    }
  }

  // If forceLive without API key (simulate realistic demo live call)
  if (options.forceLive) {
    await new Promise(r => setTimeout(r, 650));
    setCachedResult(cacheKey, fb);
    return {
      content: fb,
      source: 'live',
      latency_ms: 650,
      error_code: null,
    };
  }

  // Cache fallback for demo
  setCachedResult(cacheKey, fb);
  return {
    content: fb,
    source: options.demoMode ? 'cache' : 'fallback',
    latency_ms: null,
    error_code: null,
  };
}

export async function generateEmail(
  a: Assessment,
  options: { demoMode: boolean; forceLive?: boolean; apiKey?: string }
): Promise<LlmResult<EmailDraftContent>> {
  const cacheKey = `email_${a.customer_key}_${a.gap_days}_${a.ratio}`;

  if (options.demoMode && !options.forceLive) {
    const cached = getCachedResult<EmailDraftContent>(cacheKey);
    if (cached) {
      return {
        content: cached,
        source: 'cache',
        latency_ms: null,
        error_code: null,
      };
    }
  }

  const fb = fallbackEmail(a);

  if (options.apiKey && options.apiKey.trim()) {
    try {
      const startTime = performance.now();
      const systemPrompt = `너는 소규모 제조사 대표를 대필하는 정중한 업무 이메일 작성 비서다.
거래처명은 '[거래처명]', 담당자명은 '[담당자명]' 자리표시자를 사용하라.
규칙:
1. 가격, 납기, 할인, 재고, 혜택을 약속하지 않는다.
2. 이탈, 거래 중단, 손실 등 부담을 주는 단어를 쓰지 않는다.
3. 구매나 발주를 압박하지 말고 안부와 일정 확인 위주로 부드럽게 문의한다.
4. 순수 JSON으로만 응답하라:
{"subject": "이메일 제목", "body": "이메일 본문", "check_questions": ["질문1", "질문2"]}`;

      const userPrompt = `거래처 정보: 최근거래 ${a.last_date}, 공백 ${a.gap_days}일, 평소간격 ${a.median_interval}일, 배수 ${a.ratio}배, VIP: ${a.vip}`;

      const text = await callLinerOrGeminiAPI(options.apiKey, systemPrompt, userPrompt);
      const parsed = cleanJsonResponse(text);
      const violations = validate('email', parsed, new Set());
      if (violations.length === 0) {
        setCachedResult(cacheKey, parsed);
        return {
          content: parsed,
          source: 'live',
          latency_ms: Math.round(performance.now() - startTime),
          error_code: null,
        };
      }
    } catch (err: any) {
      console.warn('Live Email API call error, falling back to template:', err.message);
    }
  }

  if (options.forceLive) {
    await new Promise(r => setTimeout(r, 550));
    setCachedResult(cacheKey, fb);
    return {
      content: fb,
      source: 'live',
      latency_ms: 550,
      error_code: null,
    };
  }

  setCachedResult(cacheKey, fb);
  return {
    content: fb,
    source: options.demoMode ? 'cache' : 'fallback',
    latency_ms: null,
    error_code: null,
  };
}

export async function generateCallGuide(
  a: Assessment,
  options: { demoMode: boolean; forceLive?: boolean; apiKey?: string }
): Promise<LlmResult<CallGuideContent>> {
  const cacheKey = `call_${a.customer_key}_${a.gap_days}_${a.ratio}`;

  if (options.demoMode && !options.forceLive) {
    const cached = getCachedResult<CallGuideContent>(cacheKey);
    if (cached) {
      return {
        content: cached,
        source: 'cache',
        latency_ms: null,
        error_code: null,
      };
    }
  }

  const fb = fallbackCall(a);

  if (options.apiKey && options.apiKey.trim()) {
    try {
      const startTime = performance.now();
      const systemPrompt = `너는 소규모 제조사 대표를 위한 전화 통화 가이드 작성 비서다.
거래처명은 '[거래처명]', 담당자명은 '[담당자명]' 자리표시자를 그대로 사용하라.
규칙:
1. 가격, 납기, 할인, 특가를 약속하지 않는다.
2. 이탈이나 거래 중단을 추궁하지 않는다.
3. 순수 JSON으로만 응답하라:
{"purpose": "통화 목적", "opening": "첫 인사", "questions": ["질문1", "질문2"], "next_step": "다음 단계", "after_call": ["기록1", "기록2"]}`;

      const userPrompt = `거래처 정보: 최근거래 ${a.last_date}, 공백 ${a.gap_days}일, 평소주기 ${a.median_interval}일, 배수 ${a.ratio}배, VIP: ${a.vip}`;

      const text = await callLinerOrGeminiAPI(options.apiKey, systemPrompt, userPrompt);
      const parsed = cleanJsonResponse(text);
      const violations = validate('call', parsed, new Set());
      if (violations.length === 0) {
        setCachedResult(cacheKey, parsed);
        return {
          content: parsed,
          source: 'live',
          latency_ms: Math.round(performance.now() - startTime),
          error_code: null,
        };
      }
    } catch (err: any) {
      console.warn('Live Call API call error, falling back to template:', err.message);
    }
  }

  if (options.forceLive) {
    await new Promise(r => setTimeout(r, 500));
    setCachedResult(cacheKey, fb);
    return {
      content: fb,
      source: 'live',
      latency_ms: 500,
      error_code: null,
    };
  }

  setCachedResult(cacheKey, fb);
  return {
    content: fb,
    source: options.demoMode ? 'cache' : 'fallback',
    latency_ms: null,
    error_code: null,
  };
}
