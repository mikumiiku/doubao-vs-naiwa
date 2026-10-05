# 素材目录

这里保存源图、音频和动作表；游戏运行时只加载 `public/assets/` 中的生成资源。

| 目录 | 内容 |
| --- | --- |
| `characters/defenders/` | 豆包动作图与生成记录 |
| `characters/attackers/` | 奶蛙动作图、步态部件与生成记录 |
| `characters/catalog.json` | 新角色的源图路径、动作行数、尺寸和生成记录 |
| `portraits/` | 既有豆包的独立卡牌立绘；新角色卡面取动作图首帧 |
| `dialogue/` | 豆包对话立绘与表情差分，源图保留透明通道 |
| `backgrounds/` | 战场背景 |
| `home/` | 首页背景、主体和开始按钮 |
| `ui/` | 标题、模式、暂停、失败界面，以及卡框和资源栏 |
| `props/` | 面团、大肥鱼、夹子 |
| `audio/` | 五段运行音频、原始剪辑音轨与剪辑参数 |
| [archive](archive/README.md) | 已退役的角色、按钮和中间稿，不进入素材管线 |

`pnpm assets:all` 全量生成运行资源；`pnpm assets:catalog` 更新新角色源图尺寸。开发和构建会自动补全缺失运行资源。管线脚本在 `scripts/assets/`，切片要求见 [开发说明](../docs/development.md)。
