import { Suspense } from "react";
import { connection } from "next/server";
import ReportBuilderMembersClient from "./ReportBuilderMembersClient";

export default async function ReportBuilderMembersPage() {
  await connection();

  return (
    <Suspense fallback={<div>멤버 관리 페이지 불러오는 중...</div>}>
      <ReportBuilderMembersClient />
    </Suspense>
  );
}