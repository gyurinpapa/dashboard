import type { Metadata } from "next";
import { Suspense } from "react";
import { CurrentWorkspaceProvider } from "@/src/lib/workspace/current-workspace";

export const metadata: Metadata = {
  title: "Etrylue Performance | Online Ads Reporting & Analytics",
  description:
    "Etrylue Performance provides advertising performance reporting and analytics, including authorized Google Ads account connections through OAuth 2.0 and Google Ads API access for reporting.",
};

export default function ReportBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<>{children}</>}>
      <CurrentWorkspaceProvider>{children}</CurrentWorkspaceProvider>
    </Suspense>
  );
}