import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { a as describeDuration, i as defaultTimezone, n as buildPluginPrompt, o as formatClockParts, r as buildTemporalContext, s as formatDateTime, t as buildGap } from "./time-2E0RmrCz.mjs";
import { a as Copy, c as ArrowUp, i as LoaderCircle, n as Rows3, o as Clock3, r as MessageSquare, s as Check } from "../_libs/lucide-react.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BVvNussY.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:not-disabled:scale-[0.96] transition-[scale,background-color,color,opacity] duration-150 ease-out", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:bg-fg",
			secondary: "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-2",
			danger: "bg-danger/15 text-danger hover:bg-danger/25"
		},
		size: {
			sm: "h-9 rounded-sm px-3 text-sm",
			md: "h-11 rounded-md px-4 text-sm",
			lg: "h-12 rounded-lg px-5 text-base",
			icon: "size-11 rounded-md"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
var Textarea = import_react.forwardRef(function Textarea({ className, ...props }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		ref,
		className: cn("w-full resize-none bg-surface-2 text-fg placeholder:text-subtle", "rounded-lg px-4 py-3 text-base leading-normal", "shadow-[var(--shadow-border)]", "focus-visible:outline-none focus-visible:shadow-[var(--shadow-border-hover)]", "focus-visible:ring-2 focus-visible:ring-accent/40", "disabled:opacity-50", className),
		...props
	});
});
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var askTimeAware = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("c67f7e6148342ce2704eb7f62873f4911280a00a1094ad54bd6691214436cb3d"));
function uid() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function titleFrom(text) {
	const t = text.replace(/\s+/g, " ").trim();
	if (!t) return "未命名对话";
	return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}
function previousConversationAt(conversations, simulatedLastAt, activeId) {
	if (simulatedLastAt != null) return simulatedLastAt;
	const prior = [...conversations.filter((c) => c.messages.length > 0)].reverse().find((c) => c.id !== activeId);
	return prior ? prior.lastAt : null;
}
var useSessions = create()(persist((set, get) => ({
	conversations: [],
	activeId: null,
	firstSeenAt: null,
	lastSeenAt: null,
	simulatedLastAt: null,
	touch: (at = Date.now()) => {
		set({
			lastSeenAt: at,
			firstSeenAt: get().firstSeenAt ?? at
		});
	},
	startNew: (at = Date.now()) => {
		const id = uid();
		const next = {
			id,
			startedAt: at,
			lastAt: at,
			title: "新的对话",
			messages: []
		};
		set((s) => ({
			conversations: [...s.conversations, next],
			activeId: id
		}));
		return id;
	},
	addMessage: (role, content, at = Date.now()) => {
		const message = {
			id: uid(),
			role,
			content,
			at
		};
		set((s) => {
			const convs = s.conversations;
			const existing = convs.find((c) => c.id === s.activeId && !c.ghost);
			if (!existing || role === "user" && at - existing.lastAt >= 18e5 || !existing) {
				const created = {
					id: uid(),
					startedAt: at,
					lastAt: at,
					title: role === "user" ? titleFrom(content) : "新的对话",
					messages: [message]
				};
				return {
					conversations: [...convs, created],
					activeId: created.id,
					simulatedLastAt: null,
					lastSeenAt: at,
					firstSeenAt: s.firstSeenAt ?? at
				};
			}
			const title = existing.messages.length === 0 && role === "user" ? titleFrom(content) : existing.title;
			const updated = {
				...existing,
				title,
				lastAt: at,
				messages: [...existing.messages, message]
			};
			return {
				conversations: convs.map((c) => c.id === updated.id ? updated : c),
				activeId: updated.id,
				lastSeenAt: at,
				firstSeenAt: s.firstSeenAt ?? at
			};
		});
		return message;
	},
	simulateAgo: (ms) => {
		const stamp = Date.now() - ms;
		set((s) => {
			const real = s.conversations.filter((c) => !c.ghost && c.messages.length > 0);
			if (real.length > 0) {
				const last = real[real.length - 1];
				return {
					conversations: s.conversations.map((c) => c.id === last.id ? {
						...c,
						lastAt: stamp
					} : c),
					simulatedLastAt: stamp
				};
			}
			return {
				conversations: [{
					id: "ghost",
					startedAt: stamp - 48e4,
					lastAt: stamp,
					title: "一次短暂的问候",
					ghost: true,
					messages: [{
						id: "ghost-user",
						role: "user",
						content: "你好。",
						at: stamp - 42e4
					}, {
						id: "ghost-ai",
						role: "assistant",
						content: "你好。我在。",
						at: stamp
					}]
				}, ...s.conversations.filter((c) => !c.ghost)],
				simulatedLastAt: stamp
			};
		});
	},
	clearSimulation: () => {
		set((s) => ({
			simulatedLastAt: null,
			conversations: s.conversations.filter((c) => !c.ghost)
		}));
	},
	clearAll: () => {
		set({
			conversations: [],
			activeId: null,
			simulatedLastAt: null
		});
	}
}), {
	name: "shigan-sessions-v1",
	partialize: (s) => ({
		conversations: s.conversations,
		activeId: s.activeId,
		firstSeenAt: s.firstSeenAt,
		lastSeenAt: s.lastSeenAt,
		simulatedLastAt: s.simulatedLastAt
	})
}));
function ChatPanel({ now, gap, viewing, onViewLive }) {
	const activeId = useSessions((s) => s.activeId);
	const addMessage = useSessions((s) => s.addMessage);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [pending, setPending] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const scroller = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const isHistorical = viewing != null && viewing.id !== activeId && !pending;
	const messages = viewing?.messages ?? [];
	(0, import_react.useEffect)(() => {
		const el = scroller.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [messages, pending]);
	async function send() {
		const text = draft.trim();
		if (!text || pending) return;
		setDraft("");
		setError(null);
		setPending(true);
		onViewLive();
		const before = useSessions.getState();
		const previousAt = previousConversationAt(before.conversations, before.simulatedLastAt, before.activeId);
		addMessage("user", text, now.at);
		const state = useSessions.getState();
		const sessions = state.conversations.filter((c) => c.messages.length > 0).map((c) => ({
			title: c.title,
			startedAt: c.startedAt,
			lastAt: c.lastAt
		}));
		const history = state.conversations.filter((c) => !c.ghost).flatMap((c) => c.messages.map((m) => ({
			role: m.role,
			content: m.content
		})));
		try {
			const result = await askTimeAware({ data: {
				messages: history,
				timezone: now.timezone,
				previousAt,
				sessions
			} });
			if (result.ok) addMessage("assistant", result.text);
			else setError(result.error);
		} catch {
			setError("网络没有把话送出去。时间还在走，可以再试一次。");
		} finally {
			setPending(false);
			inputRef.current?.focus();
		}
	}
	function onKeyDown(e) {
		if (e.nativeEvent.isComposing || e.key === "Process") return;
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex min-h-0 flex-1 flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-b border-border px-4 py-3 lg:px-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-muted",
					suppressHydrationWarning: true,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg",
							children: now.greeting
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-subtle",
							children: " · "
						}),
						now.localeDate,
						" ",
						now.timeShort,
						" ",
						now.timeOfDayLabel,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-subtle",
							children: " · "
						}),
						gap.category === "first" ? "第一次对话" : `距上次 ${gap.human}`
					]
				}), isHistorical && viewing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: onViewLive,
					className: "mt-1 text-xs text-accent underline-offset-2 hover:underline",
					children: [
						"正在看 ",
						formatDateTime(viewing.startedAt),
						" 的对话 · 回到此刻"
					]
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: scroller,
				className: "min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8",
				children: messages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
					now,
					gap
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-xl flex-col gap-4",
					children: [
						gap.category !== "first" && gap.category !== "continuous" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GapRule, { label: `距上次对话 ${gap.human}` }) : null,
						messages.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: cn("max-w-xl px-4 py-3 text-sm leading-relaxed", m.role === "user" ? "rounded-xl rounded-br-sm bg-surface-2 text-fg shadow-[var(--shadow-border)]" : "rounded-xl rounded-bl-sm text-fg"),
								children: m.content
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", {
								className: "px-1 font-mono text-xs tabular-nums text-subtle",
								dateTime: new Date(m.at).toISOString(),
								children: formatDateTime(m.at)
							})]
						}, m.id)),
						pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "shimmer font-serif text-sm",
							children: "感知此刻…"
						}) : null,
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-danger",
							children: error
						}) : null
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
				className: "border-t border-border p-3 lg:p-4",
				onSubmit: (e) => {
					e.preventDefault();
					send();
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-xl items-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
						ref: inputRef,
						rows: 1,
						value: draft,
						onChange: (e) => setDraft(e.target.value),
						onKeyDown,
						disabled: pending,
						placeholder: "说点什么。时间会被一起送进去。",
						className: "max-h-36 min-h-12 py-3"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						size: "icon",
						disabled: pending || !draft.trim(),
						"aria-label": "发送",
						className: "shrink-0",
						children: pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, { className: "size-4" })
					})]
				})
			})
		]
	});
}
function GapRule({ label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3 py-1",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-border" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-xs tracking-wide text-subtle",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-border" })
		]
	});
}
function EmptyState({ now, gap }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "stagger-in mx-auto flex max-w-md flex-col justify-center gap-4 px-2 py-12",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "font-serif text-2xl leading-snug text-fg",
			suppressHydrationWarning: true,
			children: [
				now.greeting,
				"。现在是 ",
				now.timeShort,
				"。"
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "text-sm leading-relaxed text-muted",
			suppressHydrationWarning: true,
			children: ["时感会把日期、时刻、时辰，以及每次对话之间隔了多久，悄悄交给模型。", gap.category === "first" ? "这是你们的第一次。" : `距离上次已经过去 ${gap.human}。`]
		})]
	});
}
function round(n) {
	return Math.round(n * 1e3) / 1e3;
}
function ClockFace({ at, className, size = 220 }) {
	const hourRef = (0, import_react.useRef)(null);
	const minuteRef = (0, import_react.useRef)(null);
	const secondRef = (0, import_react.useRef)(null);
	const arcRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const apply = (t) => {
			const d = new Date(t);
			const s = d.getSeconds() + d.getMilliseconds() / 1e3;
			const m = d.getMinutes() + s / 60;
			const h = d.getHours() % 12 + m / 60;
			const day = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
			if (hourRef.current) hourRef.current.style.transform = `rotate(${h * 30}deg)`;
			if (minuteRef.current) minuteRef.current.style.transform = `rotate(${m * 6}deg)`;
			if (secondRef.current) secondRef.current.style.transform = `rotate(${s * 6}deg)`;
			if (arcRef.current) {
				const c = 2 * Math.PI * 46;
				arcRef.current.style.strokeDasharray = `${c * day} ${c}`;
			}
		};
		apply(at);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let frame = 0;
		const loop = () => {
			apply(Date.now());
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, []);
	const ticks = Array.from({ length: 60 }, (_, i) => i);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 100 100",
		width: size,
		height: size,
		className: cn("text-fg", className),
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "48",
				fill: "none",
				stroke: "currentColor",
				strokeOpacity: "0.12",
				strokeWidth: "0.6"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				ref: arcRef,
				cx: "50",
				cy: "50",
				r: "46",
				fill: "none",
				stroke: "var(--color-accent)",
				strokeWidth: "0.7",
				strokeLinecap: "round",
				strokeDasharray: "0 289",
				transform: "rotate(-90 50 50)",
				opacity: "0.7"
			}),
			ticks.map((i) => {
				const major = i % 5 === 0;
				const a = i / 60 * Math.PI * 2;
				const inner = major ? 41.5 : 43.2;
				const outer = 45.6;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
					x1: round(50 + Math.sin(a) * inner),
					y1: round(50 - Math.cos(a) * inner),
					x2: round(50 + Math.sin(a) * outer),
					y2: round(50 - Math.cos(a) * outer),
					stroke: "currentColor",
					strokeOpacity: major ? .55 : .18,
					strokeWidth: major ? .7 : .35,
					strokeLinecap: "round"
				}, i);
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: hourRef,
				className: "clock-hand",
				x1: "50",
				y1: "50",
				x2: "50",
				y2: "29",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: minuteRef,
				className: "clock-hand",
				x1: "50",
				y1: "50",
				x2: "50",
				y2: "22",
				stroke: "currentColor",
				strokeWidth: "1.1",
				strokeLinecap: "round",
				opacity: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: secondRef,
				className: "clock-hand clock-hand-second",
				x1: "50",
				y1: "56",
				x2: "50",
				y2: "18",
				stroke: "var(--color-accent)",
				strokeWidth: "0.5",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "1.6",
				fill: "var(--color-accent)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "0.7",
				fill: "var(--color-bg)"
			})
		]
	});
}
function timezoneLine(now) {
	if (now.timezone === "UTC") return now.utcOffset;
	return `${now.timezone} · ${now.utcOffset}`;
}
function TimeAside({ now, gap, prompt, compact }) {
	const parts = formatClockParts(now.at);
	const [copied, setCopied] = (0, import_react.useState)(false);
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}
	if (compact) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "flex items-center gap-3 border-b border-border px-4 py-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClockFace, {
				at: now.at,
				size: 48,
				className: "shrink-0"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-mono text-xl tabular-nums leading-none tracking-tight",
					suppressHydrationWarning: true,
					children: [
						parts.h,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted",
							children: ":"
						}),
						parts.m,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-subtle",
							children: [":", parts.s]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 truncate text-xs text-muted",
					suppressHydrationWarning: true,
					children: [
						now.weekdayShort,
						" · ",
						now.timeOfDayLabel,
						" · ",
						now.shichen.name,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-subtle",
							children: " · "
						}),
						gap.category === "first" ? "初次" : `间隔 ${gap.human}`
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				size: "icon",
				"aria-label": "复制时感提示词",
				onClick: copyPrompt,
				className: "shrink-0",
				children: copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" })
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "flex h-full min-h-0 flex-col gap-6 p-6 lg:p-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "stagger-in flex flex-col gap-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-widest text-muted",
					children: "时感"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-serif text-lg text-fg",
					children: "让 AI 感觉到时间"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex justify-center py-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClockFace, {
						at: now.at,
						size: 200
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-mono text-5xl leading-none tracking-tight tabular-nums",
						"aria-live": "polite",
						"aria-atomic": "true",
						suppressHydrationWarning: true,
						children: [
							parts.h,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted",
								children: ":"
							}),
							parts.m,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-2xl text-subtle",
								children: [":", parts.s]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 font-serif text-lg text-fg",
						suppressHydrationWarning: true,
						children: [
							now.localeDate,
							" ",
							now.weekday
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm text-muted",
						suppressHydrationWarning: true,
						children: [
							now.timeOfDayLabel,
							" · ",
							now.shichen.name,
							" ",
							now.shichen.poetic,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-subtle",
								children: " · "
							}),
							now.season,
							"季 ",
							now.solarTerm.name
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-subtle",
						suppressHydrationWarning: true,
						children: timezoneLine(now)
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs font-medium tracking-wide text-muted",
							children: "距上次对话"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-serif text-2xl leading-snug",
							suppressHydrationWarning: true,
							children: gap.category === "first" ? "尚未开始" : gap.human
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm leading-relaxed text-muted",
							suppressHydrationWarning: true,
							children: gap.category === "first" ? "说第一句话，时间就会被记住。" : gap.previousLabel ? `上次是 ${gap.previousLabel}` : ""
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
					className: "group rounded-xl bg-surface-2 shadow-[var(--shadow-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
						className: "cursor-pointer list-none px-4 py-3 text-sm text-muted transition-colors duration-150 hover:text-fg",
						children: "查看将注入模型的提示词"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
						className: "max-h-48 overflow-auto px-4 pb-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-subtle",
						suppressHydrationWarning: true,
						children: prompt
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-auto flex flex-col gap-2 pt-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: copyPrompt,
				variant: "secondary",
				className: "w-full",
				children: copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }), "已复制提示词"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), "复制时感提示词"] })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-center text-xs leading-relaxed text-subtle",
				children: "可贴到其他对话里，让那边的模型也知道此刻。"
			})]
		})]
	});
}
var DEMOS = [
	{
		label: "两小时",
		ms: 72e5
	},
	{
		label: "隔夜",
		ms: 504e5
	},
	{
		label: "三天",
		ms: 2592e5
	},
	{
		label: "一周",
		ms: 6048e5
	},
	{
		label: "一个月",
		ms: 2592e6
	}
];
function TimelinePanel({ conversations, activeId, simulated, onSimulate, onClearSimulation, onSelect, onNew, onReset }) {
	const items = conversations.filter((c) => c.messages.length > 0 || c.id === activeId);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex h-full flex-col gap-5 p-5 lg:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium tracking-widest text-muted",
				children: "间隔"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 font-serif text-lg",
				children: "每次对话之间"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-2 text-xs text-subtle",
				children: "模拟距上次的间隔"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [DEMOS.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => onSimulate(d.ms),
					children: d.label
				}, d.label)), simulated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: onClearSimulation,
					children: "清除"
				}) : null]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "min-h-0 flex-1 space-y-0 overflow-y-auto pr-1",
				children: items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "text-sm leading-relaxed text-muted",
					children: "还没有对话。开口之后，这里会记下每一次，以及中间隔了多久。"
				}) : items.map((c, i) => {
					const prev = i > 0 ? items[i - 1] : null;
					const gap = prev ? buildGap(c.startedAt, prev.lastAt) : null;
					const active = c.id === activeId;
					const duration = describeDuration(Math.max(0, c.lastAt - c.startedAt));
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [gap && gap.category !== "continuous" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "relative ml-3 border-l border-border py-3 pl-5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs tracking-wide text-subtle",
							children: ["间隔 ", gap.human]
						})
					}) : i > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ml-3 h-3 border-l border-border" }) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => onSelect(c.id),
						className: cn("relative flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left", "transition-[background-color,box-shadow] duration-150 ease-out", active ? "bg-surface-2 shadow-[var(--shadow-border)]" : "hover:bg-surface-2/60"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("mt-1.5 size-2.5 shrink-0 rounded-full", c.ghost ? "bg-subtle" : active ? "bg-accent" : "bg-muted") }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "block truncate text-sm text-fg",
								children: [c.ghost ? "演示 · " : "", c.title]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mt-0.5 block text-xs text-subtle",
								children: [formatDateTime(c.startedAt), c.messages.length > 1 ? ` · ${duration}` : ""]
							})]
						})]
					})] }, c.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					className: "flex-1",
					onClick: onNew,
					children: "新对话"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					onClick: onReset,
					children: "清空"
				})]
			})
		]
	});
}
function useNow(intervalMs = 1e3) {
	const [now, setNow] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setNow(Date.now());
		const ms = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? Math.max(intervalMs, 1e3) : intervalMs;
		const id = window.setInterval(() => setNow(Date.now()), ms);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
function AppShell() {
	const nowMs = useNow(1e3);
	if (nowMs == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col items-center justify-center bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs font-medium tracking-widest text-muted",
			children: "时感"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 font-serif text-lg",
			children: "让 AI 感觉到时间"
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShellLive, { nowMs });
}
function AppShellLive({ nowMs }) {
	const timezone = (0, import_react.useMemo)(() => defaultTimezone(), []);
	const now = (0, import_react.useMemo)(() => buildTemporalContext(nowMs, timezone), [nowMs, timezone]);
	const conversations = useSessions((s) => s.conversations);
	const activeId = useSessions((s) => s.activeId);
	const simulatedLastAt = useSessions((s) => s.simulatedLastAt);
	const touch = useSessions((s) => s.touch);
	const startNew = useSessions((s) => s.startNew);
	const simulateAgo = useSessions((s) => s.simulateAgo);
	const clearSimulation = useSessions((s) => s.clearSimulation);
	const clearAll = useSessions((s) => s.clearAll);
	const [viewId, setViewId] = (0, import_react.useState)(null);
	const [tab, setTab] = (0, import_react.useState)("chat");
	(0, import_react.useEffect)(() => {
		document.documentElement.dataset.tod = now.timeOfDay;
	}, [now.timeOfDay]);
	(0, import_react.useEffect)(() => {
		touch();
		const id = window.setInterval(() => touch(), 15e3);
		return () => window.clearInterval(id);
	}, [touch]);
	const previousAt = previousConversationAt(conversations, simulatedLastAt, viewId ?? activeId);
	const gap = buildGap(now.at, previousAt);
	const sessions = conversations.filter((c) => c.messages.length > 0).map((c) => ({
		title: c.title,
		startedAt: c.startedAt,
		lastAt: c.lastAt
	}));
	const prompt = buildPluginPrompt({
		now,
		gap,
		sessions,
		sessionIndex: Math.max(1, sessions.length)
	});
	const viewing = conversations.find((c) => c.id === (viewId ?? activeId)) ?? null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:flex-row",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "hidden w-80 shrink-0 overflow-y-auto border-r border-border lg:block",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap,
						prompt
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("lg:hidden", tab === "time" && "min-h-0 flex-1 overflow-y-auto"),
					children: tab === "time" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap,
						prompt
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap,
						prompt,
						compact: true
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: cn("min-h-0 min-w-0 flex-1 flex-col bg-bg", tab === "chat" ? "flex" : "hidden lg:flex"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatPanel, {
						now,
						gap,
						viewing,
						onViewLive: () => {
							setViewId(null);
							setTab("chat");
						}
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("min-h-0 w-full shrink-0 overflow-y-auto border-t border-border lg:w-72 lg:border-t-0 lg:border-l", tab === "gaps" ? "flex-1 lg:flex-none" : "hidden lg:block"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelinePanel, {
						conversations,
						activeId: viewId ?? activeId,
						simulated: simulatedLastAt != null,
						onSimulate: (ms) => {
							simulateAgo(ms);
							setTab("chat");
						},
						onClearSimulation: clearSimulation,
						onSelect: (id) => {
							setViewId(id);
							setTab("chat");
						},
						onNew: () => {
							startNew();
							setViewId(null);
							setTab("chat");
						},
						onReset: () => {
							clearAll();
							setViewId(null);
						}
					})
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
			className: "grid grid-cols-3 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden",
			"aria-label": "主导航",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "time",
					onClick: () => setTab("time"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock3, { className: "size-4" }),
					label: "此刻"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "chat",
					onClick: () => setTab("chat"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "size-4" }),
					label: "对话"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "gaps",
					onClick: () => setTab("gaps"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows3, { className: "size-4" }),
					label: "间隔"
				})
			]
		})]
	});
}
function NavBtn({ active, onClick, icon, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex h-14 flex-col items-center justify-center gap-1 text-xs tracking-wide", "transition-colors duration-150 ease-out", active ? "text-fg" : "text-subtle"),
		children: [icon, label]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {});
}
//#endregion
export { Home as component };
