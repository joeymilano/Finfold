"use client";

/**
 * Finfold motion primitives — the physics layer of the "Editorial Instrument"
 * design language. Every animation in the product should be built from these
 * primitives so timing, easing and reduced-motion behavior stay consistent.
 *
 * Signature easing: exponential-out (0.16, 1, 0.3, 1) — fast attack, long
 * silk tail. Springs are reserved for elements that respond to the user
 * (cursor, scroll-linked tilt); reveals use the signature ease.
 */

import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Keep the server and first client render identical, then honor reduced
 * motion after hydration. The underlying hook returns `null` on the server
 * but a boolean in the browser, so branching on it directly can change the
 * rendered element tree during hydration.
 */
export function useHydratedReducedMotion(): boolean {
  const prefersReducedMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);
  return hydrated && Boolean(prefersReducedMotion);
}

/* ------------------------------------------------------------------ */
/* Reveal — single element scroll-triggered entrance                   */
/* ------------------------------------------------------------------ */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  amount = 0.3,
  once = true
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
  once?: boolean;
}) {
  const reduce = useHydratedReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: "0px 0px -6% 0px" }}
      transition={{ duration: 0.95, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Stagger / StaggerItem — grouped entrances (grids, lists, cards)     */
/* ------------------------------------------------------------------ */
const staggerContainer = {
  hidden: {},
  show: (gap: number) => ({
    transition: { staggerChildren: gap, delayChildren: 0.05 }
  })
};

export function Stagger({
  children,
  className,
  gap = 0.09,
  amount = 0.2
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: "0px 0px -6% 0px" }}
      variants={staggerContainer}
      custom={gap}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 26
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  const reduce = useHydratedReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.9, ease: EASE }
        }
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* BlurText — cinematic word-by-word blur-in for headlines. Latin     */
/* words stay whole; CJK runs are segmented into single characters    */
/* so Chinese headlines animate per character (zh has no spaces).     */
/* mode="mount" plays on hydration for above-the-fold LCP type;       */
/* mode="inView" waits for scroll entry.                              */
/* ------------------------------------------------------------------ */
const BLUR_CJK =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]|[^\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF\s]+/g;

function segmentBlurText(text: string): Array<{ unit: string; space: boolean }> {
  const tokens: Array<{ unit: string; space: boolean }> = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      tokens.push({ unit: " ", space: true });
      continue;
    }
    for (const run of part.match(BLUR_CJK) ?? []) {
      tokens.push({ unit: run, space: false });
    }
  }
  return tokens;
}

export function BlurText({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.085,
  duration = 0.7,
  y = 22,
  mode = "inView",
  once = true,
  onComplete
}: {
  text: string;
  className?: string;
  /** Applied to each animated unit (e.g. gradient-ink classes on the
   *  hero emphasis line, where background-clip:text must live on the
   *  same element as the filtered text to survive the blur). */
  wordClassName?: string;
  delay?: number;
  /** Seconds between successive units (~80–100ms reads cinematic). */
  stagger?: number;
  duration?: number;
  y?: number;
  mode?: "mount" | "inView";
  once?: boolean;
  /** Fires when the LAST unit finishes animating — lets callers swap
   *  per-unit ink for a whole-line treatment (e.g. background-clip:text
   *  gradients, which cannot survive filters on descendants). */
  onComplete?: () => void;
}) {
  const reduce = useHydratedReducedMotion();
  if (reduce) {
    return <span className={className}>{text}</span>;
  }
  const tokens = segmentBlurText(text);
  const unitCount = tokens.filter((t) => !t.space).length;
  let wordIndex = 0;
  return (
    <span className={className} aria-label={text}>
      {tokens.map((token, i) => {
        if (token.space) {
          return <span key={`space-${i}`}> </span>;
        }
        const thisUnit = wordIndex;
        const unitDelay = delay + wordIndex++ * stagger;
        const trigger =
          mode === "mount"
            ? { animate: { opacity: 1, y: 0, filter: "blur(0px)" } }
            : {
                whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
                viewport: { once, amount: 0.6, margin: "0px 0px -4% 0px" }
              };
        return (
          <motion.span
            key={`${token.unit}-${i}`}
            aria-hidden
            className={`inline-block will-change-transform ${wordClassName ?? ""}`}
            initial={{ opacity: 0, y, filter: "blur(10px)" }}
            {...trigger}
            transition={{ duration, delay: unitDelay, ease: EASE }}
            onAnimationComplete={
              thisUnit === unitCount - 1 ? onComplete : undefined
            }
          >
            {token.unit}
          </motion.span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* MaskReveal — editorial line-by-line title reveal (overflow mask)    */
/* ------------------------------------------------------------------ */
export function MaskReveal({
  children,
  className,
  innerClassName,
  delay = 0,
  once = true,
  mode = "inView"
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  delay?: number;
  once?: boolean;
  /** "mount" plays immediately on hydration (above-the-fold LCP text must
   *  never wait on IntersectionObserver); "inView" plays on scroll entry. */
  mode?: "mount" | "inView";
}) {
  const reduce = useHydratedReducedMotion();
  const trigger =
    mode === "mount"
      ? { animate: { y: "0%" } }
      : {
          whileInView: { y: "0%" },
          viewport: { once, amount: 0.35, margin: "0px 0px -4% 0px" }
        };
  return (
    <span className={`block overflow-hidden ${className ?? ""}`}>
      <motion.span
        className={`block will-change-transform ${innerClassName ?? ""}`}
        initial={reduce ? false : { y: "115%" }}
        {...trigger}
        transition={{ duration: 1.1, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ScrollHighlightText — a restrained, scroll-scrubbed editorial      */
/* highlight. CJK advances character by character; Latin copy moves   */
/* word by word. The text stays fully present for screen readers and  */
/* becomes static when reduced motion is requested.                   */
/* ------------------------------------------------------------------ */
function ScrollHighlightUnit({
  children,
  progress,
  start,
  end
}: {
  children: ReactNode;
  progress: MotionValue<number>;
  start: number;
  end: number;
}) {
  const opacity = useTransform(progress, [start, end], [0.2, 1]);
  return (
    <motion.span aria-hidden className="inline-block" style={{ opacity }}>
      {children}
    </motion.span>
  );
}

export function ScrollHighlightText({
  text,
  className
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 84%", "end 48%"]
  });
  const tokens = segmentBlurText(text);
  const unitCount = Math.max(tokens.filter((token) => !token.space).length, 1);
  let unitIndex = 0;

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span ref={ref} className={className} aria-label={text}>
      {tokens.map((token, index) => {
        if (token.space) {
          return <span key={`space-${index}`}> </span>;
        }
        const position = unitIndex++ / unitCount;
        return (
          <ScrollHighlightUnit
            key={`${token.unit}-${index}`}
            progress={scrollYProgress}
            start={position * 0.82}
            end={Math.min(position * 0.82 + 0.18, 1)}
          >
            {token.unit}
          </ScrollHighlightUnit>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CountUp — numeric metric that counts up when scrolled into view.    */
/* Accepts strings like "13", "90s" — leading digits animate, the rest */
/* is rendered verbatim as a suffix.                                   */
/* ------------------------------------------------------------------ */
export function CountUp({
  value,
  className,
  duration = 1.8
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useHydratedReducedMotion();
  const match = /^(\d+)(.*)$/.exec(value);
  const target = match ? Number.parseInt(match[1], 10) : 0;
  const suffix = match ? match[2] : value;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || !match) return;
    if (reduce) {
      setDisplay(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v))
    });
    return () => controls.stop();
    // `value` is the stable primitive — depending on `match` (a fresh
    // RegExp result every render) would restart the tween every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, target, duration]);

  return (
    <span ref={ref} className={className}>
      <span className="tabular">{match ? display : value}</span>
      {match ? suffix : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Marquee — seamless infinite belt. Content is duplicated for the     */
/* loop; the belt edge-fades via .marquee-mask and pauses on hover.    */
/* ------------------------------------------------------------------ */
export function Marquee({
  children,
  className,
  reverse = false,
  duration = 32,
  pauseOnHover = true
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  duration?: number;
  pauseOnHover?: boolean;
}) {
  const reduce = useHydratedReducedMotion();
  const style: CSSProperties = {
    animationDuration: `${duration}s`,
    animationDirection: reverse ? "reverse" : undefined,
    animationPlayState: reduce ? "paused" : undefined
  };
  return (
    <div className={`marquee-mask overflow-hidden ${className ?? ""}`}>
      <div
        className="rk-marquee-belt flex w-max items-stretch gap-3"
        style={style}
        data-pause-hover={pauseOnHover || undefined}
      >
        <div className="flex items-stretch gap-3 pr-3">{children}</div>
        <div className="flex items-stretch gap-3 pr-3" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TiltOnScroll — scroll-linked 3D perspective settle for hero media.  */
/* The panel starts slightly reclined and levels out as it rises into  */
/* the viewport, like an instrument being set on a table.              */
/* ------------------------------------------------------------------ */
export function TiltOnScroll({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 38%"]
  });
  const rotateRaw = useTransform(scrollYProgress, [0, 1], [9, 0]);
  const rotateX = useSpring(rotateRaw, { stiffness: 110, damping: 22, mass: 0.9 });
  const scale = useTransform(scrollYProgress, [0, 1], [0.965, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.45], [0.35, 1]);

  return (
    <div ref={ref} style={{ perspective: 1400 }}>
      <motion.div
        className={className}
        style={
          reduce
            ? undefined
            : { rotateX, scale, opacity, transformStyle: "preserve-3d" }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parallax — gentle scroll-linked vertical drift for floating badges  */
/* ------------------------------------------------------------------ */
export function Parallax({
  children,
  className,
  distance = 34
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight — cursor-following light pool inside a hero stage. Lives  */
/* on a spring so it lags the pointer with weight, never robotic.      */
/* ------------------------------------------------------------------ */
export function Spotlight({ className }: { className?: string }) {
  const reduce = useHydratedReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.22);
  const sx = useSpring(px, { stiffness: 48, damping: 18, mass: 0.8 });
  const sy = useSpring(py, { stiffness: 48, damping: 18, mass: 0.8 });
  const cx = useTransform(sx, (v) => v * 100);
  const cy = useTransform(sy, (v) => v * 100);
  const background = useMotionTemplate`radial-gradient(36rem 24rem at ${cx}% ${cy}%, rgb(var(--brand) / 0.115), rgb(var(--accent) / 0.05) 46%, transparent 72%)`;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      px.set(e.clientX / window.innerWidth);
      py.set(e.clientY / window.innerHeight);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py]);

  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      style={{ background }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* TypingText — looping typewriter for "the product is live" moments.  */
/* Types, holds, deletes, advances to the next phrase.                 */
/* ------------------------------------------------------------------ */
export function TypingText({
  phrases,
  className,
  typeMs = 52,
  holdMs = 2400,
  deleteMs = 20
}: {
  phrases: readonly string[];
  className?: string;
  typeMs?: number;
  holdMs?: number;
  deleteMs?: number;
}) {
  const reduce = useHydratedReducedMotion();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) {
      setText(phrases[0] ?? "");
      return;
    }
    const current = phrases[index % phrases.length];
    let timer: number | undefined;

    if (phase === "typing") {
      if (text.length < current.length) {
        timer = window.setTimeout(() => setText(current.slice(0, text.length + 1)), typeMs);
      } else {
        timer = window.setTimeout(() => setPhase("holding"), 120);
      }
    } else if (phase === "holding") {
      timer = window.setTimeout(() => setPhase("deleting"), holdMs);
    } else if (text.length > 0) {
      timer = window.setTimeout(() => setText(current.slice(0, text.length - 1)), deleteMs);
    } else {
      setIndex((i) => (i + 1) % phrases.length);
      setPhase("typing");
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [text, phase, index, phrases, reduce, typeMs, holdMs, deleteMs]);

  return (
    <span className={className}>
      {text}
      <span className="typing-caret" aria-hidden="true" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CycleText — rotates through short status words in place (used for   */
/* live-status chips: generating → scoring → ready …)                  */
/* ------------------------------------------------------------------ */
export function CycleText({
  words,
  className,
  intervalMs = 2100
}: {
  words: readonly string[];
  className?: string;
  intervalMs?: number;
}) {
  const reduce = useHydratedReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce || words.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % words.length),
      intervalMs
    );
    return () => window.clearInterval(timer);
  }, [words.length, intervalMs, reduce]);

  return (
    <span className={`relative inline-block overflow-hidden align-bottom ${className ?? ""}`}>
      <motion.span
        key={words[index]}
        className="inline-block"
        initial={reduce ? false : { y: "105%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {words[index]}
      </motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ScoreTicker — small animated number for quality scores inside       */
/* mockups. Counts up once on mount with a springy settle.             */
/* ------------------------------------------------------------------ */
export function ScoreTicker({
  value,
  className,
  delay = 0.4
}: {
  value: number;
  className?: string;
  delay?: number;
}) {
  const reduce = useHydratedReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      delay,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v))
    });
    return () => controls.stop();
  }, [value, delay, reduce]);

  return <span className={`tabular ${className ?? ""}`}>{display}</span>;
}
