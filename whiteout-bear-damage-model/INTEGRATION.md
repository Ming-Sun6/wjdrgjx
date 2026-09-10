# 冬日工具箱集成

来源：https://github.com/3372126760-lang/whiteout-bear-damage-model

导入版本：9037f1cdc653f9bedd2cdc0b0474a675501d5bc3（package.json v0.4.0）。保留原作者署名与模型算法。

站内地址：`/function/bear-damage/`，首页归类到“计算器/工具”。后台工具 ID：`bear-damage-calculator`。

从网站根目录执行：

```sh
npm ci --prefix whiteout-bear-damage-model
npm --prefix whiteout-bear-damage-model test
npm run build:bear-damage
```

构建包含类型检查，产物写入 `public/function/bear-damage/`，随网站 public 目录一起发布。修改首页时同步根目录和 public 目录的 index.html。服务器工具目录位于 server.js，更新后需重启服务才能载入后台配置。

本地适配：Vite 资源前缀、页面标题、返回计算器链接；未修改伤害模型。
