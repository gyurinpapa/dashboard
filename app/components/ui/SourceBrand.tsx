"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { resolveSourceBrand } from "@/src/lib/report/source-brand";

type Props = {
  source: unknown;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
};

const SourceBrand = memo(function SourceBrand({
  source,
  className,
  logoClassName,
  textClassName,
}: Props) {
  const sourceText = String(source ?? "").trim() || "Unknown";
  const brand = useMemo(() => resolveSourceBrand(sourceText), [sourceText]);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [brand?.logoSrc]);

  if (!brand || logoFailed) {
    return (
      <span
        className={["block min-w-0 truncate", className, textClassName]
          .filter(Boolean)
          .join(" ")}
        title={sourceText}
      >
        {sourceText}
      </span>
    );
  }

  return (
    <span
      className={[
        "inline-flex min-w-0 max-w-full items-center gap-2.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={sourceText}
      aria-label={sourceText}
    >
      <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-md border border-[#CFC2B1]/50 bg-white/95">
        <img
          src={brand.logoSrc}
          alt=""
          width={24}
          height={24}
          loading="eager"
          decoding="async"
          draggable={false}
          onError={() => setLogoFailed(true)}
          className={[
            "h-5 w-5 object-contain",
            logoClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </span>

      <span
        className={[
          "min-w-0 truncate",
          textClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {sourceText}
      </span>
    </span>
  );
});

export default SourceBrand;
