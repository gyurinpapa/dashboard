import type { ReactNode } from "react";
import { HomeHeader, HomeFooter } from "./HomeChrome";
import home from "./home.module.css";
import billing from "./pricing/billing.module.css";

/** Reuse the homepage shell, logo asset, gradients, footer and responsive rules. */
export default function PublicSiteShell({ children }: { children: ReactNode }) {
  return <div className={home.page}>
    <HomeHeader />
    <main id="top" className={billing.content}>{children}</main>
    <HomeFooter />
  </div>;
}
