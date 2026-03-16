import { toBlob } from "html-to-image";

type ExportPngParams = {
  element: HTMLElement;
  fileName: string;
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPngFromElement({
  element,
  fileName,
}: ExportPngParams) {
  const pixelRatio =
    typeof window !== "undefined"
      ? Math.min(window.devicePixelRatio || 1, 2)
      : 2;

  const width = Math.max(element.scrollWidth, element.clientWidth);
  const height = Math.max(element.scrollHeight, element.clientHeight);

  const blob = await toBlob(element, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio,
    canvasWidth: Math.max(1, Math.round(width * pixelRatio)),
    canvasHeight: Math.max(1, Math.round(height * pixelRatio)),
    width,
    height,
  });

  if (!blob) {
    throw new Error("PNG 생성에 실패했습니다.");
  }

  downloadBlob(blob, fileName);

  return {
    ok: true,
    fileName,
    width,
    height,
  };
}