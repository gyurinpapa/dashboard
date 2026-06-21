// app/reports/[id]/ppt-render/page.tsx

import { notFound } from "next/navigation";
import PptRenderClient from "./PptRenderClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    payload?: string | string[];
  }>;
};

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export default async function PptRenderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const reportId = String(id ?? "").trim();

  if (!reportId) {
    notFound();
  }

  const query = searchParams ? await searchParams : {};
  const encodedPayload = firstQueryValue(query.payload);

  return (
    <PptRenderClient
      reportId={reportId}
      encodedPayload={encodedPayload}
    />
  );
}
