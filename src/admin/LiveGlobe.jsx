import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

// Live visitors as glowing dots on a slowly turning globe (cobe, ~13 KB of
// WebGL). Drag to spin it. Labels ride on their dots using CSS anchor
// positioning where the browser supports it, and are simply left out where
// it doesn't. The list beside the globe carries the same information.
//
// dots:   [{ lat, lng, n }] — one per place, busiest first
// labels: [{ dot, text }]   — dot = index into dots

const toAngles = (lat, lng) => [Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
const [HOME_PHI, HOME_THETA] = toAngles(30, 70); // Pakistan, front and centre
const SPIN = 0.0016; // radians per frame

const markerSize = (n) => Math.min(0.11, 0.035 + 0.02 * Math.sqrt(n));

export default function LiveGlobe({ dots, labels }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const dotsRef = useRef(dots);
  dotsRef.current = dots;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let size = wrap.clientWidth || 300;
    let phi = HOME_PHI;
    let drag = null; // { x, phi } while the globe is being dragged
    let inView = true;
    let raf = 0;

    let globe;
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size,
        height: size,
        phi,
        theta: HOME_THETA * 0.6,
        dark: 0,
        diffuse: 1.15,
        scale: 1,
        mapSamples: 16000,
        mapBrightness: 5,
        mapBaseBrightness: 0.02,
        baseColor: [0.97, 0.97, 0.955],
        markerColor: [0.13, 0.63, 0.42],
        glowColor: [0.93, 0.93, 0.91],
        markerElevation: 0.01,
        markers: [],
      });
    } catch {
      setFailed(true);
      return undefined;
    }

    const frame = (now) => {
      raf = 0;
      if (!inView || document.hidden) return;
      if (!drag && !reduced) phi += SPIN;
      // A gentle pulse so the dots read as live.
      const pulse = reduced ? 1 : 1 + 0.16 * Math.sin(now / 420);
      globe.update({
        phi,
        markers: dotsRef.current.map((p, i) => ({
          location: [p.lat, p.lng],
          size: markerSize(p.n) * pulse,
          id: `p${i}`,
        })),
      });
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf && inView && !document.hidden) raf = requestAnimationFrame(frame);
    };
    start();

    // Drag to spin; vertical swipes still scroll the page on phones.
    const down = (e) => {
      drag = { x: e.clientX, phi };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e) => {
      if (drag) phi = drag.phi + ((e.clientX - drag.x) / size) * Math.PI;
    };
    const up = () => {
      drag = null;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const resize = new ResizeObserver(() => {
      size = wrap.clientWidth || size;
      globe.update({ width: size, height: size });
    });
    resize.observe(wrap);
    // Pause the animation while scrolled away or in the background.
    const seen = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      start();
    });
    seen.observe(wrap);
    document.addEventListener("visibilitychange", start);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", start);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      globe.destroy();
    };
  }, []);

  if (failed) return null;
  return (
    <div className="adm-globe" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label="Globe showing where visitors are right now" />
      {labels.map((l) => (
        <span
          key={l.dot}
          className="adm-globe-label"
          style={{ positionAnchor: `--cobe-p${l.dot}`, opacity: `var(--cobe-visible-p${l.dot}, 0)` }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
