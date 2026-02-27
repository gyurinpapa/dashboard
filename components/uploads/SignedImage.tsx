// app/components/uploads/SignedImage.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSignedUrl } from "@/src/lib/uploads/signedUrlClient";

type Props = {
  path: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;

  // 공유 모드
  shareToken?: string;

  // 로그인 모드(필요한 곳만)
  accessToken?: string;

  // lazy 옵션
  rootMargin?: string; // e.g. "400px"
  threshold?: number; // 0~1
};

/** ---------- global cache (per runtime) ---------- */
const urlCache = new Map<string, string>();

/** ---------- global concurrency limiter ---------- */
let inFlight = 0;
const MAX_CONCURRENCY = 4;
const queue: Array<() => void> = [];

function runNext() {
  if (inFlight >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;
  job();
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job = async () => {
      inFlight += 1;
      try {
        const v = await fn();
        resolve(v);
      } catch (e) {
        reject(e);
      } finally {
        inFlight -= 1;
        runNext();
      }
    };

    if (inFlight < MAX_CONCURRENCY) job();
    else queue.push(job);
  });
}

export default function SignedImage({
  path,
  alt = "",
  className,
  style,
  shareToken,
  accessToken,
  rootMargin = "400px",
  threshold = 0.01,
}: Props) {
  const key = useMemo(() => {
    const mode = shareToken ? `share:${shareToken}` : accessToken ? "auth" : "none";
    return `${mode}|${path}`;
  }, [path, shareToken, accessToken]);

  const [url, setUrl] = useState<string>(() => urlCache.get(key) || "");
  const [started, setStarted] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cached = urlCache.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    setUrl("");
    setStarted(false);
  }, [key]);

  useEffect(() => {
    if (url) return;

    const el = holderRef.current;
    if (!el) return;

    let alive = true;
    let observer: IntersectionObserver | null = null;

    const start = async () => {
      if (!alive) return;
      if (started) return;
      setStarted(true);

      const got = await enqueue(() =>
        fetchSignedUrl({ path, shareToken, accessToken })
      ).catch(() => null);

      if (!alive) return;
      if (got) {
        urlCache.set(key, got);
        setUrl(got);
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer?.disconnect();
          start();
        }
      },
      { root: null, rootMargin, threshold }
    );

    observer.observe(el);

    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [url, started, path, shareToken, accessToken, key, rootMargin, threshold]);

  return (
    <div ref={holderRef} className={className} style={style}>
      {url ? (
        <img
          src={url}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            opacity: 0.7,
            background: "#f5f5f5",
          }}
        >
          loading...
        </div>
      )}
    </div>
  );
}