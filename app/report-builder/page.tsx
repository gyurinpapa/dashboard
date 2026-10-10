import { Suspense } from "react";
import { connection } from "next/server";
import ReportBuilderClient from "./ReportBuilderClient";

export default async function ReportBuilderPage() {
  await connection();

  return (
    <Suspense
      fallback={
        <main style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "100%",
              maxWidth: 1200,
              padding: 24,
            }}
          >
            <div
              style={{
                background: "#f5a62333",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 20,
                padding: 32,
                color: "#6b7280",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              Report Builder 불러오는 중...
            </div>
          </div>
        </main>
      }
    >
      <ReportBuilderClient />
    </Suspense>
  );
}