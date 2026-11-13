// 제출 전 키 문자열 검사: `npm run check:secrets`
// 저장소(소스, 문서, 캐시 JSON 포함)에 API 키로 보이는 문자열이 있으면 종료 코드 1로 끝난다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', 'coverage']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.csv', '.txt', '.yml', '.yaml', '.example', '.env',
]);

const PATTERNS = [
  { name: 'sk- 형식 키', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Google API 키(AIza...)', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Bearer 토큰', re: /Bearer\s+[A-Za-z0-9._-]{24,}/g },
  { name: 'LINER_API_KEY 값 대입', re: /LINER_API_KEY\s*[=:]\s*["']?[A-Za-z0-9._-]{8,}/g },
  { name: 'GEMINI_API_KEY 값 대입', re: /GEMINI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9._-]{8,}/g },
];

// 테스트용 가짜 키(tests/ 안의 sk-test-...)는 허용한다.
const ALLOW_LINE = /sk-test-/;

const hits = [];
let scanned = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      // .env 실파일은 저장소에 포함되지 않아야 하므로 별도로 경고한다.
      if (/^\.env(\.|$)/.test(entry.name) && entry.name !== '.env.example') {
        hits.push({ file: path.relative(ROOT, path.join(dir, entry.name)), line: 0, name: '.env 파일이 폴더에 있음 (.gitignore로 제외되는지 확인)', warn: true });
        continue;
      }
      const ext = path.extname(entry.name) || entry.name;
      if (!TEXT_EXT.has(ext) && !TEXT_EXT.has(entry.name)) continue;
      scan(path.join(dir, entry.name));
    }
  }
}

function scan(file) {
  scanned++;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (ALLOW_LINE.test(text)) return;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      if (p.re.test(text)) {
        hits.push({ file: path.relative(ROOT, file), line: i + 1, name: p.name });
      }
    }
  });
}

walk(ROOT);

const errors = hits.filter(h => !h.warn);
const warns = hits.filter(h => h.warn);
for (const w of warns) console.log(`[경고] ${w.file}: ${w.name}`);
for (const h of errors) console.log(`[키 의심] ${h.file}:${h.line}  ${h.name}`);
console.log(`검사 파일 ${scanned}개, 키 의심 ${errors.length}건, 경고 ${warns.length}건`);
process.exit(errors.length > 0 ? 1 : 0);
