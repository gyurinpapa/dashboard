import { Suspense } from "react";
import { connection } from "next/server";
import ReportBuilderMembersClient from "./ReportBuilderMembersClient";

const membersPageBackground =
  "radial-gradient(circle at 18% 0%, rgba(33, 223, 243, 0.10), transparent 30%), radial-gradient(circle at 82% 12%, rgba(124, 92, 255, 0.18), transparent 34%), linear-gradient(135deg, #251b4d 0%, #2c2061 48%, #211a46 100%)";

export default async function ReportBuilderMembersPage() {
  await connection();

  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: membersPageBackground,
            backgroundAttachment: "fixed",
            color: "#c8c5df",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          멤버 관리 페이지 불러오는 중...
        </div>
      }
    >
      <ReportBuilderMembersClient />
    </Suspense>
  );
}
