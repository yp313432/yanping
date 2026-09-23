import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  at: number;
  className?: string;
  size?: number;
};

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function ClockFace({ at, className, size = 220 }: Props) {
  const hourRef = useRef<SVGLineElement>(null);
  const minuteRef = useRef<SVGLineElement>(null);
  const secondRef = useRef<SVGLineElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const apply = (t: number) => {
      const d = new Date(t);
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      const day =
        (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;

      if (hourRef.current) {
        hourRef.current.style.transform = `rotate(${h * 30}deg)`;
      }
      if (minuteRef.current) {
        minuteRef.current.style.transform = `rotate(${m * 6}deg)`;
      }
      if (secondRef.current) {
        secondRef.current.style.transform = `rotate(${s * 6}deg)`;
      }
      if (arcRef.current) {
        const c = 2 * Math.PI * 46;
        arcRef.current.style.strokeDasharray = `${c * day} ${c}`;
      }
    };

    apply(at);

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    let frame = 0;
    const loop = () => {
      apply(Date.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rAF loop owns subsequent frames
  }, []);

  const ticks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("text-fg", className)}
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="0.6"
      />
      <circle
        ref={arcRef}
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeDasharray="0 289"
        transform="rotate(-90 50 50)"
        opacity="0.7"
      />
      {ticks.map((i) => {
        const major = i % 5 === 0;
        const a = (i / 60) * Math.PI * 2;
        const inner = major ? 41.5 : 43.2;
        const outer = 45.6;
        return (
          <line
            key={i}
            x1={round(50 + Math.sin(a) * inner)}
            y1={round(50 - Math.cos(a) * inner)}
            x2={round(50 + Math.sin(a) * outer)}
            y2={round(50 - Math.cos(a) * outer)}
            stroke="currentColor"
            strokeOpacity={major ? 0.55 : 0.18}
            strokeWidth={major ? 0.7 : 0.35}
            strokeLinecap="round"
          />
        );
      })}
      <line
        ref={hourRef}
        className="clock-hand"
        x1="50"
        y1="50"
        x2="50"
        y2="29"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        ref={minuteRef}
        className="clock-hand"
        x1="50"
        y1="50"
        x2="50"
        y2="22"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.9"
      />
      <line
        ref={secondRef}
        className="clock-hand clock-hand-second"
        x1="50"
        y1="56"
        x2="50"
        y2="18"
        stroke="var(--color-accent)"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="1.6" fill="var(--color-accent)" />
      <circle cx="50" cy="50" r="0.7" fill="var(--color-bg)" />
    </svg>
  );
}
