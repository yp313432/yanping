import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

/**
 * 兜底路由：**任何路径**都渲染时感这一页。
 *
 * 为什么需要：时感被打进栖岛的安卓 App 之后，嵌入用的地址是
 * `/shigan/index.html`。路由看到这个路径会当成"不存在的页面"，
 * 于是渲染 Not Found —— 用户看到的就是一片空白（而且看不出是没加载还是坏了）。
 *
 * 时感本来就只有这一个页面，所以任何路径都给同一页最省事，
 * 也让"打进 App"这件事对路径不再敏感。
 */
export const Route = createFileRoute("/$")({
  component: () => <AppShell />,
});
