import { defineConfig } from 'vite';

/**
 * 之前没有 vite.config，Vite 会按默认规则监听项目下所有文件（只排除 .git / node_modules）。
 * 而很多编辑器保存文件用的是「原子写入」：先在同目录建一个临时文件（例如
 * `src/game/.units.ts.12345.067303c6.tmpdir/units.ts.tmp`），写完替换、再把临时目录删掉。
 * Vite 的 watcher 会在那几十毫秒里给临时文件装上监听，目录一被删就抛
 * `EBUSY: resource busy or locked`，直接让 dev server 崩掉（不是热更新失败，是进程死了）。
 *
 * 这里把这类临时产物排除在监听之外。自定义的 ignored 会与 Vite 自带的忽略项
 * （.git / node_modules / test-results / 构建缓存目录）自动合并，不需要重复写。
 *
 * 用 .mjs 而不是 .ts：Vite 加载 .ts 配置要先经 esbuild 转译（多起一个子进程），
 * 而 .mjs 直接原生 import，启动更快、也少一层依赖。
 */
export default defineConfig({
  server: {
    // Windows 当前保留了 5122–5221，默认端口避开该范围。
    host: '127.0.0.1',
    port: 5230,
    watch: {
      ignored: [
        // 原子写入的临时目录 / 临时文件
        '**/.*.tmpdir',
        '**/.*.tmpdir/**',
        '**/*.tmpdir',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/.*.tmp',
        // 构建产物无需监听；public 素材必须监听，新增动作帧才能进入静态文件缓存。
        '**/dist/**',
        '**/.cache/**',
        '**/public/.tmp-assets/**',
      ],
    },
  },
});
