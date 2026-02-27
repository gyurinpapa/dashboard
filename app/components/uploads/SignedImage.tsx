"use client";

import { useEffect, useState } from "react";
import { fetchSignedUrl } from "@/src/lib/uploads/signedUrlClient";

type Props = {
  path: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  shareToken?: string;
  accessToken?: string;
};

export default function SignedImage({
  path,
  alt,
  className,
  style,
  shareToken,
  accessToken,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const signed = await fetchSignedUrl({
        path,
        shareToken,
        accessToken,
      });

      if (!alive) return;
      setUrl(signed);
    })();

    return () => {
      alive = false;
    };
  }, [path, shareToken, accessToken]);

  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f3f3f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          opacity: 0.6,
        }}
      >
        loading...
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...style,
      }}
      loading="lazy"
    />
  );
}