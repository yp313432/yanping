import { G as require_jsx_runtime } from "./_libs/@tanstack/react-router+[...].mjs";
import { t as AppShell } from "./_ssr/app-shell-MVkyp7pH.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/_-DaLA3QES.js
var import_jsx_runtime = require_jsx_runtime();
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
var SplitComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {});
//#endregion
export { SplitComponent as component };
