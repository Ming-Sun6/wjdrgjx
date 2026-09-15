# Android 应用更新发布

官网服务器通过 Gitee master 拉取更新。在服务器现有官网仓库目录执行：

```sh
git pull --ff-only origin master
```

此次包含 IIS 下载路由和 public/downloads 下的正式 APK、版本清单、MIME 配置，无需改数据库。

验证 https://wjgl.store/downloads/update.json 和清单中的 apkUrl 均返回 200。若启用 CDN，刷新 update.json 缓存。现有 1.0 用户需要先手动安装 1.1；之后可在 App 内升级。

后续在 Android 项目递增 versionCode、构建正式包并执行 scripts/prepare-update.py --website /Volumes/Elements/Szj/gl，再提交官网更新文件并推送。public/downloads/*.apk 已设置 Git 忽略例外，正式 APK 随仓库提交。不要提交签名私钥或密码。
