import json
import os
import threading

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from datebase import db, setGiftCode, getGiftCodesByPage, update_user_cdk_statistics, batch_check_users_have_cdks, getUserID, setUserID
from models import User, redeemCode, Admin
from auth import api_sign_required
import time
from sqlalchemy import or_, and_, cast, Integer
from app import _run, _runAll, _runUserAll, login_fid, string_to_timestamp
from apscheduler.schedulers.background import BackgroundScheduler
from pytz import timezone
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)
VERIFY_FID = os.getenv('VERIFY_FID', '000000000')
URL_PREFIX = (os.getenv('GIFTCODE_URL_PREFIX') or '').strip().rstrip('/')
if URL_PREFIX and not URL_PREFIX.startswith('/'):
    URL_PREFIX = '/' + URL_PREFIX

# 仅「兑换码不存在」视为无效；验证码/网络等视为无法确认，不入库
_SUBMIT_INVALID_CODES = {11}
_SUBMIT_INVALID_MSGS = {'兑换码不存在'}
_SUBMIT_TECHNICAL_CODES = {1, 5, 6, 7, 8, 10, 101}


def _submit_verify_allows_add(msg: str, code: int) -> bool:
    if code in _SUBMIT_INVALID_CODES or msg in _SUBMIT_INVALID_MSGS:
        return False
    if code in _SUBMIT_TECHNICAL_CODES:
        return False
    if '不存在' in msg or '无效' in msg or 'NOT FOUND' in msg.upper():
        return False
    return True


def _persist_redeem_code(cdk: str, t: int, end_time_input: str = ''):
    cdk = cdk.strip().upper()
    endTime = ''
    if end_time_input:
        endTime = string_to_timestamp(
            end_time_input + ' 23:59:00' if len(end_time_input) <= 10 else end_time_input
        )
    req = redeemCode.query.filter_by(code=cdk).first()
    if req:
        if req.endTime == endTime and req.type == int(t):
            return '该兑换码已在库中', 401
        req.endTime = endTime
        req.type = int(t)
        msg = '兑换码信息已更新'
    else:
        db.session.add(redeemCode(code=cdk, type=int(t), endTime=endTime))
        msg = '兑换码已添加'
    db.session.commit()
    return msg, 0

def CodeAdd(codes):
    # 添加兑换码
    with app.app_context():
        try:
            for code in codes:
                cdk = code.get('code')
                if not cdk: continue
                req = redeemCode.query.filter_by(code=cdk).first()
                endTime = ""
                t = code.get('type', 0)
                if code.get('endTime'):
                    endTime = string_to_timestamp(code.get('endTime'))
                    t = 1
                if req:
                    if req.endTime == endTime:
                        continue
                    # 情况2：cdk存在时间戳不相等
                    else:
                        req.endTime = endTime
                        req.type = t
                else:
                    new_code = redeemCode(
                        code=cdk,
                        type=t,
                        endTime=endTime
                    )
                    db.session.add(new_code)
            db.session.commit()
        except Exception as e:
            db.session.rollback()



def UserCodeAll():
    # 为所有用户自动兑换
    with app.app_context():
        current_timestamp = round(time.time())

        active_codes = redeemCode.query.filter(
            and_(redeemCode.type == 1, cast(redeemCode.endTime, Integer) > current_timestamp)
        ).all()
        if not active_codes:
            return
        users = User.query.filter(
            or_(
                # cast(User.endTime, Integer) > current_timestamp
                User.status == 0
            )
        ).all()
        if not users:
            return

        user_data = []
        for user in users:
            user_data.append(str(user.fid))
        code_data = []
        for code in active_codes:
            code_data.append(code.code)
        print(user_data)
        cdkInfo = batch_check_users_have_cdks(user_data, code_data)
        userCodeList = cdkInfo['users_without_cdks'] # 取所有未使用的用户和兑换码详情
        if not userCodeList:
            return
        result, deleteUser = _runUserAll(userCodeList)
        # print("大熔炉低于9的用户", deleteUser)
        for u in deleteUser:
            user = User.query.filter_by(fid=int(u)).first()
            db.session.delete(user)
            db.session.commit()

        successList = []
        resList = []
        for n in result:
            data = n['userInfo']
            cdk_success = data.get('cdk')
            cdk_res = data.get('cdk_res')
            if cdk_success:
                if cdk_res:
                    del data['cdk_res']
                data['auto'] = True
                data['repeat'] = False
                successList.append(data)
                active_codes = redeemCode.query.filter(redeemCode.code.in_(cdk_success.split(','))).all()
                for code in active_codes:
                    code.success += 1
                    code.total = code.success + code.failed
            elif cdk_res:
                del data['cdk_res']
                data['auto'] = True
                data['cdk'] = cdk_res
                data['repeat'] = True
                resList.append(data)
        db.session.commit()
        if successList:
            setGiftCode(successList)
        if resList:
            setGiftCode(resList)
        update_user_cdk_statistics()

beijing_tz = timezone('Asia/Shanghai')
# 任务调度器
scheduler = BackgroundScheduler(daemon=True, timezone=beijing_tz)
scheduler.add_job(
    UserCodeAll,
    'cron',
    hour='0,2,4,6,8,10,12,13,14,15,16,17,18,20,22',
    minute='0',
    second='0',
    name='userCodeAll',
    id='1'
)
scheduler.start()
app = Flask(__name__)

# ========================
# 应用配置
# ========================
DATABASE_URL = os.getenv('MYSQL_URL')
app.config.update(
    # 数据库配置
    SQLALCHEMY_DATABASE_URI=DATABASE_URL,
    SQLALCHEMY_ENGINE_OPTIONS={
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'connect_args': {
            'charset': 'utf8mb4',
            'collation': 'utf8mb4_unicode_ci'
        }
    },
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    # 安全配置
    PROPAGATE_EXCEPTIONS=True
)

db.init_app(app)

CORS(app,
     supports_credentials=True,
     allow_headers=["Authorization", "Content-Type", "TypeFile"],
     expose_headers=["Authorization"])


@app.context_processor
def inject_url_prefix():
    return {'url_prefix': URL_PREFIX}


@app.errorhandler(Exception)
def handle_api_exception(e):
    if request.path.startswith('/api/'):
        logger.exception("API error on %s: %s", request.path, e)
        return jsonify({'code': 500, 'msg': f'服务器错误: {e}'}), 500
    raise e


@app.route('/')
def dashboard():
    return render_template('index.html')


@app.route('/api/giftcode/player', methods=['POST'])
def api_giftcode_player():
    """工具箱 duihuan.html 兼容：校验角色（无需签名）"""
    data = request.get_json() or {}
    fid = data.get('fid')
    if not fid:
        return jsonify(code=401, msg='缺少账号', err_code='缺少账号')
    result = login_fid(str(fid))
    if isinstance(result, dict):
        nickname = result.get('nickname') or result.get('nick') or result.get('name') or ''
        return jsonify(code=0, data={'nickname': nickname, 'profile': result})
    return jsonify(
        code=401,
        msg=str(result or '未查询到角色'),
        err_code=str(result or '未查询到角色'),
    )


@app.route('/api/giftcode/exchange', methods=['POST'])
def api_giftcode_exchange():
    """工具箱 duihuan.html 兼容：单码兑换（无需签名）"""
    data = request.get_json() or {}
    fid = data.get('fid')
    cdk = (data.get('cdk') or '').strip().upper()
    if not fid or not cdk:
        return jsonify(code=401, msg='缺少关键参数', err_code='缺少关键参数')
    try:
        result = _run(fid, cdk)
        if isinstance(result, str):
            return jsonify(code=1, msg=result, err_code=result)
        msg = result.get('msg', '未知结果')
        code = result.get('code', 100)
        if msg == '兑换成功':
            return jsonify(code=0, msg=msg)
        return jsonify(code=code if isinstance(code, int) else 1, msg=msg, err_code=msg)
    except Exception as e:
        logger.exception('giftcode exchange failed')
        return jsonify(code=500, msg=f'兑换异常: {e}', err_code=str(e)), 500


@app.route('/api/addUser', methods=['POST'])
@api_sign_required
def addUser():
    # 添加账号
    if request.method == 'GET':
        return jsonify(msg='请求错误'), 400
    data = request.get_json()
    fid = data.get('fid')
    if not fid:
        return jsonify(msg='缺少关键参数')
    if User.query.filter_by(fid=int(fid)).first():
        return jsonify({'msg': '已经添加过了'})
    endTime = '2026-12-01 23:59:00'  # 这里可以设置用户过期时间，默认不启用
    new_user = User(fid=fid, email='', endTime=string_to_timestamp(endTime), status=0)
    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'msg': '添加成功', 'code': 0})
    except Exception as e:
        db.session.rollback()
        return jsonify({'msg': '添加失败', 'code': 401})



@app.route('/api/delUser', methods=['POST'])
@api_sign_required
def delUser():
    # 删除账号
    if request.method == 'GET':
        return jsonify(msg='请求错误')
    data = request.get_json()
    fid = data.get('fid')
    if not fid:
        return jsonify(msg='缺少关键参数')
    user = User.query.filter_by(fid=int(fid)).first()
    if not user:
        return jsonify(msg='账号不存在')
    try:
        if user.status != 0:
            return jsonify({'msg': '删除失败，你的账号已被禁用', 'code': 401})
        db.session.delete(user)
        db.session.commit()
        return jsonify({'msg': '删除成功', 'code': 0})
    except Exception as e:
        db.session.rollback()
        return jsonify({'msg': '删除失败', 'code': 401})

@app.route('/api/addGiftCode', methods=['POST'])
@api_sign_required
def addGiftCode():
    """添加兑换码"""
    if request.method == 'GET':
        return jsonify(msg='请求错误', code=401)
    data = request.get_json()
    cdk = data.get('cdk')
    pwd = data.get('pwd')
    t = data.get('type', 0)
    endTime = data.get('endTime', '')
    if not cdk or not pwd:
        return jsonify(msg='缺少关键参数', code=401)
    admin = Admin.query.filter_by(password=pwd).first()
    if not admin:
        return jsonify({'msg': '你没有权限\n添加微信：838210720申请成为管理员', 'code': 401})
    if admin.status != 0:
        return jsonify({'msg': f'{admin.username}，你已被封禁', 'code': 401})

    try:
        end_time_input = endTime
        if endTime and len(endTime) <= 10:
            end_time_input = endTime
        elif endTime:
            end_time_input = endTime
        msg, code = _persist_redeem_code(cdk, int(t), end_time_input or '')
        return jsonify(msg=msg, code=code)
    except Exception as e:
        db.session.rollback()
        return jsonify(msg=f"兑换码添加失败: {e}", code=401)


@app.route('/api/submitGiftCode', methods=['POST'])
@api_sign_required
def submitGiftCode():
    """玩家提交兑换码：使用验证账号实兑，成功则入库"""
    data = request.get_json() or {}
    cdk = (data.get('cdk') or '').strip().upper()
    t = int(data.get('type', 0))
    end_time_input = (data.get('endTime') or '').strip()

    if not cdk:
        return jsonify(msg='请输入兑换码', code=401)
    if t == 1 and not end_time_input:
        return jsonify(msg='限时兑换码请选择失效日期', code=401)
    if redeemCode.query.filter_by(code=cdk).first():
        return jsonify(msg='该兑换码已在库中', code=401)

    try:
        verify_result = _run(VERIFY_FID, cdk)
    except Exception as e:
        logger.exception('submitGiftCode verify error')
        return jsonify(msg=f'验证请求失败: {e}', code=500), 500

    if isinstance(verify_result, str):
        return jsonify(msg=f'验证失败: {verify_result}', code=401)

    verify_msg = verify_result.get('msg', '')
    verify_code = verify_result.get('code', 100)

    if not _submit_verify_allows_add(verify_msg, verify_code):
        return jsonify(
            msg=f'验证未通过: {verify_msg}',
            code=verify_code,
        ), 401

    user_info = verify_result.get('userInfo')
    if verify_msg == '兑换成功' and user_info:
        setGiftCode([user_info])

    try:
        msg, code = _persist_redeem_code(cdk, t, end_time_input)
        update_user_cdk_statistics()
        if verify_msg == '已经兑换过了':
            tip = f'兑换码有效（验证账号已兑过），{msg}'
        elif verify_msg == '兑换成功':
            tip = f'验证成功，{msg}'
        else:
            tip = f'兑换码有效（{verify_msg}），{msg}'
        return jsonify(msg=tip, code=code)
    except Exception as e:
        db.session.rollback()
        logger.exception('submitGiftCode save error')
        return jsonify(msg=f'入库失败: {e}', code=401), 401


@app.route('/api/getGiftCode', methods=['GET'])
@api_sign_required
def getGiftCode():
    # 获取兑换码列表
    current_timestamp = round(time.time())
    active_codes = redeemCode.query.filter(
        or_(
            and_(redeemCode.type == 1, cast(redeemCode.endTime, Integer) > current_timestamp),
            redeemCode.type == 0
        )
    ).all()
    result_data = []
    for code in active_codes:
        result_data.append({
            'code': code.code,
            'total': code.total,
            'success': code.success,
            'failed': code.failed,
            'type': code.type,
            'endTime': code.endTime,
            'created_at': code.created_at
        })
    sorted_data = sorted(result_data, key=lambda x: int(x['created_at']), reverse=True)
    return jsonify({
        'code': 0,
        'message': 'ok',
        'data': sorted_data,
        'count': len(result_data)
    })


@app.route('/api/giftCode', methods=['POST'])
@api_sign_required
def _Code():
    # 使用兑换码
    data = request.get_json()
    fid = data.get('fid')
    cdk = data.get('cdk')
    if not fid or not cdk:
        return jsonify(msg='缺少关键参数')
    try:
        result = _run(fid, cdk)
        if isinstance(result, str):
            if '大熔炉等级低于9' in result:
                user = User.query.filter_by(fid=int(fid)).first()
                if user:
                    db.session.delete(user)
                    db.session.commit()
            return jsonify({'msg': result, 'code': 1})

        active_codes = redeemCode.query.filter_by(code=cdk).first()
        msg = result.get('msg', '未知结果')
        code = result.get('code', 100)

        if active_codes:
            if msg == '兑换成功':
                setGiftCode([result['userInfo']])
                active_codes.success += 1
            else:
                active_codes.failed += 1
            active_codes.total = active_codes.success + active_codes.failed
            db.session.commit()
            update_user_cdk_statistics()

        if msg == '兑换成功':
            return jsonify({'msg': msg, 'code': 0})
        return jsonify({'msg': msg, 'code': code})
    except Exception as e:
        logger.exception("giftCode failed")
        db.session.rollback()
        return jsonify({'msg': f'兑换异常: {e}', 'code': 500}), 500


def _async_runAll(fid, code_data):
    result = _runAll(fid, code_data)
    if isinstance(result, str):
        if any(key in result for key in ('大熔炉等级低于9', '用户角色不存在')):
            user = User.query.filter_by(fid=int(fid)).first()
            db.session.delete(user)
            db.session.commit()
        return
    userInfo = result['userInfo']
    cdk_success = userInfo.get('cdk')
    cdk_res = userInfo.get('cdk_res')
    userInfo['repeat'] = False
    if cdk_success:
        if cdk_res:
            del userInfo['cdk_res']
        active_codes = redeemCode.query.filter(redeemCode.code.in_(list(cdk_success))).all()
        for code in active_codes:
            code.success += 1
            code.total = code.success + code.failed
        db.session.commit()
    elif cdk_res:
        del userInfo['cdk_res']
        userInfo['repeat'] = True
        userInfo['cdk'] = cdk_res
    setGiftCode([userInfo])
    update_user_cdk_statistics()


@app.route('/api/giftCodeAll', methods=['POST'])
@api_sign_required
def _CodeAll():
    data = request.get_json()
    fid = data.get('fid')
    t = data.get('type', '0')
    if not fid:
        return jsonify(msg='缺少关键参数')
    isExist, ttl = getUserID(fid)
    if isExist:
        return jsonify(msg=f'兑换太频繁，请等待{ttl}秒后再兑换吧')

    code_data = []
    current_timestamp = round(time.time())
    if t == '0':
        active_codes = redeemCode.query.filter(
            and_(redeemCode.type == 1, cast(redeemCode.endTime, Integer) > current_timestamp)
        ).all()
    else:
        active_codes = redeemCode.query.filter_by(type=0).all()
    if not active_codes:
        return jsonify(msg='兑换失败，当前无可用兑换码')
    for code in active_codes:
        code_data.append(code.code)
    cdkInfo = batch_check_users_have_cdks([fid], code_data)
    code_data = cdkInfo['users_without_cdks'].get(fid, None)
    if not code_data:
        return jsonify(msg='兑换失败，当前无可用兑换码')
    setUserID(fid)
    threading.Thread(target=_async_runAll, args=(fid, code_data), daemon=True).start()
    return jsonify(msg='已添加兑换任务，可在1~2分钟后刷新近期兑换列表查看兑换结果')



@app.route('/api/r/getGiftCode', methods=['GET'])
@api_sign_required
def _getGiftCodes():
    # 获取缓存中兑换成功的兑换码信息
    page = request.args.get('page', 1, type=int)
    size = request.args.get('size', 20, type=int)
    res = getGiftCodesByPage(page, size)
    return jsonify(res)


if __name__ == '__main__':
    port = int(os.getenv('GIFTCODE_PORT', '5201'))
    app.run(host='0.0.0.0', port=port)