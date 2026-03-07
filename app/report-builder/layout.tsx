import { Suspense } from "react";
import { CurrentWorkspaceProvider } from "@/src/lib/workspace/current-workspace";

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