# 开发说明

从项目根目录执行命令，包管理器使用pnpm；已有依赖时也可用对应的 `npm run` 命令。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装锁定依赖 |
| `pnpm dev` | 检查素材，启动Vite开发服务器；端口以终端输出为准 |
| `pnpm build` | 检查素材、TypeScript类型检查、构建到 `dist/` |
| `pnpm preview` | 预览生产构建 |
| `pnpm check:project` | 检查文档链接、源图清单与运行帧 |
| `pnpm check:project -- --verify-moves` | 额外核对本次整理的媒体搬迁哈希；后续修改源图时使用日常检查 |
| `pnpm check:flow` | 用浏览器API垫片运行实际Game，校验机制、奖励、存档与通关模拟 |
| `pnpm assets:all` | 按依赖顺序全量重建运行素材 |
| `pnpm assets:catalog` | 更新角色图集的源图尺寸 |
| `pnpm assets:bg / assets:home` | 单独生成战场或首页素材 |
| `pnpm assets:others / assets:slice / assets:ui` | 单独生成道具与卡面、动画帧或界面图集 |
| `pnpm grid:measure` | 输出网格与出生点的测量剖面 |
| `pnpm grid:overlay / grid:annotate` | 输出候选网格图到 `.cache/grid/`；参数格式见对应脚本 |

## 目录与数据流

```text
src/                    游戏运行源码
  core/                 素材、动画、音频、图集绘制
  game/                 战斗、关卡、单位、界面与存档
assets/                 可编辑源素材，见 assets/README.md
  characters/           defenders、attackers、catalog.json
  portraits/            独立卡牌立绘
  backgrounds/          战场背景
  home/                 首页图层
  ui/                   界面图集、卡框、资源与进度组件
  props/                面团、大肥鱼、夹子
  audio/                运行音频、原始音轨与剪辑记录
  archive/              不进入管线的历史素材
scripts/
  assets/               生成与切片
  checks/               文件、机制和通关校验
  tools/                网格校准
docs/                   玩家与开发文档
  previews/             开发服务器中的交互检查页
  screenshots/          当前画面证据
  reports/              自动校验与迁移记录
  archive/              历史中间截图
public/assets/          生成的运行资源，不进入版本库
dist/                   生产构建，不进入版本库
.cache/                 校准图等临时输出，不进入版本库
```

源素材经 `scripts/assets/` 处理为 `public/assets/`，游戏通过 `src/core/assets.ts` 加载。全量生成顺序为背景、首页、道具与卡面、角色切片、界面与音频。`ensure-assets.mjs` 检查哨兵、全部清单帧与音频同步，资源缺失时调用同一条全量管线。

目录搬迁没有改变运行URL：背景仍为 `/assets/bg/day.png`，角色仍为 `/assets/sprites/<id>/<animation>/<frame>.png`，音频仍为 `/assets/audio/`。

## 源码职责

| 文件 | 职责 |
| --- | --- |
| `src/main.ts` | 启动、场景切换、视口缩放、输入与失焦暂停 |
| `src/game/config.ts` | 网格、资源、十关波次、卡组、奖励与关卡类型 |
| `src/game/units.ts` | 单位数值、能力、名称与说明 |
| `src/game/entities.ts` | 豆包、奶蛙、弹丸、面团和大肥鱼实体 |
| `src/game/systems.ts` | 波次、攻击、生产、感染、控制、命中与清理 |
| `src/game/special.ts` | 奶蛋入侵和传送带的状态、输入与绘制 |
| `src/game/eggstory.ts / eggdialogue.ts / eggdialogue.css` | 豆包对话内容、原生控件、焦点与响应式演出 |
| `src/game/eggrhythm.ts` | 三分钟固定谱面、时机窗口、目标尺寸、速度与节奏段落 |
| `src/game/game.ts` | 关内输入、更新、绘制与奖励结算 |
| `src/game/ui.ts` | 常规HUD、工具提示、暂停和胜负界面 |
| `src/game/menu.ts / modeselect.ts / debuglevels.ts` | 首页、模式选择、原生调试选关 |
| `src/game/progress.ts / save.ts` | 正式解锁进度、对局存档与旧档迁移 |
| `src/core/anim.ts / assets.ts / sfx.ts / uiart.ts` | 动画、素材、音频和图集绘制 |

## 新增或修改角色

1. 豆包图集放进 `assets/characters/defenders/`，奶蛙图集放进 `assets/characters/attackers/`。
2. 规则网格图集在 `assets/characters/catalog.json` 中配置路径、行数与角色id，运行 `pnpm assets:catalog` 更新尺寸。既有不规则图集在 `scripts/assets/slice-sprites.mjs` 中逐帧校准。
3. 在 `src/game/units.ts` 注册数值、能力、短作用与介绍；在 `config.ts` 的卡组、奖励和波次中引用。
4. 运行 `pnpm assets:all`、`pnpm check:project`、`pnpm check:flow`、`pnpm build`；再用 [交互预览](README.md) 核对实际动作与卡面。

切片边界必须包含手臂、围巾、面粉云等伸出部分，并留出邻帧间隔。源图帧间粘连时手工划界，必要时用 `bodyMatte` 清理独立邻帧残片。所有动作按同一参考高度缩放并注册脚底锚点，不能逐帧归一化尺寸。普通奶蛙使用躯干和两腿部件驱动交替步态；奶蛋按实际位移连续旋转。

## 音频与界面

`assets/audio/` 包含安迪、失败咀嚼、BGM、大波提示及不知火蛙挥扇五段运行音频；原始音轨、来源与剪辑参数同目录保存。挥扇音效取BV1rCwczfE3L开头0～2.2秒，按原速完整播放。`assets:ui` 将运行音频复制到 `public/assets/audio/`。音频未加载时游戏静默降级；音量通过主增益控制。

标题、模式、暂停与失败组件由 `assets/ui/` 的源图切出。动态文字使用系统中文字体，绘制与命中共享矩形。界面约定见根目录 [DESIGN.md](../DESIGN.md)。

## 存档与开发服务

`pnpm dev` 默认使用 `http://127.0.0.1:5230`；端口已被其他服务占用时顺延，以终端打印地址为准。Windows当前保留5122～5221端口，包含Vite原来的默认5173，因此配置避开该范围。

`/debug`（兼容 `?debug`）开启原生十关选择及不知火蛙独立试炼，不读写正式进度。正式进度位于浏览器localStorage；目录整理不修改存档键与战斗规则。

`vite.config.mjs` 排除编辑器原子保存的 `.tmpdir`、`.tmp`、构建和校准缓存，避免Windows短暂目录句柄触发 `EBUSY`。`public/assets/` 保持监听，以便新动画帧进入静态文件服务。
