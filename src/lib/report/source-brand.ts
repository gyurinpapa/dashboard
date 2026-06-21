// src/lib/report/source-brand.ts

export type SourceBrandKey =
  | "adn"
  | "criteo"
  | "facebook"
  | "google"
  | "instagram"
  | "kakao"
  | "meta"
  | "mobon"
  | "naver"
  | "naver-gfa"
  | "youtube";

export type SourceBrandDefinition = {
  key: SourceBrandKey;
  label: string;
  logoSrc: string;
};

const SOURCE_BRANDS: Record<SourceBrandKey, SourceBrandDefinition> = {
  adn: {
    key: "adn",
    label: "ADN",
    logoSrc: "/source-logos/ADN.png",
  },
  criteo: {
    key: "criteo",
    label: "Criteo",
    logoSrc: "/source-logos/criteo.png",
  },
  facebook: {
    key: "facebook",
    label: "Facebook",
    logoSrc: "/source-logos/facebook.png",
  },
  google: {
    key: "google",
    label: "Google",
    logoSrc: "/source-logos/google.png",
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    logoSrc: "/source-logos/instagram.png",
  },
  kakao: {
    key: "kakao",
    label: "Kakao",
    logoSrc: "/source-logos/kakao.png",
  },
  meta: {
    key: "meta",
    label: "Meta",
    logoSrc: "/source-logos/meta.png",
  },
  mobon: {
    key: "mobon",
    label: "Mobon",
    logoSrc: "/source-logos/mobon.png",
  },
  naver: {
    key: "naver",
    label: "Naver",
    logoSrc: "/source-logos/naver.png",
  },
  "naver-gfa": {
    key: "naver-gfa",
    label: "Naver GFA",
    logoSrc: "/source-logos/naverGFA.png",
  },
  youtube: {
    key: "youtube",
    label: "YouTube",
    logoSrc: "/source-logos/YouTube.png",
  },
};

function normalizeSourceName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s._\-/()\[\]{}]+/g, "");
}

export function resolveSourceBrand(
  source: unknown,
): SourceBrandDefinition | null {
  const normalized = normalizeSourceName(source);

  if (!normalized) return null;

  // 구체적인 매체명을 먼저 판별해 상위 브랜드로 잘못 묶이지 않게 한다.
  if (
    normalized.includes("navergfa") ||
    normalized.includes("네이버gfa") ||
    normalized === "gfa" ||
    normalized.includes("성과형디스플레이")
  ) {
    return SOURCE_BRANDS["naver-gfa"];
  }

  if (
    normalized.includes("instagram") ||
    normalized.includes("인스타그램") ||
    normalized === "insta"
  ) {
    return SOURCE_BRANDS.instagram;
  }

  if (
    normalized.includes("facebook") ||
    normalized.includes("페이스북") ||
    normalized === "fb"
  ) {
    return SOURCE_BRANDS.facebook;
  }

  if (
    normalized.includes("youtube") ||
    normalized.includes("유튜브") ||
    normalized.includes("ytads")
  ) {
    return SOURCE_BRANDS.youtube;
  }

  if (
    normalized.includes("google") ||
    normalized.includes("구글") ||
    normalized.includes("googleads")
  ) {
    return SOURCE_BRANDS.google;
  }

  if (
    normalized.includes("meta") ||
    normalized.includes("메타") ||
    normalized.includes("facebookinstagram") ||
    normalized.includes("fbig")
  ) {
    return SOURCE_BRANDS.meta;
  }

  if (
    normalized.includes("naver") ||
    normalized.includes("네이버") ||
    normalized.includes("파워링크") ||
    normalized.includes("브랜드검색")
  ) {
    return SOURCE_BRANDS.naver;
  }

  if (normalized.includes("kakao") || normalized.includes("카카오")) {
    return SOURCE_BRANDS.kakao;
  }

  if (normalized.includes("criteo") || normalized.includes("크리테오")) {
    return SOURCE_BRANDS.criteo;
  }

  if (normalized.includes("mobon") || normalized.includes("모비온")) {
    return SOURCE_BRANDS.mobon;
  }

  if (
    normalized === "adn" ||
    normalized.includes("adnetwork") ||
    normalized.includes("에이디엔")
  ) {
    return SOURCE_BRANDS.adn;
  }

  return null;
}
