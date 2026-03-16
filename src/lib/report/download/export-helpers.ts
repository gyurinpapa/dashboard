export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForFontsReady() {
  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await (document as any).fonts.ready;
    }
  } catch {
    // noop
  }
}

export async function waitForImagesInElement(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));

  if (!images.length) return;

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();

      return new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };

        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    })
  );
}

export async function prepareElementForExport(element: HTMLElement) {
  await waitForFontsReady();
  await waitForImagesInElement(element);
  await sleep(180);
}