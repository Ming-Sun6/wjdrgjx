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

    mysql = (os.getenv('MYSQL_URL') or '').strip()
    pg_host = (os.getenv('PGHOST') or '').strip()
    engine = (os.getenv('GIFTCODE_DB_ENGINE') or '').strip().lower()

    if engine in ('mysql', 'mariadb'):
        if mysql:
            return mysql
        raise RuntimeError('GIFTCODE_DB_ENGINE=mysql 但未设置 MYSQL_URL')

    if engine in ('postgres', 'postgresql', 'pg'):
        if pg_host:
            return _build_postgres_url(pg_host)
        raise RuntimeError('GIFTCODE_DB_ENGINE=postgres 但未设置 PGHOST')

    # 本地：wjdr-giftcode/.env 里配了 MYSQL_URL 时优先 MySQL
    # 服务器：通常只有根目录 PGHOST，没有 MYSQL_URL → 走 PostgreSQL
    if mysql:
        return mysql

    if pg_host:
        return _build_postgres_url(pg_host)

    raise RuntimeError(
        '未配置数据库：服务器请在根目录 .env 设置 PGHOST；'
        '本地请在 wjdr-giftcode/.env 设置 MYSQL_URL'
    )


def _build_postgres_url(pg_host: str) -> str:
    user = quote_plus(os.getenv('PGUSER') or '')
    password = quote_plus(os.getenv('PGPASSWORD') or '')
    port = (os.getenv('PGPORT') or '5432').strip()
    database = (os.getenv('PGDATABASE') or 'postgres').strip()
    ssl_mode = (os.getenv('PGSSLMODE') or os.getenv('PGSSL') or '').strip().lower()
    query = f'?sslmode={quote_plus(ssl_mode)}' if ssl_mode else ''
    return f'postgresql+psycopg2://{user}:{password}@{pg_host}:{port}/{database}{query}'


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
