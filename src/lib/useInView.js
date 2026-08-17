import { useEffect, useRef, useState } from "react";

// One-shot "in view" flag for scroll-reveal animations.
// Fail-safe: always reveals eventually (fallback timer + no-IO fallback) so
// content can never get stuck invisible if the observer doesn't fire.
export function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    let fallback;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
          clearTimeout(fallback);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px", ...options }
    );
    io.observe(el);

    // Never leave content hidden (e.g. background tab where IO won't fire).
    fallback = setTimeout(() => {
      setInView(true);
      io.disconnect();
    }, 1500);

    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [inView]);

  return [ref, inView];
}
