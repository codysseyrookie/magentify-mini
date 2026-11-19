import {
  Assessment,
  CleanTransaction,
  ColumnMapping,
  QualityIssue,
  QualityResult,
  SummaryCounts
} from './types';

export const SYNONYMS: Record<string, string[]> = {
  customer: ['거래처', '거래처명', '업체명', '상호', '공급받는자', '고객명', '매출처'],
  date: ['거래일', '거래일자', '일자', '작성일자', '납품일', '주문일'],
  amount: ['금액', '거래금액', '합계금액', '공급가액', '매출액'],
  item: ['품목', '품목명', '품명', '상품명', '제품명'],
};

export function normalizeKey(name: string): string {
  if (!name) return '';
  let s = String(name).trim();
  s = s.replace(/\(주\)/g, '').replace(/㈜/g, '').replace(/주식회사/g, '');
  s = s.replace(/\s+/g, '');
  return s.toLowerCase();
}

export function assignAliases(keys: string[]): Record<string, string> {
  const sorted = Array.from(new Set(keys)).sort();
  const map: Record<string, string> = {};
  sorted.forEach((k, idx) => {
    map[k] = `C${String(idx + 1).padStart(2, '0')}`;
  });
  return map;
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    customer: null,
    date: null,
    amount: null,
    item: null,
  };

  const assigned = new Set<string>();
  const cleanedHeaders: Record<string, string> = {};
  for (const h of headers) {
    cleanedHeaders[h] = h.replace(/\s+/g, '').toLowerCase();
  }

  const fields = ['customer', 'date', 'amount', 'item'] as const;

  // 1st pass: exact match
  for (const field of fields) {
    const syns = SYNONYMS[field];
    for (const h of headers) {
      if (assigned.has(h)) continue;
      if (syns.includes(cleanedHeaders[h])) {
        mapping[field] = h;
        assigned.add(h);
        break;
      }
    }
  }

  // 2nd pass: substring match
  for (const field of fields) {
    if (mapping[field] !== null) continue;
    const syns = SYNONYMS[field];
    for (const h of headers) {
      if (assigned.has(h)) continue;
      const cleanH = cleanedHeaders[h];
      for (const syn of syns) {
        if (cleanH.includes(syn)) {
          mapping[field] = h;
          assigned.add(h);
          break;
        }
      }
      if (mapping[field] !== null) break;
    }
  }

  return mapping;
}

export function parseDateString(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  // Match standard YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  const m = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) {
    // Try Date.parse
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Additional calendar day check
  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.9;

  const pairs1 = getBigrams(str1);
  const pairs2 = getBigrams(str2);
  const union = pairs1.length + pairs2.length;
  if (union === 0) return 0.0;

  let hits = 0;
  for (const x of pairs1) {
    const idx = pairs2.indexOf(x);
    if (idx >= 0) {
      hits++;
      pairs2.splice(idx, 1);
    }
  }
  return (2.0 * hits) / union;
}

function getBigrams(str: string): string[] {
  const s = str.toLowerCase();
  const v = [];
  for (let i = 0; i < s.length - 1; i++) {
    v.push(s.slice(i, i + 2));
  }
  return v;
}

export function buildClean(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping,
  refDateStr: string
): QualityResult {
  const colCust = mapping.customer;
  const colDate = mapping.date;
  const colAmt = mapping.amount;
  const colItem = mapping.item;

  if (!colCust || !colDate || colCust === colDate) {
    throw new Error('거래처와 거래일 열을 모두 지정해야 하며 서로 다른 열이어야 합니다.');
  }

  const issues: QualityIssue[] = [];
  const cleanRows: CleanTransaction[] = [];
  const counts = {
    ok: 0,
    duplicate: 0,
    negative: 0,
    invalid: 0,
    future: 0,
  };

  const seenDuplicates = new Set<string>();

  rawRows.forEach((row, idx) => {
    const sourceRow = idx + 2; // header is row 1
    const rawCust = row[colCust];
    const rawDate = row[colDate];
    const rawAmt = colAmt ? row[colAmt] : null;
    const rawItem = colItem ? row[colItem] : '';

    // 1. Missing customer
    if (!rawCust || String(rawCust).trim() === '') {
      counts.invalid++;
      issues.push({
        source_row: sourceRow,
        customer: rawCust || '',
        date: rawDate || '',
        reason: '거래처명 누락',
      });
      return;
    }

    const custStr = String(rawCust).trim().replace(/\s+/g, ' ');
    const custKey = normalizeKey(custStr);

    // 2. Missing or invalid date
    if (!rawDate || String(rawDate).trim() === '') {
      counts.invalid++;
      issues.push({
        source_row: sourceRow,
        customer: custStr,
        date: '',
        reason: '거래일자 누락',
      });
      return;
    }

    const txnDate = parseDateString(rawDate);
    if (!txnDate) {
      counts.invalid++;
      issues.push({
        source_row: sourceRow,
        customer: custStr,
        date: String(rawDate),
        reason: '날짜 변환 실패',
      });
      return;
    }

    // 3. Amount parsing
    let amountVal = 0;
    if (rawAmt !== null && rawAmt !== undefined && String(rawAmt).trim() !== '') {
      const amtClean = String(rawAmt).replace(/[,원₩\s]/g, '');
      const parsed = parseFloat(amtClean);
      if (!isNaN(parsed)) {
        amountVal = Math.round(parsed);
      }
    }

    const itemStr = rawItem ? String(rawItem).trim() : '';

    // 4. Check exact duplicate
    const dupSig = `${custKey}|${txnDate}|${amountVal}|${itemStr}`;
    if (seenDuplicates.has(dupSig)) {
      counts.duplicate++;
      issues.push({
        source_row: sourceRow,
        customer: custStr,
        date: txnDate,
        reason: '완전 중복 (이전 행과 동일)',
      });
      return;
    }
    seenDuplicates.add(dupSig);

    // 5. Negative amount (cancellation candidate)
    if (amountVal < 0) {
      counts.negative++;
      issues.push({
        source_row: sourceRow,
        customer: custStr,
        date: txnDate,
        reason: '취소 후보 (음수 금액)',
      });
      return;
    }

    // 6. Future date beyond refDate
    if (txnDate > refDateStr) {
      counts.future++;
      issues.push({
        source_row: sourceRow,
        customer: custStr,
        date: txnDate,
        reason: `기준일(${refDateStr}) 이후 미래 날짜`,
      });
      return;
    }

    // OK
    counts.ok++;
    cleanRows.push({
      source_row: sourceRow,
      customer: custStr,
      customer_key: custKey,
      date: txnDate,
      amount: amountVal,
      item: itemStr,
    });
  });

  // 7. Check similar customer names
  const similarPairs: [string, string][] = [];
  if (cleanRows.length > 0) {
    const keyMap = new Map<string, string>();
    for (const r of cleanRows) {
      if (!keyMap.has(r.customer_key)) {
        keyMap.set(r.customer_key, r.customer);
      }
    }

    const keyList = Array.from(keyMap.keys()).sort();
    for (let i = 0; i < keyList.length; i++) {
      for (let j = i + 1; j < keyList.length; j++) {
        const k1 = keyList[i];
        const k2 = keyList[j];
        const isSub = k1.includes(k2) || k2.includes(k1);
        const sim = stringSimilarity(k1, k2);
        if (isSub || sim >= 0.85) {
          similarPairs.push([keyMap.get(k1)!, keyMap.get(k2)!]);
        }
      }
    }
  }

  return {
    clean_rows: cleanRows,
    issues,
    counts,
    similar_pairs: similarPairs,
  };
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function dayDiff(d1: string, d2: string): number {
  const ms1 = new Date(d1 + 'T00:00:00Z').getTime();
  const ms2 = new Date(d2 + 'T00:00:00Z').getTime();
  return Math.round((ms1 - ms2) / (1000 * 60 * 60 * 24));
}

export function analyze(
  cleanRows: CleanTransaction[],
  flags: Record<string, { vip: boolean; project_based: boolean }>,
  refDateStr: string
): Assessment[] {
  if (cleanRows.length === 0) return [];

  // Group by (customer_key, date): sum amount
  const grouped = new Map<string, {
    customer_key: string;
    customer: string;
    date: string;
    amount: number;
    item: string;
  }>();

  for (const r of cleanRows) {
    const gKey = `${r.customer_key}|${r.date}`;
    const existing = grouped.get(gKey);
    if (!existing) {
      grouped.set(gKey, {
        customer_key: r.customer_key,
        customer: r.customer,
        date: r.date,
        amount: r.amount,
        item: r.item,
      });
    } else {
      existing.amount += r.amount;
    }
  }

  // Group by customer_key
  const byCust = new Map<string, typeof grouped extends Map<any, infer V> ? V[] : never>();
  for (const item of grouped.values()) {
    if (!byCust.has(item.customer_key)) {
      byCust.set(item.customer_key, []);
    }
    byCust.get(item.customer_key)!.push(item);
  }

  const allKeys = Array.from(byCust.keys()).sort();
  const aliasMap = assignAliases(allKeys);

  const assessments: Assessment[] = [];

  for (const custKey of allKeys) {
    const txns = byCust.get(custKey)!;
    txns.sort((a, b) => a.date.localeCompare(b.date));

    const displayName = txns[0].customer;
    const alias = aliasMap[custKey];
    const txnDays = txns.length;
    const firstDate = txns[0].date;
    const lastDate = txns[txns.length - 1].date;
    const gapDays = dayDiff(refDateStr, lastDate);

    // Calculate intervals between consecutive dates
    const intervals: number[] = [];
    for (let i = 0; i < txns.length - 1; i++) {
      const diff = dayDiff(txns[i + 1].date, txns[i].date);
      intervals.push(diff);
    }

    const medianInterval = intervals.length >= 1 ? calculateMedian(intervals) : null;

    // 가장 자주 주문한 품목(동률이면 최근 품목). 품목 열이 없으면 null.
    const itemCount = new Map<string, { n: number; last: string }>();
    for (const t of txns) {
      const it = (t.item || '').trim();
      if (!it) continue;
      const cur = itemCount.get(it);
      itemCount.set(it, { n: (cur?.n ?? 0) + 1, last: t.date });
    }
    let mainItem: string | null = null;
    let best = { n: 0, last: '' };
    for (const [it, v] of itemCount) {
      if (v.n > best.n || (v.n === best.n && v.last > best.last)) {
        mainItem = it;
        best = v;
      }
    }

    const totalAmt = txns.reduce((acc, t) => acc + t.amount, 0);
    const avgAmount = txns.length > 0 ? Math.round(totalAmt / txns.length) : null;

    const flag = flags[custKey] || { vip: false, project_based: false };
    const isVip = Boolean(flag.vip);
    const isProject = Boolean(flag.project_based);

    // Classification logic (PRD 4.3~4.4)
    let status: Assessment['status'] = 'normal';
    let holdReason: Assessment['hold_reason'] = null;
    let confidence: Assessment['confidence'] = null;
    let ratio: number | null = null;

    if (txnDays < 5 && isProject) {
      status = 'hold';
      holdReason = 'insufficient_data';
    } else if (txnDays < 5) {
      status = 'hold';
      holdReason = 'insufficient_data';
    } else if (isProject) {
      status = 'hold';
      holdReason = 'project_based';
    } else if (medianInterval === null || medianInterval <= 0) {
      status = 'hold';
      holdReason = 'invalid_interval';
    } else {
      // Calculate ratio
      ratio = Math.round((gapDays / medianInterval) * 100) / 100;

      // Confidence
      confidence = txnDays >= 10 ? 'high' : 'medium';

      // Status buckets
      if (ratio <= 1.5) {
        status = 'normal';
      } else if (ratio < 2.0) {
        status = 'attention';
      } else if (ratio < 3.0) {
        status = 'risk';
      } else {
        status = 'high_risk';
      }
    }

    // Priority score: normal, hold = 0, otherwise attention=1, risk=2, high_risk=3, +1.5 if VIP
    let priorityScore = 0.0;
    if (status !== 'normal' && status !== 'hold') {
      const scores: Record<string, number> = {
        attention: 1.0,
        risk: 2.0,
        high_risk: 3.0,
      };
      priorityScore = (scores[status] || 0) + (isVip ? 1.5 : 0);
    }

    // Reasons template
    const reasons: string[] = [];
    if (status === 'hold') {
      if (holdReason === 'insufficient_data') {
        reasons.push(`거래일 수 ${txnDays}일로 분석 기준(5일 이상)에 미달하여 판단을 보류합니다.`);
      } else if (holdReason === 'project_based') {
        reasons.push('비정기 프로젝트성 거래처로 지정되어 주기 분석 대상에서 제외되었습니다.');
      } else {
        reasons.push('거래 간격 계산이 유효하지 않아 판단을 보류합니다.');
      }
    } else {
      const intStr = medianInterval ? String(Math.round(medianInterval)) : '-';
      const ratioStr = ratio !== null ? String(ratio) : '-';
      reasons.push(`최근 거래일 ${lastDate}, 공백 ${gapDays}일, 평소 간격 ${intStr}일의 ${ratioStr}배`);
    }

    // Verification questions (2 questions per status)
    let questions: string[] = [];
    if (status === 'high_risk' || status === 'risk') {
      questions = [
        '최근 발주 일정이나 프로젝트 계획에 변경 사항이 있었는지 확인',
        '현재 필요한 물량이나 재고 소진 시점이 언제인지 파악',
      ];
    } else if (status === 'attention') {
      questions = [
        '최근 거래 흐름이나 공정 일정에 지연 사항이 없는지 확인',
        '다음 발주 예상 일정이나 보완 필요한 품목 파악',
      ];
    } else if (status === 'normal') {
      questions = [
        '정기 거래 범위 내에서 원활하게 주문이 유지되고 있는지 점검',
        '특이사항 발생 여부 주기적 모니터링',
      ];
    } else {
      questions = [
        '정기 발주 업체인지 또는 일회성 프로젝트성 거래처인지 거래 유형 확인',
        '추후 정기 거래 계획 및 담당자 연락선 업데이트 필요',
      ];
    }

    assessments.push({
      customer_key: custKey,
      display_name: displayName,
      alias,
      txn_days: txnDays,
      first_date: firstDate,
      last_date: lastDate,
      gap_days: gapDays,
      median_interval: medianInterval,
      ratio,
      status,
      hold_reason: holdReason,
      confidence,
      vip: isVip,
      project_based: isProject,
      priority_score: priorityScore,
      intervals,
      main_item: mainItem,
      avg_amount: avgAmount,
      reasons,
      questions,
    });
  }

  return assessments;
}

export function prioritize(items: Assessment[]): Assessment[] {
  const targets = items.filter(a => a.status !== 'normal' && a.status !== 'hold');
  return [...targets].sort((a, b) => {
    if (b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }
    const rB = b.ratio ?? 0;
    const rA = a.ratio ?? 0;
    return rB - rA;
  });
}

export function summarize(items: Assessment[]): SummaryCounts {
  const counts: SummaryCounts = {
    normal: 0,
    attention: 0,
    risk: 0,
    high_risk: 0,
    hold: 0,
  };
  for (const a of items) {
    if (a.status in counts) {
      counts[a.status]++;
    }
  }
  return counts;
}
