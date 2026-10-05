# 豆包大战奶蛙

植物大战僵尸恶搞版网页小游戏，豆包家族在草坪上抵御奶蛙。非商用、纯整活开源项目，MIT协议。

![角色与战场](docs/screenshots/campaign-roster.png)

## 开始使用

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址。冒险模式保存进度并逐关解锁；`/debug` → 冒险模式可直接选择全部十关，调试对局不读写正式进度。

普通关点击卡牌再点空格种植，拾取面团补给，每行大肥鱼提供一次突破保险。第5关“奶蛋入侵”由豆包对话开场，三分钟内守住649只奶蛋；在第三列瞄准小圆圈，以鼠标或Z/X按准时机击碎，后段每秒五次连打。第10关“开门，送豆包啦”使用免费传送带供卡。菜单可暂停、调音量和返回，窗口失焦自动暂停。

## 文档

- [十关冒险](docs/campaign.md)：关卡、新角色、作用、出怪节奏与特殊玩法。
- [开发说明](docs/development.md)：构建、目录职责、素材管线与新增单位。
- [文档与交互预览](docs/README.md)：角色动作、战斗和窄屏检查页。
- [验证记录](docs/combat-validation.md)：通关模拟和浏览器实测范围。
- [梗来源](docs/meme-references.md)：核对过的出处与游戏原创设定。
- [目录整理记录](docs/project-organization.md)：迁移、历史归档与文件校验。

## 常用检查

```bash
pnpm assets:all      # 全量生成运行素材
pnpm check:project   # 文档、素材清单与帧文件校验
pnpm check:flow      # 实际Game的机制、存档、奖励与通关模拟
pnpm build           # 类型检查与生产构建
pnpm preview         # 预览dist/
```

开发、构建和校验会自动补全缺失的运行素材。已有依赖时可使用对应的 `npm run` 命令。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/` | 游戏源码，核心模块与关内模块分开 |
| [assets](assets/README.md) | 可编辑源图、角色图集、四段音频与历史归档 |
| [scripts](scripts/README.md) | 素材管线、检查和网格工具 |
| [docs](docs/README.md) | 文档、预览、截图、验证报告与历史画面 |
| `public/assets/` | 自动生成的运行资源 |
| `dist/` | 自动生成的生产构建 |
| `.cache/` | 网格校准等临时输出 |

`public/assets/`、`dist/`、`.cache/` 不进入版本库。界面约定见 [DESIGN.md](DESIGN.md)。

## 素材与协议

角色与场景为AI生成的整活素材。音频为网友二创梗素材，出处见 [梗来源](docs/meme-references.md)与 `assets/audio/*.edit.json`；版权归原权利人所有，本项目仅作非商用学习娱乐引用。

[MIT License](LICENSE) © doubao_vs_naiwa contributors
