"use client";

type Props = {
  onDownloadPdf: () => void;
  onDownloadPng: () => void;
  onDownloadCsv: () => void;

  /**
   * PPT 다운로드는 선택 기능으로 둔다.
   * 기존 PDF/PNG/CSV만 쓰는 화면이 있다면 깨지지 않도록 optional 처리.
   */
  onDownloadPpt?: () => void;

  pdfLoading?: boolean;
  pngLoading?: boolean;
  csvLoading?: boolean;
  pptLoading?: boolean;

  disabled?: boolean;
};

function btnClass(disabled?: boolean) {
  return [
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold",
    "border border-gray-200 bg-white text-gray-700 shadow-sm",
    "transition hover:bg-gray-50 active:scale-[0.99]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    disabled ? "pointer-events-none" : "",
  ].join(" ");
}

export default function ReportDownloadButtons({
  onDownloadPdf,
  onDownloadPng,
  onDownloadCsv,
  onDownloadPpt,
  pdfLoading = false,
  pngLoading = false,
  csvLoading = false,
  pptLoading = false,
  disabled = false,
}: Props) {
  const showPptButton = typeof onDownloadPpt === "function";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btnClass(disabled || pdfLoading)}
        onClick={onDownloadPdf}
        disabled={disabled || pdfLoading}
      >
        {pdfLoading ? "PDF 준비 중..." : "PDF 다운로드"}
      </button>

      <button
        type="button"
        className={btnClass(disabled || pngLoading)}
        onClick={onDownloadPng}
        disabled={disabled || pngLoading}
      >
        {pngLoading ? "PNG 준비 중..." : "PNG 다운로드"}
      </button>

      <button
        type="button"
        className={btnClass(disabled || csvLoading)}
        onClick={onDownloadCsv}
        disabled={disabled || csvLoading}
      >
        {csvLoading ? "CSV 준비 중..." : "CSV 다운로드"}
      </button>

      {showPptButton ? (
        <button
          type="button"
          className={btnClass(disabled || pptLoading)}
          onClick={onDownloadPpt}
          disabled={disabled || pptLoading}
        >
          {pptLoading ? "PPT 준비 중..." : "PPT 다운로드"}
        </button>
      ) : null}
    </div>
  );
}