
<div align="center">

[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://github.com/Superheroff/wjdrGiftcode)
[![node.js](https://img.shields.io/badge/node.js-20+-blue?logo=node.js)](https://github.com/Superheroff/wjdrGiftcode)
[![License](https://img.shields.io/github/license/Superheroff/wjdrGiftcode.svg)](https://github.com/Superheroff/wjdrGiftcode/blob/master/LICENSE)

**WJDR-Gift-Code 无尽冬日兑换中心**

</div>


## 目录结构
```
app/
├── static
│   ├── css
│   │   ├── input.css
│   │   └── app966.css
│   ├──js
│   │   └── app966.js
│   └── images
├── templates
│   └── index.html
├── src/
│   └── error_img/  # 存放识别失败的图片，用于自训练
│   └── test/  # 演示效果
├── .env
├── app.py
├── auth.py
├── datebase.py
├── init_db.py
├── models.py
├── main.py
├── Dockerfile
├── README.md
├── requirements.txt
├── webpack.config.js
├── uwsgi.ini
└── package.json
└── tailwind.config.js
```

## 环境要求
  - Python 3.11+
  - Node 20+

## 注意事项
- 2026.05.01，调用`/api/gift_code`接口时，需添加代理，否则会返回：`请求错误`状态码为：`101`。
- 在`_gift`函数中添加代理`代理IP普通即可无需高匿代理`，需要自己写个脚本从各大代理平台获取免费代理自己维护，或者等我更新。
```python
proxy = {
    "http": "http://127.0.0.1:7890",
}
result = requests.post(url, headers=headers, data=data, proxies=proxy).text
```


## 快速开始
```bash
# 克隆项目
git clone https://github.com/Superheroff/wjdrGiftcode.git
# 进入项目目录
cd wjdrGiftcode/app
# 安装依赖
pip install -r requirements.txt
# 安装前端依赖
npm install
# 初始化数据库
python init_db.py
# 构建前端项目
npm run build
npm run webpackbuild
```
### 配置环境变量
  - 编辑 `.env` 文件，填写数据库连接、Redis主机、Redis端口、Redis密码、发送邮箱地址、发送邮箱密码等信息。

### Docker 部署
```bash
# 构建Docker镜像
docker build -t wjdrcode:1.0 .
# 运行Docker容器
docker run -d -p 5201:5201 --name wjdr wjdrcode:1.0
```

## 体验
  - [app966.cn](https://wjdr.app966.cn/)


## License

[Apache-2.0](LICENSE)
