# 脚本目录

| 目录 | 职责 |
| --- | --- |
| `assets/` | 检查、全量生成、切片、卡面与UI处理，更新图集尺寸 |
| `checks/` | 项目文件校验，以及实际 Game 的奖励、战斗、存档与通关模拟 |
| `tools/` | 草坪网格测量、标线和锚点校准 |

从项目根目录使用 `pnpm assets:all`、`pnpm check:project`、`pnpm check:flow`。网格图输出到 `.cache/grid/`，不会进入运行素材或版本库。完整命令与源码职责见 [开发说明](../docs/development.md)。
