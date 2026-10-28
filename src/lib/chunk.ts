// 목록을 나눠서 조회한다. .in(...)에 값이 많으면 주소가 너무 길어지고, 한 번에 받는 줄 수에도 한도가 있다.
export function chunk<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
