export interface RawRow {
  source_row: number;
  [key: string]: any;
}

export interface CleanTransaction {
  source_row: number;
  customer: string;
  customer_key: string;
  date: string; // YYYY-MM-DD
  amount: number;
  item: string;
}

export interface QualityIssue {
  source_row: number;
  customer: string;
  date: string;
  reason: string;
}

export interface QualityResult {
  clean_rows: CleanTransaction[];
  issues: QualityIssue[];
  counts: {
    ok: number;
    duplicate: number;
    negative: number;
    invalid: number;
    future: number;
  };
  similar_pairs: [string, string][];
}

export type AssessmentStatus = 'normal' | 'attention' | 'risk' | 'high_risk' | 'hold';

export interface Assessment {
  customer_key: string;
  display_name: string;
  alias: string; // C01...
  txn_days: number;
  first_date: string;
  last_date: string;
  gap_days: number;
  median_interval: number | null;
  ratio: number | null;
  status: AssessmentStatus;
  hold_reason: 'insufficient_data' | 'project_based' | 'invalid_interval' | null;
  confidence: 'high' | 'medium' | null;
  vip: boolean;
  project_based: boolean;
  priority_score: number;
  intervals: number[];
  avg_amount: number | null;
  reasons: string[];
  questions: string[];
}

export interface SummaryCounts {
  normal: number;
  attention: number;
  risk: number;
  high_risk: number;
  hold: number;
}

export interface ColumnMapping {
  customer: string | null;
  date: string | null;
  amount: string | null;
  item: string | null;
}

export interface BriefingItem {
  id: string; // alias like C01
  reason: string;
  action: 'email' | 'call';
  tone: '정중' | '가벼운 안부';
}

export interface BriefingContent {
  headline: string;
  items: BriefingItem[];
  caution: string;
}

export interface EmailDraftContent {
  subject: string;
  body: string;
  check_questions: string[];
}

export interface CallGuideContent {
  purpose: string;
  opening: string;
  questions: string[];
  next_step: string;
  after_call: string[];
}

export interface LlmResult<T = any> {
  content: T;
  source: 'live' | 'cache' | 'fallback';
  latency_ms: number | null;
  error_code: string | null;
  /** live 응답을 만든 공급자 (live일 때만) */
  provider?: 'liner' | 'gemini' | null;
  /** 라우터가 실제로 고른 모델명 (live일 때만) */
  model?: string | null;
  /** 요청한 Router 전략 */
  strategy?: RoutingStrategy | null;
  usage?: TokenUsage | null;
}

export type RoutingStrategy = 'cost' | 'balanced' | 'quality';

export interface TokenUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

/** 업종 동향 검색 결과 한 건 (Liner Search API, 서버에서 걸러진 값) */
export interface NewsItem {
  title: string;
  url: string;
  hostname: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
}

/** 질문하기 답변 (별칭은 화면에서 거래처명으로 바꾼다) */
export interface QaContent {
  answer: string;
  referenced: string[];
}

export type TouchOutcome =
  | 'planned'
  | 'contacted'
  | 'waiting_reply'
  | 'quote_requested'
  | 'reorder_confirmed'
  | 'on_hold'
  | 'not_needed';

/** 접촉 메모에서 뽑은 후속 조치 제안 (저장은 사람이 확인한 뒤에만) */
export interface FollowupContent {
  outcome: TouchOutcome;
  channel: 'email' | 'phone' | 'other' | null;
  next_contact_date: string | null;
  reason: string;
}

export interface ApiLogRecord {
  id: number;
  task: 'briefing' | 'email' | 'call' | 'news' | 'qa' | 'followup';
  provider: 'liner' | 'gemini' | null;
  ok: boolean;
  error_code: string | null;
  latency_ms: number | null;
  created_at: string;
  model?: string | null;
  strategy?: RoutingStrategy | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

export interface DraftRecord {
  id: number;
  customer_key: string;
  kind: 'email' | 'call';
  source: 'live' | 'cache' | 'fallback';
  original_json: any;
  /** live 응답일 때 실제 응답 모델명 */
  model?: string | null;
  /** 이 초안을 만들 때 참고한 업종 동향 기사(제목만 전달됨). 없으면 동향 없이 작성한 초안 */
  news?: NewsItem[] | null;
  news_source?: 'live' | 'cache' | null;
  edited_text: string;
  ref_date: string;
  created_at: string;
  updated_at: string;
}

export interface TouchpointRecord {
  id: number;
  customer_key: string;
  draft_id: number | null;
  contact_date: string;
  channel: 'email' | 'phone' | 'other';
  outcome: 'planned' | 'contacted' | 'waiting_reply' | 'quote_requested' | 'reorder_confirmed' | 'on_hold' | 'not_needed';
  note: string;
  next_contact_date: string | null;
  created_at: string;
  display_name?: string;
  followup_status?: '후속 조치 필요' | '예정';
}

export interface CustomerFlag {
  customer_key: string;
  display_name: string;
  vip: boolean;
  project_based: boolean;
  updated_at: string;
}
