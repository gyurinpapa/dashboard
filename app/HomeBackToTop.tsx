"use client";

import { useEffect, useState, type MouseEvent } from "react";
import styles from "./home.module.css";

export default function HomeBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  function goToTop(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" });
  }

  if (!visible) return null;

  return (
    <a className={styles.backToTop} href="#top" onClick={goToTop} aria-label="페이지 맨 위로 이동" title="맨 위로">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20V4m-7 7 7-7 7 7" /></svg>
    </a>
  );
}
