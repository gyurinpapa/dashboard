import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/privacy", "/terms"].map((path) => ({
    url: `https://www.etrylue.com${path}`,
  }));
}
