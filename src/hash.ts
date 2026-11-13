/** 캐시 키용 짧은 해시(djb2 변형). 같은 문자열이면 항상 같은 값. 보안 용도가 아니다. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
