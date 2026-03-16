import jsPDF from "jspdf";
import { toCanvas } from "html-to-image";

type ExportPdfParams = {
  element: HTMLElement;
  fileName: string;
};

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function createHiddenStage() {
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-100000px";
  stage.style.top = "0";
  stage.style.width = "0";
  stage.style.height = "0";
  stage.style.overflow = "hidden";
  stage.style.pointerEvents = "none";
  stage.style.opacity = "0";
  stage.style.zIndex = "-1";
  document.body.appendChild(stage);
  return stage;
}

function sanitizeClone(root: HTMLElement) {
  // 루트 자체
  root.style.transform = "none";
  root.style.scale = "none";
  root.style.maxHeight = "none";
  root.style.height = "auto";
  root.style.overflow = "visible";
  root.style.background = "#ffffff";

  const all = Array.from(root.querySelectorAll<HTMLElement>("*"));

  for (const el of all) {
    // 캡처 불안정 요소 최소화
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.caretColor = "transparent";

    // sticky/fixed는 캡처 왜곡 유발 가능
    const computed = window.getComputedStyle(el);
    if (computed.position === "sticky" || computed.position === "fixed") {
      el.style.position = "static";
      el.style.top = "auto";
      el.style.left = "auto";
      el.style.right = "auto";
      el.style.bottom = "auto";
    }

    // transform이 걸린 자식들이 있으면 제거
    if (computed.transform && computed.transform !== "none") {
      el.style.transform = "none";
    }

    // 스크롤 영역 풀기
    if (
      computed.overflow === "auto" ||
      computed.overflow === "scroll" ||
      computed.overflowX === "auto" ||
      computed.overflowX === "scroll" ||
      computed.overflowY === "auto" ||
      computed.overflowY === "scroll"
    ) {
      el.style.overflow = "visible";
      el.style.overflowX = "visible";
      el.style.overflowY = "visible";
      el.style.maxHeight = "none";
      el.style.height = "auto";
    }
  }
}

function sliceCanvasToPageDataUrls(
  sourceCanvas: HTMLCanvasElement,
  pagePixelHeight: number
) {
  const result: string[] = [];
  let y = 0;

  while (y < sourceCanvas.height) {
    const sliceHeight = Math.min(pagePixelHeight, sourceCanvas.height - y);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = sourceCanvas.width;
    pageCanvas.height = sliceHeight;

    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("PDF 페이지 캔버스를 생성하지 못했습니다.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    ctx.drawImage(
      sourceCanvas,
      0,
      y,
      sourceCanvas.width,
      sliceHeight,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height
    );

    result.push(pageCanvas.toDataURL("image/png"));
    y += sliceHeight;
  }

  return result;
}

export async function downloadPdfFromElement({
  element,
  fileName,
}: ExportPdfParams) {
  const stage = createHiddenStage();

  try {
    const clone = element.cloneNode(true) as HTMLElement;

    const captureWidth = Math.max(element.scrollWidth, element.clientWidth);
    const captureHeight = Math.max(element.scrollHeight, element.clientHeight);

    clone.style.width = `${captureWidth}px`;
    clone.style.minWidth = `${captureWidth}px`;
    clone.style.maxWidth = `${captureWidth}px`;
    clone.style.boxSizing = "border-box";
    clone.style.background = "#ffffff";

    sanitizeClone(clone);

    stage.appendChild(clone);

    await waitFrame();
    await waitFrame();

    // PDF는 너무 높은 배율보다 안정성이 더 중요
    const pixelRatio = 1;

    const canvas = await toCanvas(clone, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: captureWidth,
      canvasHeight: captureHeight,
    });

    if (!canvas) {
      throw new Error("PDF용 캔버스 생성에 실패했습니다.");
    }

    const pdf = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();

    const marginMm = 8;
    const usableWidthMm = pageWidthMm - marginMm * 2;
    const usableHeightMm = pageHeightMm - marginMm * 2;

    const scale = usableWidthMm / canvas.width;
    const pagePixelHeight = Math.floor(usableHeightMm / scale);

    const pageImages = sliceCanvasToPageDataUrls(canvas, pagePixelHeight);

    pageImages.forEach((img, index) => {
      if (index > 0) pdf.addPage();

      const slicePixelHeight =
        index === pageImages.length - 1
          ? canvas.height - pagePixelHeight * index
          : pagePixelHeight;

      const renderHeightMm = slicePixelHeight * scale;

      pdf.addImage(
        img,
        "PNG",
        marginMm,
        marginMm,
        usableWidthMm,
        renderHeightMm
      );
    });

    pdf.save(fileName);

    return {
      ok: true,
      fileName,
      width: canvas.width,
      height: canvas.height,
      pages: pageImages.length,
    };
  } finally {
    stage.remove();
  }
}