FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（包括较新版本的 OpenSSL）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libssl-dev \
    uwsgi \
    uwsgi-plugin-python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


RUN mkdir -p /var/log/uwsgi && \
    chmod -R 755 /var/log/uwsgi


# 复制项目文件
COPY requirements.txt .
# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.bfsu.edu.cn/pypi/web/simple/

COPY . .


# 暴露端口
EXPOSE 5201

# 启动命令（uWSGI 配置）
CMD ["uwsgi", "--ini", "uwsgi.ini"]
# 运行测试
#CMD ["python", "main.py"]