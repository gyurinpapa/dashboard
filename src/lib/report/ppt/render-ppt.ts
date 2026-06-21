// src/lib/report/ppt/render-ppt.ts

import pptxgen from "pptxgenjs";
import type {
  PptChartData,
  PptKpi,
  PptReportDeck,
  PptSlide,
  PptSourceSummary,
  PptTableData,
} from "./build-ppt-data";
import type {
  PptDeckInsightText,
  PptSlideInsightText,
} from "./build-ppt-insights";
import { getPptSlideInsightText } from "./build-ppt-insights";

export type RenderPptParams = {
  deck: PptReportDeck;
  insights: PptDeckInsightText;
  fileName?: string;
};

const PPT_W = 13.333;
const PPT_H = 7.5;

const COLOR = {
  bg: "FFFFFF",
  paper: "FFFFFF",

  ink: "0B1F33",
  sub: "4A5560",
  muted: "7A8793",

  line: "D6DCE3",
  lineSoft: "E9EEF3",

  blue: "0B1F33",
  blueDark: "1B3A5B",
  blueSoft: "EEF2F5",

  cream: "F3E4D2",
  creamSoft: "FAF6EF",

  grayWarm: "CFC2B1",

  green: "0E6E5C",
  greenSoft: "E8F4F0",

  amber: "E67635",
  amberSoft: "FBECE3",

  red: "B42318",
  redSoft: "FEECEC",

  blackStrong: "111111",

  navy: "0B1F33",
  navySoft: "132A43",
  deepBlue: "1B3A5B",
  teal: "2A8A8F",
  orange: "E67635",
  tableHead: "EEF2F5",
  tableAlt: "F8FAFC",
  white: "FFFFFF",
};

const FONT = {
  head: "Gmarket Sans Medium",
  body: "Gmarket Sans Medium",
};

const SHAPE = {
  rect: "rect" as any,
  roundRect: "roundRect" as any,
  line: "line" as any,
  ellipse: "ellipse" as any,
};

const SOURCE_PILL_H = 0.36;
const SOURCE_PILL_FONT_SIZE = 9.4;

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function safeFileName(v: any) {
  const raw = asStr(v) || "Etrylue_Performance_Report";
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.toLowerCase().endsWith(".pptx")
    ? cleaned
    : `${cleaned}.pptx`;
}

function truncateText(v: any, max = 42) {
  const s = asStr(v);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

function toNumber(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const n = Number(
    String(v ?? "")
      .replace(/[₩,%\s]/g, "")
      .replace(/,/g, "")
      .trim(),
  );

  return Number.isFinite(n) ? n : 0;
}

function formatChartValue(v: any, label?: string) {
  const value = toNumber(v);
  const key = `${asStr(label)}`.toLowerCase();

  if (
    key.includes("cost") ||
    key.includes("revenue") ||
    key.includes("cpc") ||
    key.includes("cpa") ||
    key.includes("비용") ||
    key.includes("매출") ||
    key.includes("광고비")
  ) {
    const n = Math.round(value);
    const abs = Math.abs(n);

    if (abs >= 100000000) {
      return `₩${(n / 100000000).toFixed(abs >= 1000000000 ? 1 : 2)}억`;
    }

    if (abs >= 10000) {
      return `₩${(n / 10000).toFixed(abs >= 100000 ? 0 : 1)}만`;
    }

    return `₩${n.toLocaleString("ko-KR")}`;
  }

  if (
    key.includes("roas") ||
    key.includes("ctr") ||
    key.includes("cvr") ||
    key.includes("%")
  ) {
    return `${Math.round(value).toLocaleString("ko-KR")}%`;
  }

  return Math.round(value).toLocaleString("ko-KR");
}

function formatGeneratedAt(iso?: string) {
  const raw = asStr(iso);
  const d = raw ? new Date(raw) : new Date();

  if (Number.isNaN(d.getTime())) return raw || new Date().toISOString();

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function uniqueNonEmptyTexts(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const text = asStr(value).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

function splitExecutiveKeyMessage(message: string) {
  const text = asStr(message).replace(/\s+/g, " ").trim();

  if (!text) {
    return {
      current: "",
      next: "",
    };
  }

  const nextMatch = text.match(/(?:다음\s*운영|다음달|다음월|익월)/);

  if (nextMatch && typeof nextMatch.index === "number" && nextMatch.index > 0) {
    const current = text.slice(0, nextMatch.index).trim();
    const next = text.slice(nextMatch.index).trim();

    return {
      current,
      next,
    };
  }

  const sentences = text
    .split(/(?<=[.!?。]|다\.)\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length >= 2) {
    return {
      current: sentences[0],
      next: sentences.slice(1).join(" "),
    };
  }

  return {
    current: text,
    next: "다음 운영 방향 정교화 검토.",
  };
}

function buildHighlightedRuns(line: string, mode: "current" | "next") {
  const text = asStr(line);
  if (!text) return [{ text: "" }];

  const regex =
  /(₩?[0-9,]+(?:\.[0-9]+)?(?:만|억)?원?|ROAS\s*[0-9,]+(?:\.[0-9]+)?%|[0-9,]+(?:\.[0-9]+)?%|[0-9]{4}-[0-9]{2}|[0-9]+월|다음달|다음 운영|매출|전환|CPA|CPC|CTR|ROAS|캠페인|키워드|소재|기기|요일|그룹|정교화|확대|축소|비용|저효율|재배분|유지)/g;

  const runs: { text: string; options?: any }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const value = match[0];

    if (index > lastIndex) {
      runs.push({
        text: text.slice(lastIndex, index),
      });
    }

    let color = COLOR.white;

    if (
      value.includes("₩") ||
      value.includes("ROAS") ||
      value.includes("%") ||
      /[0-9]+월/.test(value) ||
      /[0-9]{4}-[0-9]{2}/.test(value)
    ) {
      color = mode === "current" ? COLOR.orange : COLOR.teal;
    } else if (
      value.includes("다음달") ||
      value.includes("다음 운영") ||
      value.includes("캠페인") ||
      value.includes("키워드") ||
      value.includes("소재") ||
      value.includes("기기") ||
      value.includes("요일") ||
      value.includes("그룹") ||
      value.includes("정교화") ||
      value.includes("확대") ||
      value.includes("축소") ||
      value.includes("비용") ||
      value.includes("재배분") ||
      value.includes("유지") ||
      value.includes("저효율")
    ) {
      color = mode === "current" ? COLOR.orange : COLOR.orange;
    }

    runs.push({
      text: value,
      options: {
        color,
        bold: true,
      },
    });

    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    runs.push({
      text: text.slice(lastIndex),
    });
  }

  return runs;
}

function normalizeShortActionLine(value: string) {
  let text = asStr(value).replace(/\s+/g, " ").trim();
  if (!text) return "";

  text = text
    .replace(/해야 하는 구간입니다\.?/g, "필요 구간.")
    .replace(/해야 합니다\.?/g, ".")
    .replace(/해야 해\.?/g, ".")
    .replace(/필요합니다\.?/g, "필요.")
    .replace(/권장합니다\.?/g, "권장.")
    .replace(/유효합니다\.?/g, "유효.")
    .replace(/가능합니다\.?/g, "가능.")
    .replace(/나타날 수 있으므로/g, "차이 발생.")
    .replace(/집계됩니다\.?/g, "집계.")
    .replace(/확인합니다\.?/g, "확인.")
    .replace(/점검합니다\.?/g, "점검.")
    .replace(/유지합니다\.?/g, "유지.")
    .replace(/강화합니다\.?/g, "강화.")
    .replace(/확대합니다\.?/g, "확대.")
    .replace(/축소합니다\.?/g, "축소.")
    .replace(/운영합니다\.?/g, "운영.")
    .replace(/개선합니다\.?/g, "개선.")
    .replace(/관리합니다\.?/g, "관리.")
    .replace(/분리합니다\.?/g, "분리.")
    .replace(/정리합니다\.?/g, "정리.")
    .replace(/재배분합니다\.?/g, "재배분.")
    .replace(/재활용합니다\.?/g, "재활용.")
    .replace(/조정합니다\.?/g, "조정.")
    .replace(/설계합니다\.?/g, "설계.")
    .replace(/실행합니다\.?/g, "실행.")
    .replace(/반영합니다\.?/g, "반영.")
    .replace(/활용합니다\.?/g, "활용.")
    .replace(/입니다\.?/g, ".")
    .replace(/합니다\.?/g, ".")
    .replace(/\s*\.\s*\.\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(/([.!?])\s+([.!?])/g, "$1").trim();

  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}

function pptTone(value: any) {
  return normalizeShortActionLine(asStr(value));
}

function pptToneList(values: string[]) {
  return (values ?? []).map((value) => pptTone(value)).filter(Boolean);
}

function buildExecutiveActionLines(item: any) {
  const explicit = Array.isArray(item?.nextActions)
    ? item.nextActions
        .map((value: any) => normalizeShortActionLine(asStr(value)))
        .filter(Boolean)
    : [];

  if (explicit.length >= 3) {
    return explicit.slice(0, 3);
  }

  const headline = asStr(item?.headline);
  const nextDirection = asStr(item?.nextDirection);
  const sourceName = asStr(item?.displayName || item?.source || "해당 매체");
  const raw = `${headline} ${nextDirection}`;

  const autoLines: string[] = [];

  if (/ROAS|고효율|매출|효율/.test(raw)) {
    autoLines.push("고효율 구간 예산 확대 검토.");
  }

  if (/저효율|비용|낮은|부진/.test(raw)) {
    autoLines.push("저효율 구간 우선 정리.");
  }

  if (/소재|메시지|랜딩/.test(raw)) {
    autoLines.push("소재·메시지 연결 구조 재정비.");
  }

  if (/전환|구매/.test(raw)) {
    autoLines.push("전환 기여 구간 집중 강화.");
  }

  if (/유입|클릭/.test(raw)) {
    autoLines.push("유입 구간 효율 재점검.");
  }

  if (/브랜드|검색|키워드/.test(raw)) {
    autoLines.push("핵심 키워드 중심 운영 검토.");
  }

  const fallback = [
    `${sourceName} 반응 구간 확대 검토.`,
    `${sourceName} 저효율 구간 축소 검토.`,
    `${sourceName} 타겟·소재 세분화 운영.`,
  ];

  return uniqueNonEmptyTexts([
    ...explicit,
    ...autoLines.map(normalizeShortActionLine),
    ...fallback.map(normalizeShortActionLine),
  ]).slice(0, 3);
}

function safeNormalizedValue(value: number, maxValue: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 0;

  return Math.min(1, value / maxValue);
}

function addPageBackground(slide: pptxgen.Slide, fill = COLOR.bg) {
  slide.background = { color: fill };

  slide.addShape(SHAPE.rect, {
    x: 0,
    y: 0,
    w: PPT_W,
    h: PPT_H,
    fill: { color: fill },
    line: { color: fill },
  });
}

function addCard(args: {
  slide: pptxgen.Slide;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  line?: string;
  radius?: number;
}) {
  const {
    slide,
    x,
    y,
    w,
    h,
    fill = COLOR.paper,
    line = COLOR.lineSoft,
    radius = 0.08,
  } = args;

  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: line, width: 0.8 },
  });
}

function addSectionLabel(args: {
  slide: pptxgen.Slide;
  label: string;
  x: number;
  y: number;
  w: number;
  color?: string;
  size?: number;
}) {
  const { slide, label, x, y, w, color = COLOR.blue, size = 6.5 } = args;

  slide.addText(label.toUpperCase(), {
    x,
    y,
    w,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: size,
    bold: true,
    color,
    margin: 0,
    fit: "shrink",
  });
}

function addTemplateHeader(args: {
  slide: pptxgen.Slide;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  pageNo?: number;
  totalPages?: number;
}) {
  const { slide, eyebrow, title, subtitle, pageNo, totalPages } = args;

  slide.addText(asStr(eyebrow) || "ETRYLUE PERFORMANCE", {
    x: 0.58,
    y: 0.3,
    w: 5.8,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 9.2,
    bold: true,
    color: COLOR.orange,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(truncateText(title, 52), {
    x: 0.58,
    y: 0.63,
    w: 9.3,
    h: 0.42,
    fontFace: FONT.head,
    fontSize: 24,
    bold: true,
    color: COLOR.navy,
    margin: 0,
    fit: "shrink",
  });

  if (subtitle) {
    slide.addText(truncateText(subtitle, 110), {
      x: 0.58,
      y: 1.13,
      w: 10.2,
      h: 0.22,
      fontFace: FONT.body,
      fontSize: 9.5,
      color: COLOR.sub,
      margin: 0,
      fit: "shrink",
    });
  }


  slide.addShape(SHAPE.line, {
    x: 0.58,
    y: 1.46,
    w: 12.18,
    h: 0,
    line: { color: COLOR.navy, width: 1.1, transparency: 10 },
  });
}

function addFooter(args: {
  slide: pptxgen.Slide;
  deck: PptReportDeck;
  pageNo?: number;
  totalPages?: number;
}) {
  const { slide, deck, pageNo, totalPages } = args;

  slide.addShape(SHAPE.line, {
    x: 0.58,
    y: 7.06,
    w: 12.18,
    h: 0,
    line: { color: COLOR.lineSoft, width: 0.7 },
  });

  slide.addText("Etrylue Performance", {
    x: 0.58,
    y: 7.2,
    w: 2.5,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6.5,
    bold: true,
    color: COLOR.blue,
    margin: 0,
  });


  if (pageNo && totalPages) {
    slide.addText(`${String(pageNo).padStart(2, "0")} / ${totalPages}`, {
      x: 11.65,
      y: 7.2,
      w: 1.05,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 6,
      color: COLOR.muted,
      align: "right",
      margin: 0,
    });
  }
}

function addCoverSlide(pptxDoc: pptxgen, deck: PptReportDeck) {
  const slide = pptxDoc.addSlide();
  addPageBackground(slide, COLOR.white);

  slide.addShape(SHAPE.rect, {
    x: 0,
    y: 0,
    w: PPT_W,
    h: PPT_H,
    fill: { color: COLOR.white },
    line: { color: COLOR.white },
  });

  slide.addShape(SHAPE.rect, {
    x: 0,
    y: 0,
    w: 0.16,
    h: PPT_H,
    fill: { color: COLOR.navy },
    line: { color: COLOR.navy },
  });

  slide.addText("ETRYLUE · MONTHLY REVIEW", {
    x: 0.72,
    y: 0.8,
    w: 6.6,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 10.2,
    bold: true,
    color: COLOR.navy,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(
    `${deck.advertiserName || "광고주"} 광고 성과 리뷰 · 다음 운영 방향`,
    {
      x: 0.72,
      y: 1.3,
      w: 9.8,
      h: 0.22,
      fontFace: FONT.body,
      fontSize: 10.4,
      bold: true,
      color: COLOR.sub,
      margin: 0,
      fit: "shrink",
    },
  );

  slide.addText(deck.title || "광고 성과 리뷰", {
    x: 0.72,
    y: 1.94,
    w: 8.8,
    h: 0.9,
    fontFace: FONT.head,
    fontSize: 37,
    bold: true,
    color: COLOR.navy,
    margin: 0,
    fit: "shrink",
  });

  const sources = (((deck as any).sources ?? []) as any[])
    .slice(0, 6)
    .map((item) => asStr(item?.displayName || item?.source))
    .filter(Boolean)
    .join(" · ");

  slide.addText(sources || "Source · Campaign · Keyword · Creative", {
    x: 0.74,
    y: 3.46,
    w: 9.8,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 10.6,
    bold: true,
    color: COLOR.deepBlue,
    margin: 0,
    fit: "shrink",
  });

  slide.addShape(SHAPE.line, {
    x: 0.74,
    y: 4.25,
    w: 10.0,
    h: 0,
    line: { color: COLOR.line, width: 1 },
  });

  slide.addText(
    (deck as any).reportingPeriodLabel || "REPORTING PERIOD | 전체 기간",
    {
      x: 0.74,
      y: 4.64,
      w: 7.2,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 9.2,
      bold: true,
      color: COLOR.navy,
      margin: 0,
      fit: "shrink",
    },
  );

  slide.addText(`GENERATED | ${formatGeneratedAt(deck.generatedAt)}`, {
    x: 0.74,
    y: 5.02,
    w: 5.8,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 8.2,
    color: COLOR.muted,
    margin: 0,
    fit: "shrink",
  });

  slide.addShape(SHAPE.rect, {
    x: 10.72,
    y: 0.78,
    w: 1.3,
    h: 5.92,
    fill: { color: COLOR.navy },
    line: { color: COLOR.navy },
  });

  slide.addShape(SHAPE.rect, {
    x: 12.15,
    y: 0.78,
    w: 0.34,
    h: 5.92,
    fill: { color: COLOR.orange },
    line: { color: COLOR.orange },
  });
}

function addTocSlide(pptxDoc: pptxgen, deck: PptReportDeck, totalPages: number) {
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  addTemplateHeader({
    slide,
    eyebrow: "CONTENTS",
    title: "보고서 목차",
    subtitle: "성과 요약 · 매체 진단 · 다음 액션 순서 정리.",
    pageNo: 2,
    totalPages,
  });

  const pages = deck.slides ?? [];
  const startY = 1.68;
  const endY = 6.52;
  const availableH = endY - startY;

  const leftX = 0.78;
  const colGap = 0.36;
  const colW = (PPT_W - leftX * 2 - colGap) / 2;

  const half = Math.ceil(pages.length / 2);
  const leftItems = pages.slice(0, half);
  const rightItems = pages.slice(half);

  const drawHeader = (x: number, label: string) => {
    slide.addText(label, {
      x,
      y: 1.43,
      w: colW,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 7.5,
      bold: true,
      color: COLOR.blue,
      margin: 0,
    });
  };

  drawHeader(leftX, "Part 1");
  drawHeader(leftX + colW + colGap, "Part 2");

  const drawColumn = (items: PptSlide[], startIndex: number, x: number) => {
    const count = Math.max(items.length, 1);
    const gap = 0.12;
    const rowH = Math.min(0.58, (availableH - gap * (count - 1)) / count);

    items.forEach((page, index) => {
      const y = startY + index * (rowH + gap);

      addCard({
        slide,
        x,
        y,
        w: colW,
        h: rowH,
        fill: COLOR.paper,
        line: COLOR.lineSoft,
        radius: 0.05,
      });

      slide.addShape(SHAPE.roundRect, {
        x: x + 0.14,
        y: y + rowH / 2 - 0.14,
        w: 0.44,
        h: 0.28,
        rectRadius: 0.05,
        fill: { color: COLOR.blueSoft },
        line: { color: COLOR.blueSoft, width: 0.5 },
      });

      slide.addText(String(startIndex + index + 1).padStart(2, "0"), {
        x: x + 0.14,
        y: y + rowH / 2 - 0.07,
        w: 0.44,
        h: 0.12,
        fontFace: FONT.body,
        fontSize: 7,
        bold: true,
        color: COLOR.blue,
        align: "center",
        margin: 0,
      });

      slide.addText(truncateText(page.title, 32), {
        x: x + 0.7,
        y: y + rowH / 2 - 0.1,
        w: colW - 0.92,
        h: 0.2,
        fontFace: FONT.body,
        fontSize: 10,
        bold: true,
        color: COLOR.ink,
        margin: 0,
        fit: "shrink",
      });
    });
  };

  drawColumn(leftItems, 0, leftX);
  drawColumn(rightItems, half, leftX + colW + colGap);

  addFooter({ slide, deck, pageNo: 2, totalPages });
}

function addKpiGrid(args: {
  slide: pptxgen.Slide;
  kpis?: PptKpi[];
  x: number;
  y: number;
  w: number;
  h: number;
  maxItems?: number;
}) {
  const { slide, kpis = [], x, y, w, h, maxItems = 6 } = args;
  if (!kpis.length) return;

  const items = kpis.slice(0, maxItems);
  const gap = 0.08;
  const itemW = (w - gap * (items.length - 1)) / items.length;

  items.forEach((item, index) => {
    const itemX = x + index * (itemW + gap);

    addCard({
      slide,
      x: itemX,
      y,
      w: itemW,
      h,
      fill: COLOR.paper,
      line: COLOR.lineSoft,
    });

    slide.addText(truncateText(item.label, 14), {
      x: itemX + 0.12,
      y: y + 0.13,
      w: itemW - 0.24,
      h: 0.12,
      fontFace: FONT.body,
      fontSize: 6,
      bold: true,
      color: COLOR.muted,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(item.value, 18), {
      x: itemX + 0.12,
      y: y + 0.36,
      w: itemW - 0.24,
      h: 0.22,
      fontFace: FONT.head,
      fontSize: 11,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });

    if (item.helper) {
      slide.addText(truncateText(item.helper, 24), {
        x: itemX + 0.12,
        y: y + 0.63,
        w: itemW - 0.24,
        h: 0.12,
        fontFace: FONT.body,
        fontSize: 5.5,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
      });
    }
  });
}

function addMiniKpis(args: {
  slide: pptxgen.Slide;
  kpis?: PptKpi[];
  x: number;
  y: number;
  w: number;
  h: number;
  maxItems?: number;
}) {
  const { slide, kpis = [], x, y, w, h, maxItems = 4 } = args;
  const items = kpis.slice(0, maxItems);
  if (!items.length) return;

  const gap = 0.06;
  const itemW = (w - gap * (items.length - 1)) / items.length;

  items.forEach((kpi, index) => {
    const itemX = x + index * (itemW + gap);

    slide.addShape(SHAPE.roundRect, {
      x: itemX,
      y,
      w: itemW,
      h,
      rectRadius: 0.04,
      fill: { color: COLOR.blueSoft },
      line: { color: COLOR.blueSoft, width: 0.5 },
    });

    slide.addText(truncateText(kpi.label, 12), {
      x: itemX + 0.07,
      y: y + 0.08,
      w: itemW - 0.14,
      h: 0.1,
      fontFace: FONT.body,
      fontSize: 5.2,
      bold: true,
      color: COLOR.blueDark,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(kpi.value, 16), {
      x: itemX + 0.07,
      y: y + 0.23,
      w: itemW - 0.14,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 6.6,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });
}

function addSimpleChart(args: {
  slide: pptxgen.Slide;
  chart?: PptChartData;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const { slide, chart, x, y, w, h } = args;

  addCard({ slide, x, y, w, h });

  addSectionLabel({
    slide,
    label: chart?.title || "Chart",
    x: x + 0.18,
    y: y + 0.16,
    w: w - 0.36,
  });

  const rows = chart?.rows?.slice(0, 8) ?? [];
  const firstSeries = chart?.series?.[0];

  if (!chart || !rows.length || !firstSeries) {
    slide.addText("표시할 차트 데이터가 없습니다.", {
      x: x + 0.25,
      y: y + 0.62,
      w: w - 0.5,
      h: 0.22,
      fontFace: FONT.body,
      fontSize: 8,
      color: COLOR.muted,
      margin: 0,
    });
    return;
  }

  const xKey = chart.xKey;
  const yKey = firstSeries.key;
  const values = rows.map((row) => Math.max(0, toNumber(row[yKey])));
  const maxValue = Math.max(...values, 1);

  const plotX = x + 0.35;
  const plotY = y + 0.72;
  const plotW = w - 0.7;
  const plotH = h - 1.05;

  if (chart.type === "line") {
    const pointCount = rows.length;
    const points = rows.map((row, index) => {
      const value = Math.max(0, toNumber(row[yKey]));
      const px =
        pointCount <= 1
          ? plotX + plotW / 2
          : plotX + (plotW / (pointCount - 1)) * index;
      const py = plotY + plotH - (value / maxValue) * plotH;

      return { x: px, y: py, label: asStr(row[xKey]), value };
    });

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];

      slide.addShape(SHAPE.line, {
        x: a.x,
        y: a.y,
        w: b.x - a.x,
        h: b.y - a.y,
        line: { color: COLOR.blue, width: 1.4 },
      });
    }

    points.forEach((p) => {
      slide.addShape(SHAPE.ellipse, {
        x: p.x - 0.035,
        y: p.y - 0.035,
        w: 0.07,
        h: 0.07,
        fill: { color: COLOR.blue },
        line: { color: COLOR.blue },
      });
    });

    points.forEach((p, index) => {
      if (points.length > 5 && index % 2 !== 0 && index !== points.length - 1) {
        return;
      }

      slide.addText(truncateText(p.label, 10), {
        x: p.x - 0.35,
        y: plotY + plotH + 0.08,
        w: 0.7,
        h: 0.12,
        fontFace: FONT.body,
        fontSize: 5.4,
        color: COLOR.muted,
        align: "center",
        margin: 0,
        fit: "shrink",
      });
    });

    return;
  }

  const barGap = 0.08;
  const barW = (plotW - barGap * (rows.length - 1)) / rows.length;

  rows.forEach((row, index) => {
    const label = asStr(row[xKey]);
    const value = Math.max(0, toNumber(row[yKey]));
    const barH = safeNormalizedValue(value, maxValue) * plotH;
    const bx = plotX + index * (barW + barGap);
    const by = plotY + plotH - barH;

    slide.addShape(SHAPE.roundRect, {
      x: bx,
      y: by,
      w: Math.max(0.05, barW),
      h: Math.max(0.03, barH),
      rectRadius: 0.03,
      fill: { color: COLOR.blue },
      line: { color: COLOR.blue },
    });

    slide.addText(truncateText(label, 9), {
      x: bx - 0.03,
      y: plotY + plotH + 0.08,
      w: barW + 0.06,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 5.2,
      color: COLOR.muted,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  });
}

function addTable(args: {
  slide: pptxgen.Slide;
  table?: PptTableData;
  x: number;
  y: number;
  w: number;
  h: number;
  maxCols?: number;
  maxRows?: number;
}) {
  const { slide, table, x, y, w, h, maxCols = 6, maxRows = 8 } = args;

  addCard({ slide, x, y, w, h });

  addSectionLabel({
    slide,
    label: table?.title || "Table",
    x: x + 0.18,
    y: y + 0.16,
    w: w - 0.36,
  });

  if (!table?.columns?.length || !table?.rows?.length) {
    slide.addText("표시할 표 데이터가 없습니다.", {
      x: x + 0.25,
      y: y + 0.62,
      w: w - 0.5,
      h: 0.22,
      fontFace: FONT.body,
      fontSize: 8,
      color: COLOR.muted,
      margin: 0,
    });
    return;
  }

  const cols = table.columns.slice(0, maxCols);
  const rows = table.rows.slice(0, maxRows);

  const tableX = x + 0.18;
  const tableY = y + 0.52;
  const tableW = w - 0.36;
  const headerH = 0.24;
  const rowH = Math.min(0.27, (h - 0.84) / Math.max(rows.length + 1, 2));
  const colW = tableW / cols.length;

  slide.addShape(SHAPE.roundRect, {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    rectRadius: 0.03,
    fill: { color: COLOR.blueSoft },
    line: { color: COLOR.blueSoft },
  });

  cols.forEach((col, i) => {
    slide.addText(truncateText(col.label, 12), {
      x: tableX + i * colW + 0.04,
      y: tableY + 0.07,
      w: colW - 0.08,
      h: 0.09,
      fontFace: FONT.body,
      fontSize: 5.6,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  rows.forEach((row, rowIndex) => {
    const ry = tableY + headerH + rowIndex * rowH;

    slide.addShape(SHAPE.rect, {
      x: tableX,
      y: ry,
      w: tableW,
      h: rowH,
      fill: { color: rowIndex % 2 === 0 ? "FFFFFF" : "FAFBFC" },
      line: { color: COLOR.lineSoft, width: 0.25 },
    });

    cols.forEach((col, colIndex) => {
      slide.addText(truncateText(row[col.key], colIndex === 0 ? 20 : 14), {
        x: tableX + colIndex * colW + 0.04,
        y: ry + 0.075,
        w: colW - 0.08,
        h: 0.09,
        fontFace: FONT.body,
        fontSize: 5.35,
        color: COLOR.ink,
        margin: 0,
        fit: "shrink",
      });
    });
  });
}

function addBulletBox(args: {
  slide: pptxgen.Slide;
  title: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: "analysis" | "insight";
}) {
  const { slide, title, lines, x, y, w, h, tone = "analysis" } = args;
  const safeLines = pptToneList(lines ?? []).slice(0, 3);

  if (!safeLines.length) {
    return;
  }

  const fill = tone === "insight" ? COLOR.greenSoft : COLOR.paper;
  const labelColor = tone === "insight" ? COLOR.green : COLOR.blue;

  addCard({
    slide,
    x,
    y,
    w,
    h,
    fill,
    line: tone === "insight" ? "CDEAD8" : COLOR.lineSoft,
  });

  addSectionLabel({
    slide,
    label: title,
    x: x + 0.18,
    y: y + 0.16,
    w: w - 0.36,
    color: labelColor,
  });

  const lineGap = h < 0.9 ? 0.16 : 0.28;
  const fontSize = h < 0.9 ? 5.3 : 7;

  safeLines.forEach((line, index) => {
    slide.addText(`• ${truncateText(line, h < 0.9 ? 58 : 78)}`, {
      x: x + 0.24,
      y: y + 0.42 + index * lineGap,
      w: w - 0.48,
      h: 0.14,
      fontFace: FONT.body,
      fontSize,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });
  });
}

function addKeyMessageBox(args: {
  slide: pptxgen.Slide;
  title?: string;
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const { slide, title = "KEY MESSAGE", body, x, y, w, h } = args;

  const split = splitExecutiveKeyMessage(body);
  const currentLine = split.current || body;
  const nextLine = split.next || "";

  slide.addShape(SHAPE.rect, {
    x,
    y,
    w,
    h,
    fill: { color: COLOR.navy },
    line: { color: COLOR.navy, width: 0.5 },
  });

  slide.addShape(SHAPE.rect, {
    x,
    y,
    w: 0.14,
    h,
    fill: { color: COLOR.orange },
    line: { color: COLOR.orange, width: 0.5 },
  });

  slide.addText(title, {
    x: x + 0.34,
    y: y + 0.24,
    w: 2.4,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 9.2,
    bold: true,
    color: COLOR.orange,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(buildHighlightedRuns(currentLine, "current"), {
    x: x + 0.34,
    y: y + 0.76,
    w: w - 0.62,
    h: 0.42,
    fontFace: FONT.head,
    fontSize: 14.8,
    bold: true,
    color: COLOR.white,
    margin: 0,
    fit: "shrink",
    breakLine: false,
  });

  if (nextLine) {
    slide.addText(buildHighlightedRuns(nextLine, "next"), {
      x: x + 0.34,
      y: y + 1.36,
      w: w - 0.62,
      h: 0.42,
      fontFace: FONT.head,
      fontSize: 14.8,
      bold: true,
      color: COLOR.white,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });
  }
}

function addSourceBadge(args: {
  slide: pptxgen.Slide;
  label: string;
  x: number;
  y: number;
  maxW: number;
  accentColor: string;
}) {
  const { slide, label, x, y, maxW, accentColor } = args;

  const safeLabel = asStr(label) || "SOURCE";
  const prettyLabel = safeLabel.toUpperCase();

  const estimatedW = Math.min(
    maxW,
    Math.max(1.45, prettyLabel.length * 0.16 + 0.72),
  );

  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w: estimatedW,
    h: SOURCE_PILL_H,
    rectRadius: 0.07,
    fill: { color: "000000" },
    line: { color: "000000", width: 0.5 },
  });

  slide.addText(prettyLabel, {
    x,
    y,
    w: estimatedW,
    h: SOURCE_PILL_H,
    fontFace: FONT.head,
    fontSize: SOURCE_PILL_FONT_SIZE,
    bold: true,
    color: accentColor,
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });
}

function addExecutiveSummarySlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide, COLOR.white);

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "EXECUTIVE SUMMARY",
    title: "운영 리뷰",
    subtitle:
      slideData.subtitle ||
      "매체 구조 점검, 다음 운영 방향 정교화.",
    pageNo,
    totalPages,
  });

  addKeyMessageBox({
    slide,
    body:
      asStr((slideData as any).keyMessage) ||
      asStr((deck as any).keyMessage) ||
      insightText.insights[0] ||
      "이번 기간은 매체별 구조 점검과 반응 확인의 기간이며 다음 운영은 확인된 축을 중심으로 정교화 검토.",
    x: 0.72,
    y: 1.78,
    w: 11.92,
    h: 1.92,
  });

  slide.addText("매체별 한 줄 요약 → 다음 운영 방향", {
    x: 0.72,
    y: 3.98,
    w: 6.8,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 10.4,
    bold: true,
    color: COLOR.navy,
    margin: 0,
  });

  const sourceSummaries = ((slideData as any).sourceSummaries ??
    (deck as any).sources ??
    []) as any[];

  const cardCount = Math.min(sourceSummaries.length, 5);
  const gap = 0.16;
  const cardW = cardCount > 0 ? (11.92 - gap * (cardCount - 1)) / cardCount : 2.3;
  const cardH = 2.28;
  const cardY = 4.32;

  sourceSummaries.slice(0, 5).forEach((item, index) => {
    const x = 0.72 + index * (cardW + gap);
    const y = cardY;

    const accentColor =
      index === 0
        ? COLOR.orange
        : index === 1
          ? COLOR.teal
          : index === 2
            ? COLOR.green
            : index === 3
              ? COLOR.deepBlue
              : COLOR.navy;

    const nextActions = Array.isArray(item?.nextActions)
      ? item.nextActions.slice(0, 3)
      : [];

    const headlineFontSize = cardCount <= 2 ? 13.6 : cardCount <= 3 ? 12.8 : 11.5;
    const actionFontSize = cardCount <= 2 ? 8.9 : cardCount <= 3 ? 8.2 : 7.4;
    const bulletYStart = y + 1.56;
    const bulletGap = 0.22;

    slide.addShape(SHAPE.rect, {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: { color: COLOR.white },
      line: { color: COLOR.line, width: 0.9 },
    });

    slide.addShape(SHAPE.rect, {
      x,
      y,
      w: cardW,
      h: 0.08,
      fill: { color: accentColor },
      line: { color: accentColor, width: 0.2 },
    });

    addSourceBadge({
      slide,
      label: item.displayName || item.source,
      x: x + 0.14,
      y: y + 0.17,
      maxW: Math.max(0.9, cardW - 0.28),
      accentColor,
    });

    slide.addText(asStr(item.headline), {
      x: x + 0.14,
      y: y + 0.6,
      w: cardW - 0.28,
      h: 0.42,
      fontFace: FONT.head,
      fontSize: headlineFontSize,
      bold: true,
      color: COLOR.navy,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });

    slide.addShape(SHAPE.line, {
      x: x + 0.14,
      y: y + 1.16,
      w: cardW - 0.28,
      h: 0,
      line: { color: COLOR.line, width: 0.7 },
    });

    slide.addText("NEXT ACTION", {
      x: x + 0.14,
      y: y + 1.28,
      w: cardW - 0.28,
      h: 0.12,
      fontFace: FONT.body,
      fontSize: 6.4,
      bold: true,
      color: accentColor,
      margin: 0,
      fit: "shrink",
    });

    nextActions.forEach((action: string, actionIndex: number) => {
      slide.addText(`• ${asStr(action)}`, {
        x: x + 0.14,
        y: bulletYStart + actionIndex * bulletGap,
        w: cardW - 0.28,
        h: 0.18,
        fontFace: FONT.body,
        fontSize: actionFontSize,
        bold: true,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
      });
    });

    if (!nextActions.length) {
      slide.addText(`• ${asStr(item.nextDirection)}`, {
        x: x + 0.14,
        y: bulletYStart,
        w: cardW - 0.28,
        h: 0.2,
        fontFace: FONT.body,
        fontSize: actionFontSize,
        bold: true,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
      });
    }
  });

  if (!sourceSummaries.length) {
    addBulletBox({
      slide,
      title: "Insight",
      lines: insightText.insights,
      x: 0.72,
      y: 4.32,
      w: 11.92,
      h: 2.28,
      tone: "insight",
    });
  }

  addFooter({ slide, deck, pageNo, totalPages });
}


function getSourceAccent(index: number) {
  const colors = [
    COLOR.orange,
    COLOR.teal,
    COLOR.green,
    COLOR.deepBlue,
    COLOR.amber,
  ];

  return colors[index % colors.length] || COLOR.orange;
}

function getSourceAccentForSummary(
  deck: PptReportDeck,
  sourceSummary: PptSourceSummary | undefined,
  fallbackIndex: number,
) {
  const sources = (((deck as any).sources ?? []) as PptSourceSummary[]).filter(Boolean);
  const targetSource = asStr(sourceSummary?.source).toLowerCase();
  const targetDisplayName = asStr(sourceSummary?.displayName).toLowerCase();

  const matchedIndex = sources.findIndex((item) => {
    const source = asStr(item?.source).toLowerCase();
    const displayName = asStr(item?.displayName).toLowerCase();

    if (targetSource && source && source === targetSource) return true;
    if (targetDisplayName && displayName && displayName === targetDisplayName) return true;
    if (targetSource && displayName && displayName === targetSource) return true;
    if (targetDisplayName && source && source === targetDisplayName) return true;

    return false;
  });

  return getSourceAccent(matchedIndex >= 0 ? matchedIndex : fallbackIndex);
}

function addSourcePill(args: {
  slide: pptxgen.Slide;
  label: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  accent?: string;
  fontSize?: number;
}) {
  const {
    slide,
    label,
    x,
    y,
    w,
    h = SOURCE_PILL_H,
    accent = COLOR.orange,
    fontSize = SOURCE_PILL_FONT_SIZE,
  } = args;

  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: COLOR.blackStrong },
    line: { color: COLOR.blackStrong, width: 0.5 },
  });

  slide.addText(truncateText(label, 18), {
    x: x + 0.12,
    y,
    w: w - 0.24,
    h,
    fontFace: FONT.head,
    fontSize,
    bold: true,
    color: accent,
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });
}

function pickKpiValue(kpis: PptKpi[] | undefined, labels: string[]) {
  const items = kpis ?? [];
  const targetLabels = labels.map((item) => item.toLowerCase());

  const found = items.find((item) => {
    const label = asStr(item.label).toLowerCase();
    return targetLabels.some((target) => label.includes(target));
  });

  return found?.value || "-";
}

function addSourceOverviewCard(args: {
  slide: pptxgen.Slide;
  item: PptSourceSummary;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const { slide, item, index, x, y, w, h } = args;
  const accent = getSourceAccent(index);
  const topMetric =
    pickKpiValue(item.kpis, ["ROAS"]) !== "-"
      ? ["ROAS", pickKpiValue(item.kpis, ["ROAS"])]
      : pickKpiValue(item.kpis, ["CPA"]) !== "-"
        ? ["CPA", pickKpiValue(item.kpis, ["CPA"])]
        : ["CTR", pickKpiValue(item.kpis, ["CTR"])];

  addCard({
    slide,
    x,
    y,
    w,
    h,
    fill: COLOR.paper,
    line: index % 2 === 0 ? COLOR.lineSoft : COLOR.cream,
    radius: 0.07,
  });

  slide.addShape(SHAPE.rect, {
    x,
    y,
    w: 0.08,
    h,
    fill: { color: accent },
    line: { color: accent },
  });

  addSourcePill({
    slide,
    label: item.displayName || item.source,
    x: x + 0.2,
    y: y + 0.18,
    w: 1.42,
    accent,
  });

  slide.addText(truncateText(item.oneLineSummary || item.headline, 40), {
    x: x + 1.76,
    y: y + 0.19,
    w: w - 1.96,
    h: 0.18,
    fontFace: FONT.head,
    fontSize: 8.4,
    bold: true,
    color: COLOR.ink,
    valign: "middle",
    margin: 0,
    fit: "shrink",
  });

  slide.addText(asStr(topMetric[0]), {
    x: x + 0.22,
    y: y + 0.62,
    w: 0.62,
    h: 0.12,
    fontFace: FONT.body,
    fontSize: 5.5,
    bold: true,
    color: COLOR.muted,
    margin: 0,
  });

  slide.addText(truncateText(topMetric[1], 16), {
    x: x + 0.22,
    y: y + 0.8,
    w: 1.2,
    h: 0.18,
    fontFace: FONT.head,
    fontSize: 9.2,
    bold: true,
    color: accent,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(truncateText(item.headline, 56), {
    x: x + 1.64,
    y: y + 0.58,
    w: w - 1.88,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 6.5,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(truncateText(item.nextDirection, 76), {
    x: x + 1.64,
    y: y + 0.88,
    w: w - 1.88,
    h: 0.28,
    fontFace: FONT.body,
    fontSize: 6.1,
    color: COLOR.sub,
    margin: 0,
    fit: "shrink",
    breakLine: false,
  });

  const action = asStr(item.nextActions?.[0]) || asStr(item.oneLineInsight);
  slide.addShape(SHAPE.roundRect, {
    x: x + 0.2,
    y: y + h - 0.42,
    w: w - 0.4,
    h: 0.26,
    rectRadius: 0.04,
    fill: { color: index % 2 === 0 ? COLOR.blueSoft : COLOR.creamSoft },
    line: { color: index % 2 === 0 ? COLOR.blueSoft : COLOR.creamSoft },
  });

  slide.addText(truncateText(action, 82), {
    x: x + 0.34,
    y: y + h - 0.34,
    w: w - 0.68,
    h: 0.11,
    fontFace: FONT.body,
    fontSize: 5.7,
    bold: true,
    color: COLOR.navy,
    margin: 0,
    fit: "shrink",
  });
}

function addSourceCompactRow(args: {
  slide: pptxgen.Slide;
  item: PptSourceSummary;
  index: number;
  x: number;
  y: number;
  w: number;
}) {
  const { slide, item, index, x, y, w } = args;
  const accent = getSourceAccent(index);
  const h = 0.38;

  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.04,
    fill: { color: index % 2 === 0 ? COLOR.tableAlt : COLOR.white },
    line: { color: COLOR.lineSoft, width: 0.5 },
  });

  addSourcePill({
    slide,
    label: item.displayName || item.source,
    x: x + 0.12,
    y: y + 0.07,
    w: 1.28,
    h: 0.22,
    accent,
    fontSize: 6.2,
  });

  slide.addText(truncateText(item.oneLineSummary, 38), {
    x: x + 1.56,
    y: y + 0.12,
    w: 2.52,
    h: 0.1,
    fontFace: FONT.body,
    fontSize: 5.9,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(truncateText(item.nextDirection, 58), {
    x: x + 4.18,
    y: y + 0.12,
    w: w - 4.36,
    h: 0.1,
    fontFace: FONT.body,
    fontSize: 5.8,
    color: COLOR.sub,
    margin: 0,
    fit: "shrink",
  });
}


function addSourceOverviewSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "SOURCE OVERVIEW",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  const sourceSummaries = (((slideData as any).sourceSummaries ?? []) as PptSourceSummary[])
    .filter(Boolean)
    .slice(0, 8);

  const sourceCount = sourceSummaries.length;
  const reportType = asStr((deck as any).reportType || (deck as any).reportTypeKey);

  const accentColors = [
    COLOR.orange,
    COLOR.teal,
    COLOR.green,
    COLOR.deepBlue,
    COLOR.amber,
    COLOR.navy,
    COLOR.red,
    COLOR.blueDark,
  ];

  const softColors = [
    COLOR.amberSoft,
    COLOR.greenSoft,
    COLOR.blueSoft,
    COLOR.creamSoft,
    COLOR.amberSoft,
    COLOR.blueSoft,
    COLOR.redSoft,
    COLOR.greenSoft,
  ];

  const contentX = 0.64;
  const contentW = 12.05;

  const cardGapX = 0.22;
  const cardGapY = 0.2;

  const topY = 1.76;
  const topH = sourceCount <= 2 ? 2.08 : sourceCount <= 4 ? 2.34 : 2.72;

  const lowerY = topY + topH + 0.34;
  const lowerH = 1.82;

  const stripY = 6.48;
  const stripH = 0.42;

  const columns =
    sourceCount <= 1
      ? 1
      : sourceCount === 2
        ? 2
        : sourceCount <= 4
          ? sourceCount
          : 4;

  const rows = Math.max(1, Math.ceil(Math.max(sourceCount, 1) / columns));
  const cardW = (contentW - cardGapX * (columns - 1)) / columns;
  const cardH = Math.max(0.92, (topH - cardGapY * (rows - 1)) / rows);

  const titleFontSize = sourceCount <= 2 ? 11.2 : sourceCount <= 4 ? 9.8 : 8.6;
  const metricLabelFontSize = sourceCount <= 2 ? 6.7 : sourceCount <= 4 ? 6.1 : 5.5;
  const metricValueFontSize = sourceCount <= 2 ? 15.2 : sourceCount <= 4 ? 12.6 : 10.6;
  const bodyFontSize = sourceCount <= 2 ? 8.7 : sourceCount <= 4 ? 7.7 : 6.8;
  const pillFontSize = sourceCount <= 2 ? 7.4 : sourceCount <= 4 ? 6.7 : 5.9;

  const getMetric = (item: PptSourceSummary, labels: string[], fallbackLabel: string) => {
    const value = pickKpiValue(item.kpis, labels);
    return {
      label: fallbackLabel,
      value: value === "-" ? "-" : value,
    };
  };

  const getPrimaryMetrics = (item: PptSourceSummary) => {
    const normalizedType = reportType.toLowerCase();

    if (normalizedType === "traffic" || normalizedType.includes("traffic") || normalizedType.includes("트래픽")) {
      return [
        getMetric(item, ["클릭", "click"], "클릭"),
        getMetric(item, ["CPC", "cpc"], "CPC"),
      ];
    }

    if (
      normalizedType === "db_acquisition" ||
      normalizedType.includes("db") ||
      normalizedType.includes("acquisition") ||
      normalizedType.includes("획득") ||
      normalizedType.includes("전환")
    ) {
      return [
        getMetric(item, ["전환수", "conversion", "conversions"], "전환수"),
        getMetric(item, ["CPA", "cpa"], "CPA"),
      ];
    }

    return [
      getMetric(item, ["전환매출", "매출", "revenue", "sales"], "전환매출"),
      getMetric(item, ["ROAS", "roas"], "ROAS"),
    ];
  };

  slide.addText("Media Role Summary", {
    x: contentX,
    y: 1.55,
    w: 2.5,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 7.4,
    bold: true,
    color: COLOR.orange,
    margin: 0,
    fit: "shrink",
  });

  slide.addText("숫자 순위보다 역할 판단과 운영 방향 우선 정리.", {
    x: contentX + 2.7,
    y: 1.55,
    w: 7.5,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6.4,
    bold: true,
    color: COLOR.sub,
    margin: 0,
    fit: "shrink",
  });

  if (sourceSummaries.length) {
    sourceSummaries.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = contentX + col * (cardW + cardGapX);
      const y = topY + row * (cardH + cardGapY);

      const accent = accentColors[index % accentColors.length];
      const soft = softColors[index % softColors.length];
      const [primaryMetric, secondaryMetric] = getPrimaryMetrics(item);
      const metricGap = 0.16;
      const metricBoxY = y + (sourceCount <= 2 ? 1.04 : 0.96);
      const metricBoxH = sourceCount <= 2 ? 0.52 : 0.42;
      const metricBoxW = (cardW - 0.44 - metricGap) / 2;

      addCard({
        slide,
        x,
        y,
        w: cardW,
        h: cardH,
        fill: COLOR.paper,
        line: index % 2 === 0 ? COLOR.lineSoft : COLOR.cream,
      });

      slide.addShape(SHAPE.rect, {
        x,
        y,
        w: 0.08,
        h: cardH,
        fill: { color: accent },
        line: { color: accent },
      });

      addSourcePill({
        slide,
        label: item.displayName || item.source || "source",
        x: x + 0.18,
        y: y + 0.16,
        w: Math.min(1.62, cardW - 0.36),
        h: SOURCE_PILL_H,
        accent,
        fontSize: SOURCE_PILL_FONT_SIZE,
      });

      slide.addText(truncateText(item.headline || item.oneLineSummary || "운영 판단 정리", 48), {
        x: x + 0.18,
        y: y + 0.58,
        w: cardW - 0.36,
        h: sourceCount <= 2 ? 0.34 : 0.28,
        fontFace: FONT.head,
        fontSize: titleFontSize,
        bold: true,
        color: COLOR.ink,
        margin: 0,
        fit: "shrink",
      });

      const renderMetricBox = (metric: { label: string; value: string }, metricIndex: number) => {
        const metricX = x + 0.2 + metricIndex * (metricBoxW + metricGap);

        slide.addShape(SHAPE.roundRect, {
          x: metricX,
          y: metricBoxY,
          w: metricBoxW,
          h: metricBoxH,
          rectRadius: 0.05,
          fill: { color: metricIndex === 0 ? COLOR.white : soft },
          line: { color: metricIndex === 0 ? COLOR.lineSoft : soft, width: 0.5 },
        });

        slide.addText(metric.label, {
          x: metricX + 0.1,
          y: metricBoxY + 0.09,
          w: metricBoxW - 0.2,
          h: 0.1,
          fontFace: FONT.body,
          fontSize: metricLabelFontSize,
          bold: true,
          color: COLOR.muted,
          align: "center",
          margin: 0,
          fit: "shrink",
        });

        slide.addText(truncateText(metric.value, 18), {
          x: metricX + 0.1,
          y: metricBoxY + (sourceCount <= 2 ? 0.27 : 0.23),
          w: metricBoxW - 0.2,
          h: 0.17,
          fontFace: FONT.head,
          fontSize: metricValueFontSize,
          bold: true,
          color: metricIndex === 0 ? accent : COLOR.ink,
          align: "center",
          margin: 0,
          fit: "shrink",
        });
      };

      renderMetricBox(primaryMetric, 0);
      renderMetricBox(secondaryMetric, 1);

      slide.addShape(SHAPE.roundRect, {
        x: x + 0.18,
        y: y + cardH - 0.48,
        w: cardW - 0.36,
        h: 0.32,
        rectRadius: 0.05,
        fill: { color: soft },
        line: { color: soft },
      });

      slide.addText(
        truncateText(item.oneLineInsight || item.oneLineSummary || item.nextDirection || "다음 운영 방향 정리", sourceCount <= 2 ? 72 : 52),
        {
          x: x + 0.28,
          y: y + cardH - 0.38,
          w: cardW - 0.56,
          h: 0.14,
          fontFace: FONT.body,
          fontSize: bodyFontSize,
          bold: true,
          color: COLOR.ink,
          margin: 0,
          fit: "shrink",
        },
      );
    });
  } else {
    addBulletBox({
      slide,
      title: "Insight",
      lines: insightText.insights,
      x: contentX,
      y: topY,
      w: contentW,
      h: topH,
      tone: "insight",
    });
  }

  addCard({
    slide,
    x: contentX,
    y: lowerY,
    w: contentW,
    h: lowerH,
    fill: COLOR.paper,
    line: COLOR.lineSoft,
  });

  const lowerLeftX = contentX + 0.24;
  const lowerRightX = contentX + contentW * 0.5 + 0.18;
  const lowerColW = contentW * 0.5 - 0.48;

  slide.addText("OPERATING JUDGEMENT", {
    x: lowerLeftX,
    y: lowerY + 0.24,
    w: lowerColW,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 8.8,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  const judgementLines = uniqueNonEmptyTexts([
    ...sourceSummaries.slice(0, 4).map((item) => {
      return `${item.displayName || item.source}: ${item.oneLineSummary || item.headline || item.nextDirection}`;
    }),
    "매체별 결과는 유지·강화·축소 역할로 구분.",
    "성과 확인 매체는 확장 후보, 비용 부담 매체는 정리 후보.",
  ]).slice(0, 4);

  judgementLines.forEach((line, index) => {
    const accent = accentColors[index % accentColors.length];

    slide.addShape(SHAPE.ellipse, {
      x: lowerLeftX + 0.04,
      y: lowerY + 0.68 + index * 0.32,
      w: 0.09,
      h: 0.09,
      fill: { color: accent },
      line: { color: accent },
    });

    slide.addText(truncateText(line, 76), {
      x: lowerLeftX + 0.24,
      y: lowerY + 0.62 + index * 0.32,
      w: lowerColW - 0.26,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 8.0,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  slide.addText("NEXT OPERATING RULE", {
    x: lowerRightX,
    y: lowerY + 0.24,
    w: lowerColW,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 8.8,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  const nextRules = uniqueNonEmptyTexts([
    ...sourceSummaries.flatMap((item) => item.nextActions ?? []),
    "성과축은 유지·강화, 비용축은 선별 축소.",
    "캠페인·키워드·소재 신호 기준으로 예산 재배분.",
    "최근 주차 흐름을 보고 증액·감액 속도 조정.",
  ]).slice(0, 3);

  nextRules.forEach((line, index) => {
    const accent = accentColors[index % accentColors.length];

    slide.addText(String(index + 1).padStart(2, "0"), {
      x: lowerRightX + 0.02,
      y: lowerY + 0.6 + index * 0.38,
      w: 0.24,
      h: 0.13,
      fontFace: FONT.body,
      fontSize: 7.8,
      bold: true,
      color: accent,
      margin: 0,
    });

    slide.addText(truncateText(line, 68), {
      x: lowerRightX + 0.46,
      y: lowerY + 0.6 + index * 0.38,
      w: lowerColW - 0.54,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 8.0,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  slide.addShape(SHAPE.roundRect, {
    x: contentX,
    y: stripY,
    w: contentW,
    h: stripH,
    rectRadius: 0.05,
    fill: { color: COLOR.navy },
    line: { color: COLOR.navy },
  });

  slide.addText(
    "다음 장부터 CORE INSIGHT·SIGNAL 기준 유지·강화·축소 대상 구체화.",
    {
      x: contentX + 0.3,
      y: stripY + 0.125,
      w: contentW - 0.6,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 8.7,
      bold: true,
      color: COLOR.white,
      align: "center",
      margin: 0,
      fit: "shrink",
    },
  );

  addFooter({ slide, deck, pageNo, totalPages });
}

function addSourceDetailSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  const sourceSummary = (slideData as any).sourceSummary as PptSourceSummary | undefined;
  const signals = ((slideData as any).signals ?? sourceSummary?.signals ?? []) as any[];
  const sourceLabel = asStr(
    sourceSummary?.displayName || sourceSummary?.source || slideData.eyebrow || "SOURCE",
  );
  const accent = getSourceAccentForSummary(
    deck,
    sourceSummary,
    Math.max(0, pageNo - 5),
  );
  const reportType = asStr((deck as any).reportType || (deck as any).reportTypeKey).toLowerCase();
  const sourceKpis = sourceSummary?.kpis?.length ? sourceSummary.kpis : slideData.kpis;

  const makeMetric = (labels: string[], fallbackLabel: string) => {
    const value = pickKpiValue(sourceKpis, labels);
    return {
      label: fallbackLabel,
      value: value === "-" ? "-" : value,
    };
  };

  const detailMetrics = (() => {
    if (reportType === "traffic" || reportType.includes("traffic") || reportType.includes("트래픽")) {
      return [
        makeMetric(["클릭", "click"], "클릭"),
        makeMetric(["CPC", "cpc"], "CPC"),
        makeMetric(["CTR", "ctr"], "CTR"),
        makeMetric(["광고비", "cost", "비용"], "광고비"),
      ];
    }

    if (
      reportType === "db_acquisition" ||
      reportType.includes("db") ||
      reportType.includes("acquisition") ||
      reportType.includes("획득") ||
      reportType.includes("전환")
    ) {
      return [
        makeMetric(["전환수", "conversion", "conversions"], "전환수"),
        makeMetric(["CPA", "cpa"], "CPA"),
        makeMetric(["CVR", "cvr"], "CVR"),
        makeMetric(["광고비", "cost", "비용"], "광고비"),
      ];
    }

    return [
      makeMetric(["전환매출", "매출", "revenue", "sales"], "전환매출"),
      makeMetric(["ROAS", "roas"], "ROAS"),
      makeMetric(["전환수", "conversion", "conversions"], "전환수"),
      makeMetric(["광고비", "cost", "비용"], "광고비"),
    ];
  })();

  addTemplateHeader({
    slide,
    eyebrow: "SOURCE DETAIL",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  addSourcePill({
    slide,
    label: sourceLabel,
    x: 0.64,
    y: 1.56,
    w: 1.88,
    h: 0.36,
    accent,
    fontSize: 9.4,
  });

  const metricX = 0.64;
  const metricY = 2.02;
  const metricW = 12.05;
  const metricH = 0.6;
  const metricGap = 0.12;
  const metricItemW = (metricW - metricGap * (detailMetrics.length - 1)) / detailMetrics.length;

  detailMetrics.forEach((metric, index) => {
    const x = metricX + index * (metricItemW + metricGap);
    const metricAccent = index === 0 ? accent : getSourceAccent(index + 1);

    slide.addShape(SHAPE.roundRect, {
      x,
      y: metricY,
      w: metricItemW,
      h: metricH,
      rectRadius: 0.04,
      fill: { color: index === 0 ? COLOR.creamSoft : COLOR.blueSoft },
      line: { color: index === 0 ? COLOR.cream : COLOR.lineSoft, width: 0.6 },
    });

    slide.addText(metric.label, {
      x: x + 0.12,
      y: metricY + 0.12,
      w: metricItemW - 0.24,
      h: 0.11,
      fontFace: FONT.body,
      fontSize: 6.6,
      bold: true,
      color: COLOR.muted,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(metric.value, 18), {
      x: x + 0.12,
      y: metricY + 0.32,
      w: metricItemW - 0.24,
      h: 0.16,
      fontFace: FONT.head,
      fontSize: 9.4,
      bold: true,
      color: metricAccent,
      margin: 0,
      fit: "shrink",
    });
  });

  addCard({
    slide,
    x: 0.64,
    y: 2.86,
    w: 4.72,
    h: 2.88,
    fill: COLOR.paper,
    line: COLOR.lineSoft,
  });

  slide.addShape(SHAPE.rect, {
    x: 0.64,
    y: 2.86,
    w: 0.1,
    h: 2.88,
    fill: { color: accent },
    line: { color: accent },
  });

  addSectionLabel({
    slide,
    label: "CORE INSIGHT",
    x: 0.96,
    y: 3.08,
    w: 3.92,
    color: accent,
    size: 8.2,
  });

  slide.addText(
    truncateText(
      sourceSummary?.coreInsightTitle || "핵심 데이터 기준 성과 정리.",
      34,
    ),
    {
      x: 0.96,
      y: 3.47,
      w: 4.02,
      h: 0.58,
      fontFace: FONT.head,
      fontSize: 16.6,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    },
  );

  const coreLines = (sourceSummary?.coreInsightBody ?? insightText.analysis).slice(0, 3);
  coreLines.forEach((line: string, index: number) => {
    slide.addText(truncateText(line, 82), {
      x: 1.0,
      y: 4.22 + index * 0.4,
      w: 3.92,
      h: 0.2,
      fontFace: FONT.body,
      fontSize: 7.2,
      bold: index === 0,
      color: index === 0 ? COLOR.ink : COLOR.sub,
      margin: 0,
      fit: "shrink",
    });
  });

  const signalStartX = 5.6;
  const signalW = 2.25;
  const signalGap = 0.2;
  const signalH = 2.88;
  const safeSignals = signals.slice(0, 3);

  safeSignals.forEach((signal, index) => {
    const x = signalStartX + index * (signalW + signalGap);
    const y = 2.86;
    const signalAccent = getSourceAccent(index + 1);

    addCard({
      slide,
      x,
      y,
      w: signalW,
      h: signalH,
      fill: index === 0 ? COLOR.creamSoft : index === 1 ? COLOR.greenSoft : COLOR.blueSoft,
      line: COLOR.lineSoft,
    });

    slide.addText(signal.label || `SIGNAL ${String(index + 1).padStart(2, "0")}`, {
      x: x + 0.16,
      y: y + 0.2,
      w: 1.56,
      h: 0.13,
      fontFace: FONT.body,
      fontSize: 6.6,
      bold: true,
      color: signalAccent,
      margin: 0,
      fit: "shrink",
    });

    slide.addShape(SHAPE.line, {
      x: x + 0.16,
      y: y + 0.48,
      w: 1.88,
      h: 0,
      line: { color: signalAccent, width: 1.1, transparency: 5 },
    });

    slide.addText(truncateText(signal.title, 30), {
      x: x + 0.16,
      y: y + 0.66,
      w: signalW - 0.32,
      h: 0.42,
      fontFace: FONT.head,
      fontSize: 10.9,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });

    if (signal.value) {
      slide.addText(truncateText(signal.value, 34), {
        x: x + 0.16,
        y: y + 1.16,
        w: signalW - 0.32,
        h: 0.15,
        fontFace: FONT.body,
        fontSize: 7.0,
        bold: true,
        color: signalAccent,
        margin: 0,
        fit: "shrink",
      });
    }

    slide.addText(truncateText(signal.body, 94), {
      x: x + 0.16,
      y: y + 1.48,
      w: signalW - 0.32,
      h: 0.78,
      fontFace: FONT.body,
      fontSize: 6.5,
      color: COLOR.sub,
      margin: 0,
      fit: "shrink",
    });

    const action = asStr(sourceSummary?.nextActions?.[index]);
    if (action) {
      slide.addShape(SHAPE.roundRect, {
        x: x + 0.16,
        y: y + 2.44,
        w: signalW - 0.32,
        h: 0.26,
        rectRadius: 0.04,
        fill: { color: COLOR.white },
        line: { color: COLOR.white, width: 0.4 },
      });

      slide.addText(truncateText(action, 50), {
        x: x + 0.26,
        y: y + 2.525,
        w: signalW - 0.52,
        h: 0.1,
        fontFace: FONT.body,
        fontSize: 5.8,
        bold: true,
        color: COLOR.navy,
        margin: 0,
        fit: "shrink",
      });
    }
  });

  if (!safeSignals.length) {
    addBulletBox({
      slide,
      title: "Signals",
      lines: insightText.insights,
      x: 5.6,
      y: 2.86,
      w: 7.09,
      h: 2.88,
      tone: "insight",
    });
  }

  slide.addShape(SHAPE.roundRect, {
    x: 0.64,
    y: 6.04,
    w: 12.05,
    h: 0.6,
    rectRadius: 0.05,
    fill: { color: COLOR.navy },
    line: { color: COLOR.navy },
  });

  slide.addText("ONE-LINE INSIGHT", {
    x: 0.92,
    y: 6.235,
    w: 2.2,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 8.8,
    bold: true,
    color: accent,
    valign: "middle",
    margin: 0,
  });

  slide.addText(
    truncateText(
      (slideData as any).oneLineInsight ||
        sourceSummary?.oneLineInsight ||
        insightText.insights[0],
      142,
    ),
    {
      x: 3.08,
      y: 6.19,
      w: 9.18,
      h: 0.24,
      fontFace: FONT.body,
      fontSize: 10.0,
      bold: true,
      color: COLOR.white,
      valign: "middle",
      margin: 0,
      fit: "shrink",
    },
  );

  addFooter({ slide, deck, pageNo, totalPages });
}

function addReviewTableSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "REVIEW",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  if (slideData.chart && slideData.table) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.64,
      y: 1.58,
      w: 4.6,
      h: 3.35,
    });

    addTable({
      slide,
      table: slideData.table,
      x: 5.46,
      y: 1.58,
      w: 7.23,
      h: 3.35,
      maxCols: 6,
      maxRows: 8,
    });
  } else if (slideData.chart) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.64,
      y: 1.58,
      w: 12.05,
      h: 3.35,
    });
  } else if (slideData.table) {
    addTable({
      slide,
      table: slideData.table,
      x: 0.64,
      y: 1.58,
      w: 12.05,
      h: 3.35,
      maxCols: 6,
      maxRows: 10,
    });
  } else {
    addCard({
      slide,
      x: 0.64,
      y: 1.58,
      w: 12.05,
      h: 3.35,
      fill: COLOR.paper,
      line: COLOR.lineSoft,
    });

    slide.addText("표시할 차트 또는 표 데이터가 없습니다.", {
      x: 0.94,
      y: 3.08,
      w: 11.45,
      h: 0.24,
      fontFace: FONT.body,
      fontSize: 10,
      color: COLOR.muted,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  }

  addBulletBox({
    slide,
    title: "Analysis",
    lines: insightText.analysis,
    x: 0.64,
    y: 5.22,
    w: 5.82,
    h: 1.25,
    tone: "analysis",
  });

  addBulletBox({
    slide,
    title: "Insight",
    lines: insightText.insights,
    x: 6.86,
    y: 5.22,
    w: 5.83,
    h: 1.25,
    tone: "insight",
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addCreativeSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  const reviewCards = ((slideData as any).reviewCards ?? []) as any[];

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "CREATIVE REVIEW",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  const cards = reviewCards.slice(0, 5);
  const cardGap = 0.12;
  const cardW = cards.length
    ? (12.05 - cardGap * (cards.length - 1)) / cards.length
    : 2.3;

  cards.forEach((card, index) => {
    const x = 0.64 + index * (cardW + cardGap);
    const y = 1.62;

    addCard({
      slide,
      x,
      y,
      w: cardW,
      h: 3.65,
      fill: COLOR.paper,
      line: COLOR.line,
      radius: 0.08,
    });

    slide.addText(truncateText(card.badge || "소재", 14), {
      x: x + 0.16,
      y: y + 0.18,
      w: cardW - 0.32,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 6,
      bold: true,
      color: COLOR.blue,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(card.title, 34), {
      x: x + 0.16,
      y: y + 0.52,
      w: cardW - 0.32,
      h: 0.5,
      fontFace: FONT.head,
      fontSize: 9,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });

    slide.addText(truncateText(card.mainValue, 22), {
      x: x + 0.16,
      y: y + 1.2,
      w: cardW - 0.32,
      h: 0.28,
      fontFace: FONT.head,
      fontSize: 13,
      bold: true,
      color: COLOR.blueDark,
      margin: 0,
      fit: "shrink",
    });

    if (card.helper) {
      slide.addText(truncateText(card.helper, 38), {
        x: x + 0.16,
        y: y + 1.56,
        w: cardW - 0.32,
        h: 0.18,
        fontFace: FONT.body,
        fontSize: 6,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
      });
    }

    addMiniKpis({
      slide,
      kpis: card.metrics,
      x: x + 0.16,
      y: y + 1.95,
      w: cardW - 0.32,
      h: 0.45,
      maxItems: 2,
    });

    addMiniKpis({
      slide,
      kpis: (card.metrics ?? []).slice(2),
      x: x + 0.16,
      y: y + 2.5,
      w: cardW - 0.32,
      h: 0.45,
      maxItems: 2,
    });

    if (card.action) {
      slide.addText(truncateText(card.action, 52), {
        x: x + 0.16,
        y: y + 3.1,
        w: cardW - 0.32,
        h: 0.28,
        fontFace: FONT.body,
        fontSize: 5.8,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
        breakLine: false,
      });
    }
  });

  if (!cards.length) {
    addBulletBox({
      slide,
      title: "Creative Insight",
      lines: insightText.insights,
      x: 0.64,
      y: 1.62,
      w: 12.05,
      h: 3.65,
      tone: "insight",
    });
  }

  addCard({
    slide,
    x: 0.64,
    y: 5.62,
    w: 12.05,
    h: 0.78,
    fill: COLOR.greenSoft,
    line: "CDEAD8",
  });

  slide.addText("ONE-LINE INSIGHT", {
    x: 0.88,
    y: 5.865,
    w: 2.1,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 8.5,
    bold: true,
    color: COLOR.green,
    valign: "middle",
    margin: 0,
  });

  slide.addText(truncateText((slideData as any).oneLineInsight || insightText.insights[0], 150), {
    x: 3.0,
    y: 5.80,
    w: 9.38,
    h: 0.28,
    fontFace: FONT.body,
    fontSize: 10.4,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addActionPlanSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  const actionItems = ((slideData as any).actionItems ?? []) as any[];

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "ACTION PLAN",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  const tableX = 0.74;
  const tableY = 1.64;
  const tableW = 11.86;
  const headerH = 0.42;
  const rowH = 0.64;

  addCard({
    slide,
    x: tableX,
    y: tableY,
    w: tableW,
    h: 4.08,
    fill: COLOR.paper,
    line: COLOR.line,
  });

  slide.addShape(SHAPE.roundRect, {
    x: tableX + 0.18,
    y: tableY + 0.22,
    w: tableW - 0.36,
    h: headerH,
    rectRadius: 0.04,
    fill: { color: COLOR.blueSoft },
    line: { color: COLOR.blueSoft },
  });

  const headers = [
    { label: "#", x: tableX + 0.3, w: 0.55 },
    { label: "매체", x: tableX + 0.95, w: 1.6 },
    { label: "이번 기간 정리", x: tableX + 2.65, w: 3.75 },
    { label: "다음 핵심 방향", x: tableX + 6.6, w: 5.05 },
  ];

  headers.forEach((header) => {
    slide.addText(header.label, {
      x: header.x,
      y: tableY + 0.36,
      w: header.w,
      h: 0.1,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  actionItems.slice(0, 5).forEach((item, index) => {
    const y = tableY + 0.78 + index * rowH;

    slide.addShape(SHAPE.rect, {
      x: tableX + 0.18,
      y,
      w: tableW - 0.36,
      h: rowH,
      fill: { color: index % 2 === 0 ? "FFFFFF" : "FAFBFC" },
      line: { color: COLOR.lineSoft, width: 0.25 },
    });

    slide.addText(item.no || String(index + 1).padStart(2, "0"), {
      x: tableX + 0.3,
      y: y + 0.22,
      w: 0.55,
      h: 0.12,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.blue,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(item.source, 16), {
      x: tableX + 0.95,
      y: y + 0.2,
      w: 1.6,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 6.6,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(item.current, 62), {
      x: tableX + 2.65,
      y: y + 0.18,
      w: 3.75,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 6.2,
      color: COLOR.sub,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(item.next, 82), {
      x: tableX + 6.6,
      y: y + 0.18,
      w: 5.05,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  const chips = ["모니터링", "소재 정교화", "안정화", "집중 공략", "효율 유지"];
  chips.forEach((chip, index) => {
    const chipW = 1.55;
    const gap = 0.14;
    const x = 2.54 + index * (chipW + gap);

    slide.addShape(SHAPE.roundRect, {
      x,
      y: 6.02,
      w: chipW,
      h: 0.34,
      rectRadius: 0.06,
      fill: { color: COLOR.creamSoft },
      line: { color: COLOR.cream, width: 0.5 },
    });

    slide.addText(chip, {
      x,
      y: 6.13,
      w: chipW,
      h: 0.1,
      fontFace: FONT.body,
      fontSize: 6,
      bold: true,
      color: COLOR.amber,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addPriorityClosingSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  const priorityItems = ((slideData as any).priorityItems ?? []) as any[];

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "PRIORITY & CLOSING",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  priorityItems.slice(0, 3).forEach((item, index) => {
    const w = 3.78;
    const gap = 0.24;
    const x = 0.72 + index * (w + gap);
    const y = 1.66;

    addCard({
      slide,
      x,
      y,
      w,
      h: 3.54,
      fill: COLOR.paper,
      line: COLOR.line,
    });

    slide.addText(item.no || `PRIORITY ${String(index + 1).padStart(2, "0")}`, {
      x: x + 0.18,
      y: y + 0.18,
      w: w - 0.36,
      h: 0.15,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.blue,
      margin: 0,
      fit: "shrink",
    });

    slide.addText(truncateText(item.title, 36), {
      x: x + 0.18,
      y: y + 0.58,
      w: w - 0.36,
      h: 0.5,
      fontFace: FONT.head,
      fontSize: 13,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });

    slide.addText("핵심 행동", {
      x: x + 0.18,
      y: y + 1.38,
      w: w - 0.36,
      h: 0.12,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.muted,
      margin: 0,
    });

    (item.actions ?? []).slice(0, 3).forEach((action: string, actionIndex: number) => {
      slide.addText(`· ${truncateText(action, 54)}`, {
        x: x + 0.24,
        y: y + 1.66 + actionIndex * 0.32,
        w: w - 0.48,
        h: 0.14,
        fontFace: FONT.body,
        fontSize: 6.2,
        color: COLOR.sub,
        margin: 0,
        fit: "shrink",
      });
    });

    slide.addShape(SHAPE.roundRect, {
      x: x + 0.18,
      y: y + 2.88,
      w: w - 0.36,
      h: 0.38,
      rectRadius: 0.05,
      fill: { color: COLOR.blueSoft },
      line: { color: COLOR.blueSoft },
    });

    slide.addText(truncateText(`목표 · ${item.goal || "성과 개선"}`, 48), {
      x: x + 0.3,
      y: y + 3.02,
      w: w - 0.6,
      h: 0.1,
      fontFace: FONT.body,
      fontSize: 6.2,
      bold: true,
      color: COLOR.blueDark,
      margin: 0,
      fit: "shrink",
    });
  });

  addCard({
    slide,
    x: 0.72,
    y: 5.56,
    w: 11.92,
    h: 0.82,
    fill: COLOR.creamSoft,
    line: COLOR.cream,
  });

  slide.addText("WHY THIS DIRECTION", {
    x: 0.96,
    y: 5.82,
    w: 2.2,
    h: 0.14,
    fontFace: FONT.body,
    fontSize: 6.5,
    bold: true,
    color: COLOR.amber,
    margin: 0,
  });

  slide.addText(truncateText(insightText.insights[0], 150), {
    x: 3.14,
    y: 5.78,
    w: 9.18,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 8,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addThankYouSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide, COLOR.creamSoft);

  slide.addShape(SHAPE.roundRect, {
    x: 0.96,
    y: 0.9,
    w: 11.42,
    h: 5.7,
    rectRadius: 0.18,
    fill: { color: COLOR.paper },
    line: { color: COLOR.line, width: 1 },
  });

  slide.addText(slideData.title || "Thank you", {
    x: 1.5,
    y: 2.65,
    w: 10.3,
    h: 0.72,
    fontFace: FONT.head,
    fontSize: 34,
    bold: true,
    color: COLOR.ink,
    align: "center",
    margin: 0,
    fit: "shrink",
  });

  slide.addText(slideData.subtitle || "Etrylue Performance", {
    x: 1.5,
    y: 3.46,
    w: 10.3,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 9,
    bold: true,
    color: COLOR.blue,
    align: "center",
    margin: 0,
  });

  slide.addText(deck.advertiserName || "광고주", {
    x: 1.5,
    y: 4.02,
    w: 10.3,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 7,
    color: COLOR.muted,
    align: "center",
    margin: 0,
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addGenericBodySlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, insightText, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "REPORT",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  addKpiGrid({
    slide,
    kpis: slideData.kpis,
    x: 0.64,
    y: 1.58,
    w: 12.05,
    h: 0.82,
  });

  const hasKpis = !!slideData.kpis?.length;
  const mainY = hasKpis ? 2.62 : 1.58;
  const mainH = hasKpis ? 2.4 : 3.45;

  if (slideData.chart && slideData.table) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.64,
      y: mainY,
      w: 5.78,
      h: mainH,
    });

    addTable({
      slide,
      table: slideData.table,
      x: 6.78,
      y: mainY,
      w: 5.91,
      h: mainH,
    });
  } else if (slideData.chart) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.64,
      y: mainY,
      w: 12.05,
      h: mainH,
    });
  } else if (slideData.table) {
    addTable({
      slide,
      table: slideData.table,
      x: 0.64,
      y: mainY,
      w: 12.05,
      h: mainH,
    });
  } else {
    addBulletBox({
      slide,
      title: "Analysis",
      lines: insightText.analysis,
      x: 0.64,
      y: mainY,
      w: 12.05,
      h: mainH,
      tone: "analysis",
    });
  }

  addBulletBox({
    slide,
    title: "Analysis",
    lines: insightText.analysis,
    x: 0.64,
    y: 5.24,
    w: 5.82,
    h: 1.22,
    tone: "analysis",
  });

  addBulletBox({
    slide,
    title: "Insight",
    lines: insightText.insights,
    x: 6.86,
    y: 5.24,
    w: 5.83,
    h: 1.22,
    tone: "insight",
  });

  addFooter({ slide, deck, pageNo, totalPages });
}

function addEmptyStateSlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { pptxDoc, deck, slideData, pageNo, totalPages } = args;
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  addTemplateHeader({
    slide,
    eyebrow: slideData.eyebrow || "ETRYLUE PERFORMANCE",
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  addCard({
    slide,
    x: 0.64,
    y: 1.72,
    w: 12.05,
    h: 4.92,
    fill: COLOR.paper,
    line: COLOR.lineSoft,
  });

  slide.addText(
    asStr(slideData.emptyStateMessage) ||
      "선택한 조건에 해당하는 데이터가 없습니다.",
    {
      x: 1.14,
      y: 3.77,
      w: 11.05,
      h: 0.34,
      fontFace: FONT.head,
      fontSize: 16,
      bold: true,
      color: COLOR.muted,
      align: "center",
      valign: "middle",
      margin: 0,
      fit: "shrink",
    },
  );

  addFooter({ slide, deck, pageNo, totalPages });
}

function addBodySlide(args: {
  pptxDoc: pptxgen;
  deck: PptReportDeck;
  slideData: PptSlide;
  insightText: PptSlideInsightText;
  pageNo: number;
  totalPages: number;
}) {
  const { slideData } = args;
  const type = asStr((slideData as any).type || slideData.key);

  if (asStr(slideData.emptyStateMessage)) {
    addEmptyStateSlide(args);
    return;
  }

  if (type === "executive-summary" || slideData.key === "executive-summary") {
    addExecutiveSummarySlide(args);
    return;
  }

  if (type === "source-overview" || slideData.key === "source-overview") {
    addSourceOverviewSlide(args);
    return;
  }

  if (type === "source-detail" || slideData.key.startsWith("source-detail")) {
    addSourceDetailSlide(args);
    return;
  }

  if (
    type === "campaign-review" ||
    type === "keyword-review" ||
    slideData.key === "campaign-review" ||
    slideData.key === "keyword-review"
  ) {
    addReviewTableSlide(args);
    return;
  }

  if (
    type === "creative-analysis" ||
    type === "creative-review" ||
    slideData.key === "creative-analysis" ||
    slideData.key === "creative-review"
  ) {
    addCreativeSlide(args);
    return;
  }

  if (type === "action-plan" || slideData.key === "action-plan") {
    addActionPlanSlide(args);
    return;
  }

  if (type === "priority-closing" || slideData.key === "priority-closing") {
    addPriorityClosingSlide(args);
    return;
  }

  if (type === "thank-you" || slideData.key === "thank-you") {
    addThankYouSlide(args);
    return;
  }

  addGenericBodySlide(args);
}

export function buildPptxFromReportDeck({ deck, insights }: RenderPptParams) {
  const pptxDoc = new pptxgen();

  pptxDoc.layout = "LAYOUT_WIDE";
  pptxDoc.author = "Etrylue Performance";
  pptxDoc.company = "Etrylue";
  pptxDoc.subject = deck.reportTypeName || "Performance Report";
  pptxDoc.title = deck.title || "Performance Report";
  pptxDoc.theme = {
    headFontFace: FONT.head,
    bodyFontFace: FONT.body,
  };

  const rawSlides = deck.slides ?? [];
  const bodySlides =
    rawSlides.length > 16
      ? [
          ...rawSlides.filter((slide) => slide.key !== "thank-you").slice(0, 15),
          rawSlides.find((slide) => slide.key === "thank-you"),
        ].filter(Boolean) as PptSlide[]
      : rawSlides;

  const totalPages = bodySlides.length + 2;

  addCoverSlide(pptxDoc, deck);
  addTocSlide(
    pptxDoc,
    {
      ...deck,
      slides: bodySlides,
    },
    totalPages,
  );

  bodySlides.forEach((slideData, index) => {
    const insightText = getPptSlideInsightText({
      insights,
      slideKey: slideData.key,
    });

    addBodySlide({
      pptxDoc,
      deck,
      slideData,
      insightText,
      pageNo: index + 3,
      totalPages,
    });
  });

  return pptxDoc;
}

export async function downloadPptxFromReportDeck(params: RenderPptParams) {
  const pptxDoc = buildPptxFromReportDeck(params);

  await pptxDoc.writeFile({
    fileName: safeFileName(params.fileName || params.deck.title),
  });
}

export async function writePptxBufferFromReportDeck(params: RenderPptParams) {
  const pptxDoc = buildPptxFromReportDeck(params);

  const buffer = await pptxDoc.write({
    outputType: "nodebuffer",
  });

  return buffer;
}