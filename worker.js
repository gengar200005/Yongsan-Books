// Cloudflare Worker — 용산 영어책 탐색기 대출 확인 프록시

const LIB_SEARCHES = ['용산도서관', '남산도서관', '용산꿈나무', '용암어린이영어', '청파도서관', '청파어린이영어'];
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
      // 도서관 코드 조회 (이름 기반, 캐시)
      if (!cachedLibs) {
        cachedLibs = [];
        const searches = await Promise.all(
          LIB_SEARCHES.map(async (name) => {
            const libUrl = `http://data4library.kr/api/libSrch?authKey=${apiKey}&libName=${encodeURIComponent(name)}&pageSize=10&format=json`;
            const resp = await fetch(libUrl);
            const data = await resp.json();
            return (data.response?.libs || []).map(l => ({
              code: l.lib.libCode,
              name: l.lib.libName,
              address: l.lib.address || '',
            }));
          })
        );
        // 용산구 도서관만 필터 (주소에 용산 포함)
        const all = searches.flat();
        const seen = new Set();
        for (const lib of all) {
          if (!seen.has(lib.code) && (lib.address.includes('용산') || lib.name.includes('용산') || lib.name.includes('남산'))) {
            cachedLibs.push(lib);
            seen.add(lib.code);
          }
        }
      }

      // 디버그 모드: 발견된 도서관 목록 반환
      if (debug !== null) {
        return jsonResponse({ libraries: cachedLibs });
      }

      if (!isbn) {
        return jsonResponse({ error: 'isbn parameter required' }, 400);
      }

      // 각 도서관별 대출 가능 여부 조회 (병렬)
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
