import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/report-builder",
        "/reports",
        "/share/",
        "/client/",
        "/invite/",
        "/signup",
        "/login",
        "/admin",
      ],
    },
    sitemap: "https://www.etrylue.com/sitemap.xml",
  };
}
