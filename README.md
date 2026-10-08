# 冬日工具箱

无尽冬日玩家攻略站。在线使用：[https://wjgl.store/](https://wjgl.store/)

站点包含练兵计算、活动日历、英雄数据、礼包参考和论坛。本仓库是网站代码，采用 [MIT 许可](LICENSE)。

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env
node server.js
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

`.env` 里填写你自己的 PostgreSQL 连接信息。示例文件只放占位值，不要把数据库地址、账号、密码或运行日志提交进仓库。

## 参与

问题反馈和改动建议见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要写进公开讨论。
