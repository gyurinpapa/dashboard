// app/report-builder/[id]/export-builder/page.tsx

import ExportBuilderClient from "@/app/components/export-builder/ExportBuilderClient";

type PageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    advertiserName?: string;
    reportTypeName?: string;
    periodLabel?: string;
    preset?: "starter-default" | "starter-summary-focused" | "starter-executive";
  };
};

function asString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export default function ReportExportBuilderPage({
  params,
  searchParams,
}: PageProps) {
  const reportId = asString(params?.id);

  const advertiserName = asString(searchParams?.advertiserName) || "광고주";
  const reportTypeName = asString(searchParams?.reportTypeName) || "리포트";
  const periodLabel = asString(searchParams?.periodLabel) || "기간 미정";

  const preset =
    searchParams?.preset === "starter-summary-focused" ||
    searchParams?.preset === "starter-executive" ||
    searchParams?.preset === "starter-default"
      ? searchParams.preset
      : "starter-default";

  return (
    <ExportBuilderClient
      initialInput={{
        reportId,
        advertiserName,
        reportTypeName,
        periodLabel,
        preset,
      }}
    />
  );
}