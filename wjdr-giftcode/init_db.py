from main import app
from datebase import db
from db_config import get_database_url, using_postgresql
from models import *

with app.app_context():
    print('Database URL:', get_database_url().split('@')[-1] if '@' in get_database_url() else '(configured)')
    print('Engine:', 'PostgreSQL' if using_postgresql() else 'MySQL/other')
    db.create_all()
    print('Giftcode tables created OK (gc_user, gc_redeem_code, gc_admin).')
