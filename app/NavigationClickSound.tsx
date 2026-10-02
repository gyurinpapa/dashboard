"use client";

import { useEffect } from "react";

export default function NavigationClickSound() {
  useEffect(() => {
    let context: AudioContext | undefined;
    let buffer: AudioBuffer | undefined;
    let disposed = false;
    let lastClick = -Infinity;

    const onClick = (event: MouseEvent) => {
      if (!event.isTrusted || event.button !== 0 || !(event.target instanceof Element)) return;
      const control = event.target.closest(
        'a[href], button, [role="button"], [role="link"], input[type="button"], input[type="submit"]',
      );
      if (!control || control.matches(":disabled") ||
          control.closest('[inert], [aria-disabled="true"]')) return;

      const clickedAt = performance.now();
      if (clickedAt - lastClick < 60) return;
      lastClick = clickedAt;

      try {
        const AudioContextClass = window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        context ??= new AudioContextClass({ latencyHint: "interactive" });
        const audio = context;
        if (!buffer) {
          buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.025), audio.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i += 1) {
            samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.003));
          }
        }

        const play = () => {
          if (disposed || audio.state !== "running" || performance.now() - clickedAt > 150) return;
          try {
            const source = audio.createBufferSource();
            const gain = audio.createGain();
            source.buffer = buffer!;
            gain.gain.value = 0.12;
            source.connect(gain);
            gain.connect(audio.destination);
            source.onended = () => {
              source.disconnect();
              gain.disconnect();
            };
            source.start();
          } catch {
            // Sound must never interrupt the original action.
          }
        };

        if (audio.state === "running") play();
        else void audio.resume().then(play).catch(() => {});
      } catch {
        // Unsupported or blocked audio leaves navigation unchanged.
      }
    };

    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => {
      disposed = true;
      document.removeEventListener("click", onClick, true);
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, []);

  return null;
}
