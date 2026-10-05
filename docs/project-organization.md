# 项目目录整理

整理日期：2026-10-04。

104个已有文件按用途迁移，搬迁前后逐文件SHA256一致。路径清单保存在 [directory-moves.json](reports/directory-moves.json)；本次搬迁媒体由 `pnpm check:project -- --verify-moves` 复核。日常检查不锁定源图历史哈希，可继续编辑素材。

| 内容 | 当前位置 |
| --- | --- |
| 当前豆包、奶蛙动作图与角色清单 | `assets/characters/` |
| 卡牌立绘、战场、首页、界面与道具 | `assets/portraits/`、`backgrounds/`、`home/`、`ui/`、`props/` |
| 四段运行音频与剪辑记录 | `assets/audio/` |
| 蒜香豆包、旧首页按钮、旧菜单组件与步态中间稿 | [历史素材](../assets/archive/README.md) |
| 素材生成、项目与战斗校验、网格工具 | `scripts/assets/`、`checks/`、`tools/` |
| 交互检查页、当前截图、校验输出与历史画面 | `docs/previews/`、`screenshots/`、`reports/`、[archive](archive/README.md) |

源码职责和正式运行资源URL保持原有结构。包命令、测试导入、角色源图清单、文档链接和预览入口已同步到新位置。旧菜单按钮与面板不再生成无用运行文件。

网格工具输出统一进入 `.cache/grid/`；素材处理中间目录 `public/.tmp-assets/` 与缓存已加入忽略规则。临时整理脚本已移除。测试编译目录在结束或出错时清理。

全量素材生成完成，文件校验通过：12份文档、195个动画帧、70份搬迁媒体。158项战斗校验、TypeScript检查和生产构建通过，网格叠加与标注工具均可正常输出。UI严格审计与DESIGN.md检查无错误、无警告。

新路径 `/docs/previews/campaign-preview.html` 已在浏览器加载全部十种豆包与五种奶蛙，角色展示按钮可由Enter键触发，未记录控制台错误。[整理后运行画面](screenshots/project-organized.png)。

素材生成日志见 [assets-generation.txt](reports/assets-generation.txt)，战斗与通关记录见 [验证文档](combat-validation.md)，开发入口见 [开发说明](development.md)。
