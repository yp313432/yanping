import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { n as buildPluginPrompt, r as buildTemporalContext, t as buildGap } from "./time-2E0RmrCz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/chat-D0cOsm7t.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var askTimeAware_createServerFn_handler = createServerRpc({
	id: "c67f7e6148342ce2704eb7f62873f4911280a00a1094ad54bd6691214436cb3d",
	name: "askTimeAware",
	filename: "src/lib/chat.ts"
}, (opts) => askTimeAware.__executeServer(opts));
var askTimeAware = createServerFn({ method: "POST" }).validator((input) => input).handler(askTimeAware_createServerFn_handler, async ({ data }) => {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "此刻的语言模型不可用，请稍后再试。时间插件本身仍在走。"
	};
	const now = Date.now();
	const ctx = buildTemporalContext(now, data.timezone || "Local");
	const gap = buildGap(now, data.previousAt);
	const system = buildPluginPrompt({
		now: ctx,
		gap,
		sessions: data.sessions,
		sessionIndex: Math.max(1, data.sessions.length)
	});
	const history = data.messages.slice(-20).map((m) => ({
		role: m.role,
		content: m.content
	}));
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			max_tokens: 900,
			temperature: .7,
			messages: [{
				role: "system",
				content: system
			}, ...history]
		})
	});
	if (!res.ok) return {
		ok: false,
		error: `模型暂时没有回应（${res.status}）。时间仍在走。`
	};
	const text = (await res.json()).choices?.[0]?.message?.content?.trim() ?? "";
	if (!text) return {
		ok: false,
		error: "模型没有返回内容。"
	};
	return {
		ok: true,
		text
	};
});
//#endregion
export { askTimeAware_createServerFn_handler };
