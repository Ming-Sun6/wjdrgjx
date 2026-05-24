from main import app
from datebase import db
from models import *

with app.app_context():
    # 创建所有表（首次部署执行一次即可）
    db.create_all()
    print("Database tables created OK.")
    # 删除所有表
    # db.drop_all()
