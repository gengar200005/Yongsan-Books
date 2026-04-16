// Cloudflare Worker — 용산 영어책 탐색기 대출 확인 프록시
// 환경변수: DATA4LIB_KEY = 정보나루 API 인증키

let cachedLibs = null;

export default {
  async fetch(request, env) {
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
    const debug = url.searchParams.get('debug');
    const apiKey = env.DATA4LIB_KEY;

    if (!apiKey) {
      return jsonResponse({ error: 'API key not configured' }, 500);
    }

    try {
      if (!cachedLibs) {
        const libUrl = `http://data4library.kr/api/libSrch?authKey=${apiKey}&region=11&dtl_region=11030&pageSize=50&format=json`;
        const resp = await fetch(libUrl);
        const data = await resp.json();
        cachedLibs = (data.response?.libs || []).map(l => ({
          code: l.lib.libCode,
          name: l.lib.libName,
        }));
      }

      if (debug !== null) {
        return jsonResponse({ count: cachedLibs.length, libraries: cachedLibs });
      }

      if (!isbn) {
        return jsonResponse({ error: 'isbn parameter required' }, 400);
      }

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
