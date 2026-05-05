/**
 * Polaris AI Brief Server
 * ─────────────────────────────────────────────
 * BC카드 마케팅전략팀 — 경제지표 → Claude AI 인사이트 생성 프록시
 *
 * 역할:
 *  1) 브라우저로부터 지표값을 받아
 *  2) Claude Sonnet 4.5 API를 호출해 commentary/insights/industries 생성
 *  3) 메모리에 당일치만 1회 캐싱 (다음날 자정 이후 재호출)
 *
 * ── 사전 설치 ──
 *   npm install
 *   .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 입력
 *
 * ── 실행 ──
 *   npm start
 *   → http://localhost:3001
 *
 * ── 비용 ──
 *   하루 1회 호출 → 월 약 30회
 *   Sonnet 4.5 기준 호출당 약 ₩30~50 → 월 ₩1,500 미만
 */

import express from "express";
import cors from "cors";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 메모리 캐시 (KST 기준 당일치) ──
let cache = { date: null, data: null };

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

// ── 프롬프트 빌더 ──
function buildPrompt(payload) {
  const { date, indicators: ind = {}, signals: sig = {} } = payload;
  const f = (v, d = "—") => (typeof v === "number" ? v.toFixed(2) : d);
  const fp = (v, d = "—") => (typeof v === "number" ? v.toFixed(1) : d);

  const fNum = (v, d = "—") => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : d);

  return `당신은 BC카드 고객사마케팅팀의 시니어 경제·소비 애널리스트입니다.
다음 한국 경제지표를 분석하여, 신용카드 사업 관점의 마케팅 인사이트를 작성하세요.

기준일: ${date}

[주가]
- KOSPI:    ${fNum(ind.KOSPI)}
- KOSDAQ:   ${fNum(ind.KOSDAQ)}
- NASDAQ:   ${fNum(ind.NASDAQ)}
- S&P 500:  ${fNum(ind.SP500)}

[금리·물가]
- 한국 기준금리: ${fp(ind.KR_RATE)}%
- 미국 기준금리: ${fp(ind.US_RATE)}%
- 한국 CPI YoY: ${fp(ind.CPI_KR)}%
- 미국 CPI YoY: ${fp(ind.CPI_US)}%

[환율]
- USD/KRW: ₩${f(ind.USDKRW)}
- JPY/KRW (100엔): ₩${f(ind.JPYKRW)}
- EUR/KRW: ₩${f(ind.EURKRW)}
- CNY/KRW: ₩${f(ind.CNYKRW)}

[원자재]
- WTI 원유: $${f(ind.WTI)}/배럴 (전주 평균 대비 ${fp(sig.wtiChg)}%)
- 금: $${f(ind.GOLD)}/oz
- 구리: $${f(ind.COPPER)}/lb (전월 대비 ${fp(sig.copperChg)}%)

[작성 가이드]
1) **메인 코멘터리** — 3개 문단, 한국 내수·소비 흐름 중심
   - 문단 1: 주가(KOSPI·KOSDAQ) 흐름과 환율·원자재가 가계 자산·소비 심리에 미치는 영향
   - 문단 2: 금리·물가 환경이 카드 결제 패턴(필수재 vs 선택재, 할부 vs 일시불)에 미치는 영향
   - 문단 3: BC카드 마케팅 관점의 종합 진단·핵심 기회 영역
   - 강조어는 <strong> 태그 사용 가능

2) **마케팅 시사점** — 3~4개
   - emoji + 짧은 타이틀 + 1~2문장의 구체 액션
   - 카드사 입장에서 실행 가능한 단계로

3) **10개 업종 플레이북** — 다음 순서 그대로
   주유, 문화, 온라인 쇼핑, 백화점, 마트, 편의점, 항공, 숙박, 가전, 가구
   각 업종마다:
   - signal: "pos" | "neg" | "neu" — 현재 환경에서 카드 매출 성장에 유리/불리/중립
   - signalLabel: 영문 짧은 태그 (예: "COST UP", "GROWTH", "RESILIENT", "DEMAND SOFT", "CAUTIOUS")
   - body: 2~3문장, 구체적 카드 액션 (할인·포인트·할부·캐시백·VIP 혜택 등). <strong> 강조 가능
   - kpi: "KPI · 항목1 · 항목2 · 항목3" 형식 (한글)

[톤앤매너]
- 전문적이면서 명료. 추상어보다 실행 가능한 수준의 구체성
- 단일 지표가 아닌 **복합 시나리오**(예: "환율 안정 + 유가 폭등 + 금리 인하")를 적극 해석
- 룰 기반 분기로 못 잡는 미묘한 신호도 포착

[출력 형식]
JSON 단일 객체로만 응답. 코드블록 표시(\`\`\`)나 다른 설명 없이 순수 JSON.

스키마:
{
  "commentary": ["문단1", "문단2", "문단3"],
  "insights": [
    {"emoji": "💱", "title": "...", "body": "..."},
    ...
  ],
  "industries": [
    {"key": "gas",         "emoji": "⛽",  "title": "주유",       "signal": "...", "signalLabel": "...", "body": "...", "kpi": "..."},
    {"key": "culture",     "emoji": "🎬",  "title": "문화",       ...},
    {"key": "online",      "emoji": "🛒",  "title": "온라인 쇼핑", ...},
    {"key": "dept",        "emoji": "🏬",  "title": "백화점",     ...},
    {"key": "mart",        "emoji": "🏪",  "title": "마트",       ...},
    {"key": "cvs",         "emoji": "🏪",  "title": "편의점",     ...},
    {"key": "airline",     "emoji": "✈️",  "title": "항공",       ...},
    {"key": "hotel",       "emoji": "🏨",  "title": "숙박",       ...},
    {"key": "electronics", "emoji": "📺",  "title": "가전",       ...},
    {"key": "furniture",   "emoji": "🛋️",  "title": "가구",       ...}
  ]
}`;
}

// ── JSON 추출 (혹시 코드블록이 섞여 와도 견고하게) ──
function extractJSON(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) return fence[1];
  const obj = text.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : text;
}

// ── 메인 엔드포인트 ──
app.post("/api/brief", async (req, res) => {
  const today = todayKST();

  // 당일 캐시 히트
  if (cache.date === today && cache.data) {
    return res.json({ ...cache.data, _cached: true, _date: today });
  }

  try {
    const prompt = buildPrompt({ date: today, ...req.body });

    console.log(`[Polaris] Claude 호출 시작 (${today})`);
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].text;
    const json = JSON.parse(extractJSON(raw));

    cache = { date: today, data: json };
    console.log(`[Polaris] 캐시 저장 완료. 입력 ${response.usage.input_tokens} / 출력 ${response.usage.output_tokens} 토큰`);

    res.json({ ...json, _cached: false, _date: today });
  } catch (e) {
    console.error("[Polaris] Claude API 오류:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── 헬스 체크 ──
app.get("/api/health", (_, res) => {
  res.json({ ok: true, cached: cache.date === todayKST(), date: todayKST() });
});

// ── 캐시 강제 무효화 (재호출이 필요할 때) ──
app.post("/api/invalidate", (_, res) => {
  cache = { date: null, data: null };
  res.json({ ok: true, message: "Cache cleared" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✦ Polaris AI Brief Server · http://localhost:${PORT}`);
  console.log(`  - POST /api/brief        → 당일 인사이트 생성 (캐시 자동)`);
  console.log(`  - GET  /api/health       → 상태 확인`);
  console.log(`  - POST /api/invalidate   → 캐시 강제 갱신`);
});
