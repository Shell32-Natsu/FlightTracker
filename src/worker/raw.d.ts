/** Vite / Vitest 的 ?raw 导入（测试里读取迁移 SQL 用）。 */
declare module "*?raw" {
  const content: string;
  export default content;
}
