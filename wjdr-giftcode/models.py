from datebase import db
import time

class BaseUser(db.Model):
    __abstract__ = True
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.String(20), default=lambda: str(round(time.time() * 1000)))
    username = db.Column(db.String(128), nullable=True)
    email = db.Column(db.String(50), nullable=True, default='')
    fid = db.Column(db.Integer, nullable=False, unique=False)
    endTime = db.Column(db.String(20), nullable=True)
    total = db.Column(db.Integer, nullable=True, default=0)
    success = db.Column(db.Integer, nullable=True, default=0)
    failed = db.Column(db.Integer, nullable=True, default=0)
    status = db.Column(db.Integer, nullable=True, default=0)


class User(BaseUser):
    __tablename__ = 'user'


class redeemCode(db.Model):
    # 兑换码表
    __tablename__ = 'redeemCode'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.String(20), default=lambda: str(round(time.time() * 1000)))
    code = db.Column(db.String(30), nullable=False, unique=True)
    total = db.Column(db.Integer, nullable=True, default=0)
    success = db.Column(db.Integer, nullable=True, default=0)
    failed = db.Column(db.Integer, nullable=True, default=0)
    type = db.Column(db.Integer, nullable=False)  # 0 长期，1 限时
    endTime = db.Column(db.String(20), nullable=True)


class danmu(db.Model):
    # 弹幕
    __tablename__ = 'danmu'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.String(20), default=lambda: str(round(time.time() * 1000)))
    username = db.Column(db.String(128), nullable=True)
    amount = db.Column(db.String(10), nullable=False)
    fid = db.Column(db.Integer, nullable=True, unique=False)
    avatar = db.Column(db.String(256), nullable=True)



class Admin(db.Model):
    # 管理员
    __tablename__ = 'admin'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(128), nullable=True)
    password = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.String(20), default=lambda: str(round(time.time() * 1000)))
    status = db.Column(db.Integer, nullable=True, default=0)




