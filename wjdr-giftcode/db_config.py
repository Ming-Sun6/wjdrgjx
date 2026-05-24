import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

# 工具箱根目录 .env 优先（服务器 PG/RDS），wjdr-giftcode/.env 可覆盖
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_ROOT, '.env'))
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))


def get_database_url() -> str:
    explicit = (os.getenv('DATABASE_URL') or os.getenv('GIFTCODE_DATABASE_URL') or '').strip()
    if explicit:
        return explicit

    pg_host = (os.getenv('PGHOST') or '').strip()
    if pg_host:
        user = quote_plus(os.getenv('PGUSER') or '')
        password = quote_plus(os.getenv('PGPASSWORD') or '')
        host = pg_host
        port = (os.getenv('PGPORT') or '5432').strip()
        database = (os.getenv('PGDATABASE') or 'postgres').strip()
        ssl_mode = (os.getenv('PGSSLMODE') or os.getenv('PGSSL') or '').strip().lower()
        query = f'?sslmode={quote_plus(ssl_mode)}' if ssl_mode else ''
        return f'postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}{query}'

    mysql = (os.getenv('MYSQL_URL') or '').strip()
    if mysql:
        return mysql

    raise RuntimeError(
        '未配置数据库：请在工具箱根目录 .env 设置 PGHOST/PGUSER/PGPASSWORD/PGDATABASE，'
        '或设置 DATABASE_URL / MYSQL_URL'
    )


def get_engine_options() -> dict:
    url = get_database_url()
    opts = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
    if url.startswith('mysql'):
        opts['connect_args'] = {
            'charset': 'utf8mb4',
            'collation': 'utf8mb4_unicode_ci',
        }
    elif url.startswith('postgresql'):
        ssl_mode = (os.getenv('PGSSLMODE') or os.getenv('PGSSL') or '').strip().lower()
        if ssl_mode in ('require', 'verify-ca', 'verify-full', 'prefer'):
            opts['connect_args'] = {'sslmode': ssl_mode}
    return opts


def using_postgresql() -> bool:
    return get_database_url().startswith('postgresql')
