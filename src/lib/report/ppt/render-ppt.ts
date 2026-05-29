// src/lib/report/ppt/render-ppt.ts

import pptxgen from "pptxgenjs";
import type {
  PptChartData,
  PptKpi,
  PptReportDeck,
  PptSlide,
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
  bg: "F7F8FA",
  paper: "FFFFFF",
  ink: "182033",
  sub: "667085",
  muted: "98A2B3",
  line: "D8E3EA",
  lineSoft: "EEF2F6",
  blue: "7FA6C4",
  blueSoft: "E8F2F7",
  cream: "F3E4D2",
  grayWarm: "CFC2B1",
  green: "2E7D5B",
  greenSoft: "E8F5EE",
  amber: "9A6A00",
  amberSoft: "FFF6DB",
  red: "B42318",
  redSoft: "FEECEC",
};

const FONT = {
  head: "Arial",
  body: "Arial",
};

const SHAPE = {
  rect: "rect",
  roundRect: "roundRect",
  line: "line",
  ellipse: "ellipse",
} as const;

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

function addPageBackground(slide: pptxgen.Slide) {
  slide.background = { color: COLOR.bg };

  slide.addShape(SHAPE.rect, {
    x: 0,
    y: 0,
    w: PPT_W,
    h: PPT_H,
    fill: { color: COLOR.bg },
    line: { color: COLOR.bg },
  });
}

function addTopTitle(args: {
  slide: pptxgen.Slide;
  title: string;
  subtitle?: string;
  pageNo?: number;
  totalPages?: number;
}) {
  const { slide, title, subtitle, pageNo, totalPages } = args;

  slide.addText(truncateText(title, 54), {
    x: 0.55,
    y: 0.36,
    w: 9.2,
    h: 0.32,
    fontFace: FONT.head,
    fontSize: 16,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  if (subtitle) {
    slide.addText(truncateText(subtitle, 90), {
      x: 0.55,
      y: 0.72,
      w: 8.8,
      h: 0.2,
      fontFace: FONT.body,
      fontSize: 7.5,
      color: COLOR.sub,
      margin: 0,
      fit: "shrink",
    });
  }

  if (pageNo && totalPages) {
    slide.addText(`${pageNo} / ${totalPages}`, {
      x: 11.55,
      y: 0.42,
      w: 1.15,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 7,
      bold: true,
      color: COLOR.muted,
      align: "right",
      margin: 0,
    });
  }

  slide.addShape(SHAPE.line, {
    x: 0.55,
    y: 1.03,
    w: 12.2,
    h: 0,
    line: { color: COLOR.line, width: 0.8 },
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
    x: 0.55,
    y: 7.05,
    w: 12.2,
    h: 0,
    line: { color: COLOR.lineSoft, width: 0.7 },
  });

  slide.addText("Etrylue Performance", {
    x: 0.55,
    y: 7.18,
    w: 2.5,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6.5,
    bold: true,
    color: COLOR.blue,
    margin: 0,
  });

  slide.addText(formatGeneratedAt(deck.generatedAt), {
    x: 3.05,
    y: 7.18,
    w: 3.8,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6,
    color: COLOR.muted,
    margin: 0,
  });

  if (pageNo && totalPages) {
    slide.addText(`${pageNo} / ${totalPages}`, {
      x: 11.65,
      y: 7.18,
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
  const { slide, x, y, w, h, fill = COLOR.paper, line = COLOR.lineSoft } = args;

  slide.addShape(SHAPE.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
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
}) {
  const { slide, label, x, y, w, color = COLOR.blue } = args;

  slide.addText(label.toUpperCase(), {
    x,
    y,
    w,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6.5,
    bold: true,
    color,
    margin: 0,
    fit: "shrink",
  });
}

function addCoverSlide(pptxDoc: pptxgen, deck: PptReportDeck) {
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);

  slide.addShape(SHAPE.roundRect, {
    x: 0.8,
    y: 0.72,
    w: 11.75,
    h: 6.05,
    rectRadius: 0.16,
    fill: { color: COLOR.paper },
    line: { color: COLOR.line, width: 1 },
  });

  slide.addShape(SHAPE.rect, {
    x: 0.8,
    y: 0.72,
    w: 0.16,
    h: 6.05,
    fill: { color: COLOR.blue },
    line: { color: COLOR.blue },
  });

  slide.addText("ETRYLUE PERFORMANCE", {
    x: 1.25,
    y: 1.2,
    w: 5.4,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 8,
    bold: true,
    color: COLOR.blue,
    margin: 0,
  });

  slide.addText(deck.title || "Performance Report", {
    x: 1.25,
    y: 1.85,
    w: 9.5,
    h: 1.0,
    fontFace: FONT.head,
    fontSize: 30,
    bold: true,
    color: COLOR.ink,
    margin: 0,
    fit: "shrink",
  });

  slide.addText(deck.advertiserName || "광고주", {
    x: 1.25,
    y: 3.1,
    w: 5.8,
    h: 0.28,
    fontFace: FONT.body,
    fontSize: 12,
    bold: true,
    color: COLOR.sub,
    margin: 0,
  });

  slide.addText(deck.reportTypeName || "성과 보고서", {
    x: 1.25,
    y: 3.47,
    w: 5.8,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 9,
    color: COLOR.sub,
    margin: 0,
  });

  slide.addShape(SHAPE.line, {
    x: 1.25,
    y: 4.35,
    w: 9.95,
    h: 0,
    line: { color: COLOR.line, width: 1 },
  });

  slide.addText("AI-assisted report narrative", {
    x: 1.25,
    y: 4.72,
    w: 4.8,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 9,
    bold: true,
    color: COLOR.grayWarm,
    margin: 0,
  });

  slide.addText(`생성일 ${formatGeneratedAt(deck.generatedAt)}`, {
    x: 1.25,
    y: 5.1,
    w: 4.8,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 7,
    color: COLOR.muted,
    margin: 0,
  });
}

function addTocSlide(pptxDoc: pptxgen, deck: PptReportDeck, totalPages: number) {
  const slide = pptxDoc.addSlide();
  addPageBackground(slide);
  addTopTitle({
    slide,
    title: "목차",
    subtitle: "보고서 스토리 순서 기준",
    pageNo: 2,
    totalPages,
  });

  const pages = deck.slides ?? [];
  const startY = 1.35;
  const rowH = 0.37;
  const leftX = 0.72;
  const colGap = 0.34;
  const colW = (PPT_W - leftX * 2 - colGap) / 2;

  pages.forEach((page, index) => {
    const col = index >= 7 ? 1 : 0;
    const row = col === 0 ? index : index - 7;

    const x = leftX + col * (colW + colGap);
    const y = startY + row * rowH;

    addCard({
      slide,
      x,
      y,
      w: colW,
      h: 0.28,
      fill: COLOR.paper,
      line: COLOR.lineSoft,
    });

    slide.addText(String(index + 1).padStart(2, "0"), {
      x: x + 0.12,
      y: y + 0.075,
      w: 0.35,
      h: 0.1,
      fontFace: FONT.body,
      fontSize: 6,
      bold: true,
      color: COLOR.blue,
      align: "center",
      margin: 0,
    });

    slide.addText(truncateText(page.title, 34), {
      x: x + 0.58,
      y: y + 0.062,
      w: colW - 0.75,
      h: 0.12,
      fontFace: FONT.body,
      fontSize: 7.2,
      bold: true,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
    });
  });

  addFooter({ slide, deck, pageNo: 2, totalPages });
}

function addKpiGrid(args: {
  slide: pptxgen.Slide;
  kpis?: PptKpi[];
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const { slide, kpis = [], x, y, w, h } = args;
  if (!kpis.length) return;

  const maxItems = Math.min(kpis.length, 6);
  const gap = 0.08;
  const itemW = (w - gap * (maxItems - 1)) / maxItems;

  for (let i = 0; i < maxItems; i += 1) {
    const item = kpis[i];
    const itemX = x + i * (itemW + gap);

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
      slide.addText(truncateText(item.helper, 22), {
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
  }
}

function pickChartRows(chart?: PptChartData) {
  if (!chart?.rows?.length) return [];
  return chart.rows.slice(0, 8);
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

  const rows = pickChartRows(chart);
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

    for (const p of points) {
      slide.addShape(SHAPE.ellipse, {
        x: p.x - 0.035,
        y: p.y - 0.035,
        w: 0.07,
        h: 0.07,
        fill: { color: COLOR.blue },
        line: { color: COLOR.blue },
      });
    }

    const labelEvery = points.length > 5 ? 2 : 1;
    points.forEach((p, index) => {
      if (index % labelEvery !== 0 && index !== points.length - 1) return;

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
    const barH = (value / maxValue) * plotH;
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
      rotate: rows.length > 5 ? 315 : 0,
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
}) {
  const { slide, table, x, y, w, h } = args;

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

  const cols = table.columns.slice(0, 6);
  const rows = table.rows.slice(0, 8);

  const tableX = x + 0.18;
  const tableY = y + 0.52;
  const tableW = w - 0.36;
  const headerH = 0.24;
  const rowH = Math.min(0.26, (h - 0.84) / Math.max(rows.length + 1, 2));
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
      slide.addText(truncateText(row[col.key], colIndex === 0 ? 18 : 12), {
        x: tableX + colIndex * colW + 0.04,
        y: ry + 0.075,
        w: colW - 0.08,
        h: 0.09,
        fontFace: FONT.body,
        fontSize: 5.4,
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

  const safeLines = (lines ?? []).slice(0, 3);

  safeLines.forEach((line, index) => {
    slide.addText(`• ${truncateText(line, 78)}`, {
      x: x + 0.24,
      y: y + 0.48 + index * 0.28,
      w: w - 0.48,
      h: 0.18,
      fontFace: FONT.body,
      fontSize: 7,
      color: COLOR.ink,
      margin: 0,
      fit: "shrink",
      breakLine: false,
    });
  });
}

function addBodySlide(args: {
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

  addTopTitle({
    slide,
    title: slideData.title,
    subtitle: slideData.subtitle,
    pageNo,
    totalPages,
  });

  addKpiGrid({
    slide,
    kpis: slideData.kpis,
    x: 0.55,
    y: 1.22,
    w: 12.2,
    h: 0.9,
  });

  const hasKpis = !!slideData.kpis?.length;
  const mainY = hasKpis ? 2.28 : 1.22;
  const mainH = hasKpis ? 2.45 : 3.35;

  const hasChart = !!slideData.chart;
  const hasTable = !!slideData.table;

  if (hasChart && hasTable) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.55,
      y: mainY,
      w: 5.95,
      h: mainH,
    });

    addTable({
      slide,
      table: slideData.table,
      x: 6.75,
      y: mainY,
      w: 6.0,
      h: mainH,
    });
  } else if (hasChart) {
    addSimpleChart({
      slide,
      chart: slideData.chart,
      x: 0.55,
      y: mainY,
      w: 12.2,
      h: mainH,
    });
  } else if (hasTable) {
    addTable({
      slide,
      table: slideData.table,
      x: 0.55,
      y: mainY,
      w: 12.2,
      h: mainH,
    });
  } else {
    addCard({
      slide,
      x: 0.55,
      y: mainY,
      w: 12.2,
      h: mainH,
      fill: COLOR.paper,
      line: COLOR.lineSoft,
    });

    slide.addText("핵심 표 또는 그래프 데이터가 없습니다.", {
      x: 0.85,
      y: mainY + 0.45,
      w: 11.6,
      h: 0.24,
      fontFace: FONT.body,
      fontSize: 8,
      color: COLOR.muted,
      margin: 0,
    });
  }

  addBulletBox({
    slide,
    title: "Analysis",
    lines: insightText.analysis,
    x: 0.55,
    y: 5.0,
    w: 5.95,
    h: 1.72,
    tone: "analysis",
  });

  addBulletBox({
    slide,
    title: "Insight",
    lines: insightText.insights,
    x: 6.75,
    y: 5.0,
    w: 6.0,
    h: 1.72,
    tone: "insight",
  });

  addFooter({
    slide,
    deck,
    pageNo,
    totalPages,
  });
}

export function buildPptxFromReportDeck({
  deck,
  insights,
}: RenderPptParams) {
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

  const bodySlides = (deck.slides ?? []).slice(0, 13);
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