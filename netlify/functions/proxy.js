/**
 * Polaris CORS Proxy — Netlify Function
 * ────────────────────────────────────────
 * 경로: /.netlify/functions/proxy?url=<encoded_url>
 *
 * 외부 CORS 프록시(corsproxy.io 등)가 production에서 차단되는 문제 해결.
 * 서버 사이드에서 임의 URL을 받아 그대로 프록싱해 돌려줍니다.
 *
 * 주의: 신뢰 가능한 도메인 화이트리스트로 제한해 abuse 방지.
 */

const ALLOWED_HOSTS = [
  "stooq.com",
  "news.google.com",
  "ecos.bok.or.kr",
  "api.stlouisfed.org",
  "www.alphavantage.co",
  "open.er-api.com",
  "api.gold-api.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
];

export default async (req) => {
  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("url");

  if (!target) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  // 화이트리스트 검증
  const hostOk = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  if (!hostOk) {
    return new Response(`Host not allowed: ${parsed.hostname}`, { status: 403 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PolarisBot/1.0)",
        "Accept": "application/json, text/xml, text/csv, */*",
      },
    });
    const body        = await res.text();
    const contentType = res.headers.get("content-type") || "text/plain";

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",   // 5분 엣지 캐시
      },
    });
  } catch (e) {
    return new Response(`Proxy fetch failed: ${e.message}`, { status: 502 });
  }
};
