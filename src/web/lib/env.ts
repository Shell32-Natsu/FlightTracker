/** 演示构建（npm run build:demo）：无后端，接口由浏览器内的模拟实现提供。 */
export const DEMO = import.meta.env.MODE === "demo";

/** 静态资源地址。演示构建用相对路径，便于部署在任意子路径下。 */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
