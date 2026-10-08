# 冬日工具箱

玩家制作的无尽冬日攻略与工具站，在线地址是 [https://wjgl.store/](https://wjgl.store/)。

本站提供游戏资料、计算器和查询工具、礼包与活动参考、活动日历、移民与邻邦查询，以及站内论坛。它与游戏官方发行人和运营商没有隶属、代理或授权关系。站内数值、时间和预测只供参考，请以游戏内实际结果为准。

本仓库是网站代码，采用 [MIT 许可](LICENSE)。

## 功能

首页工具按用途分成几组。

| 分组 | 内容 |
| --- | --- |
| 常用 | 练兵计算站、火晶建筑计算器、领主装备与宝石计算器、英雄数据 |
| 核心工具 | 熊坑排布及简约版、打熊伤害计算器、打熊车身推荐、精炼提炼计算与模拟、工程站时间、礼包性价比、英雄装备计算器、专家计算器、T11 升级、T12 科技计算器、创冰工坊摆放助手、全能地图编辑器、甜甜的攻略站 |
| 资料与查询 | 常规礼包、特惠礼包、礼包参考总览、礼包轮换表、移民券计算器、移民预测、最远移民区间、历史移民分组、邻邦进度、1–30 建筑升级、T12 数据总览、宠物数据查询、无尽冬日人格测试 |
| 小游戏 | 极简飞行棋 |

除此之外还有活动日历、用户登录、论坛，以及《用户协议》《隐私政策》。协议页面在 `legal/`。

## 仓库结构

站点由一个 Node.js 服务和大量静态页面组成。服务启动后同时提供页面和接口。

| 路径 | 作用 |
| --- | --- |
| `server.js` | 站点入口。默认监听 3000 端口，挂载页面、登录、论坛和各工具接口 |
| `public/` | 对外页面、图片和前端脚本。多数工具在 `public/function/` |
| `postgres-db.js`、`postgres-schema.js` | PostgreSQL 连接与表结构 |
| `tests/` | 使用 Node.js 自带测试运行器编写的检查 |
| `legal/` | 关于我们、用户协议、隐私政策 |
| `whiteout-bear-damage-model/` | 打熊伤害计算器的独立前端，构建后输出到 `public/function/bear-damage/` |
| `bear-pit-simple-src/` | 熊坑排布简约版的源码 |
| `map-tool/`、`aeroplane-chess/` | 地图编辑器和极简飞行棋 |
| `scripts/` | 头像迁移、静态页生成等维护脚本 |

登录、论坛和需要保存的数据使用 PostgreSQL。只打开本地计算器页面时，可以先不配置数据库。

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env
node server.js
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

`.env.example` 里是占位值。复制成 `.env` 之后，填入你自己的数据库，不要把真实连接信息提交进仓库。

| 变量 | 含义 |
| --- | --- |
| `PGHOST` | 数据库主机 |
| `PGPORT` | 端口，通常是 `5432` |
| `PGUSER` | 用户名 |
| `PGPASSWORD` | 密码 |
| `PGDATABASE` | 数据库名 |
| `PGSSLMODE` | 设为 `require` 时启用 SSL |

MySQL 只作为 PostgreSQL 不可用时的回退，不是日常运行所需要的。相关变量是 `MYSQL_HOST`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。

打熊伤害计算器的源码在 `whiteout-bear-damage-model/`。修改后在该目录执行安装、测试和生产构建，再把产物放到 `public/function/bear-damage/`。该目录自己的说明见 `whiteout-bear-damage-model/README.md`。

## 测试

测试不依赖外部服务，直接读取仓库里的页面和脚本：

```bash
node --test tests/*.js
```

只想检查某一块时，可以指定文件，例如：

```bash
node --test tests/tool-management.test.js
```

## 参与

问题反馈、改动方式和提交时要避开的内容写在 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题按 [SECURITY.md](SECURITY.md) 私下报告，不要写进公开讨论。联系方式以网站 [《关于我们》](https://wjgl.store/legal/about) 为准。

## 致谢

制作：2041茗子、飞菇。数据：飞菇、甜甜、627贰叁、奶酪、719缥缈、2041茗子。测试：2041茗子、飞菇、甜甜、627贰叁、奶酪、719缥缈、755脆脆、2144煤球、柒枫团队。宣传大使：懒羊羊。赞助：39 拙山枯水大江行。
