type Coverage = Readonly<{
  target_covered: boolean;
  through_date: string;
  first_missing_date: string | null;
}>;

type LatestJob = Readonly<{
  status: string;
  progress: number;
  date_from?: string | null;
  automation_contract?: string | null;
}>;

// Initial coverage and the latest daily run describe different date windows.
// Keep coverage counts intact while giving the latest non-success precedence.
export function getDailyReportV2ProviderStatus(
  coverage: Coverage | null,
  job: LatestJob | null,
) {
  if (!coverage) return null;

  const latestUnfinished = job && ["failed", "pending", "processing", "cancelled"].includes(job.status);
  const status = latestUnfinished
    ? job.status
    : coverage.target_covered ? "done" : "pending";
  const percent = Number.isFinite(job?.progress)
    ? Math.max(0, Math.min(100, Number(job?.progress)))
    : 0;
  const statusText = status === "done" ? "완료"
    : status === "failed" ? "실패"
    : status === "processing" ? `처리 중 ${percent}%`
    : status === "cancelled" ? "취소됨" : "대기 중";
  const dailyDate = job?.automation_contract === "daily_report_v2"
    ? job.date_from : undefined;

  let currentStage: string;
  if (latestUnfinished) {
    currentStage = dailyDate
      ? `${dailyDate} · ${statusText}`
      : `최근 동기화 ${statusText}`;
  } else if (coverage.target_covered) {
    currentStage = dailyDate && dailyDate > coverage.through_date
      ? `${dailyDate} · 데일리 동기화 완료`
      : "초기 동기화 완료";
  } else if (dailyDate && job?.status === "done") {
    currentStage = `${dailyDate} · 완료`;
  } else {
    currentStage = coverage.first_missing_date
      ? `${coverage.first_missing_date} 대기` : "-";
  }

  return { status, statusText, currentStage };
}
