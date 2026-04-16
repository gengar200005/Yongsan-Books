// Cloudflare Worker — 용산 영어책 탐색기 대출 확인 프록시
// 배포: Cloudflare Dashboard → Workers & Pages → Create Worker → 이 코드 붙여넣기
// 환경변수: DATA4LIB_KEY = 정보나루 API 인증키

const REGION = '11020'; // 용산구
let cachedLibs = null;

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const isbn = url.searchParams.get('isbn');
    const apiKey = env.DATA4LIB_KEY;

    if (!isbn) {
      return jsonResponse({ error: 'isbn parameter required' }, 400);
    }

    if (!apiKey) {
      return jsonResponse({ error: 'API key not configured' }, 500);
    }

    try {
      // 1. 도서관 코드 조회 (캐시)
      if (!cachedLibs) {
        const libUrl = `http://data4library.kr/api/libSrch?authKey=${apiKey}&dtl_region=${REGION}&pageSize=30&format=json`;
        const libResp = await fetch(libUrl);
        const libData = await libResp.json();
        cachedLibs = (libData.response?.libs || []).map(l => ({
          code: l.lib.libCode,
          name: l.lib.libName,
        }));
      }

      // 2. 각 도서관별 대출 가능 여부 조회 (병렬)
      const checks = await Promise.all(
        cachedLibs.map(async (lib) => {
          const checkUrl = `http://data4library.kr/api/bookExist?authKey=${apiKey}&isbn13=${isbn}&libCode=${lib.code}&format=json`;
          const resp = await fetch(checkUrl);
          const data = await resp.json();
          const result = data.response?.result || {};
          return {
            name: lib.name,
            code: lib.code,
            hasBook: result.hasBook === 'Y',
            loanAvailable: result.loanAvailable === 'Y',
          };
        })
      );

      // 3. 소장 도서관만 반환
      const results = checks.filter(r => r.hasBook);

      return jsonResponse({ isbn, results });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
