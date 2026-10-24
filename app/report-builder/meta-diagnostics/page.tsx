import { Suspense } from "react";
import { connection } from "next/server";
import MetaDiagnosticsClient from "./MetaDiagnosticsClient";

export const metadata = { title: "Meta 연결 점검 | Etrylue Performance", robots: { index: false, follow: false } };

export default async function MetaDiagnosticsPage() {
  await connection();
  return <Suspense fallback={<p>점검 화면을 불러오는 중입니다.</p>}><MetaDiagnosticsClient /></Suspense>;
}
