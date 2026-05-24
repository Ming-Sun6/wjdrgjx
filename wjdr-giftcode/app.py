import requests
import time
import base64
import hashlib
import json
import ddddocr
from datetime import datetime
from urllib.parse import quote
import pytz
import os


UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded',
    'origin': 'https://wjdr-giftcode.centurygames.cn',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': 'https://wjdr-giftcode.centurygames.cn/',
    'user-agent': UserAgent,
}

def generate_sign(data):
    sorted_keys = sorted(data.keys())
    query_string_parts = []
    for key in sorted_keys:
        value = data[key]
        # 处理值并转换为字符串
        if isinstance(value, (dict, list)):
            str_value = json.dumps(value, ensure_ascii=False)
        else:
            str_value = str(value)
        # 检查是否需要URL编码（包含非ASCII字符）
        if any(ord(char) > 127 for char in str_value):  # 检查是否有非ASCII字符
            str_value = quote(str_value, safe='')
        query_string_parts.append(f"{key}={str_value}")
    query_string = '&'.join(query_string_parts)
    fixed_string = "Uiv#87#SPan.ECsp"
    sign_string = query_string + fixed_string
    md5_hash = hashlib.md5(sign_string.encode('utf-8')).hexdigest()
    result = {
        'sign': md5_hash,
        **data
    }
    return result


def login_fid(fid):
    timestamp = round(time.time() * 1000)
    data = {
        "fid": fid,
        "time": str(timestamp),
    }
    data = generate_sign(data)
    url_login = "https://wjdr-giftcode-api.campfiregames.cn/api/player"
    response = requests.post(
        url_login,
        headers=headers,
        data=data
    )
    try:
        response_data = response.json()
        if response_data['code'] == 0:
            msg = response_data['data']
            if msg.get('stove_lv', 0) < 9:
                return '大熔炉等级低于9，账号已删除'
            if msg.get('total_recharge_amount'):
                del msg['total_recharge_amount']
        elif response_data.get('msg') == 'role not exist.':
            msg = "用户角色不存在，账号已删除"
        else:
            msg = response_data.get('msg')
    except Exception:
        msg = "无此用户"
    return msg


def save_image(image_bytes: bytes):
    """
    将验证码图片保存到本地文件
    """
    os.makedirs(os.path.dirname('src/error_img'), exist_ok=True)
    with open(f'src/error_img/{int(time.time())}.png', 'wb') as f:
        f.write(image_bytes)
    return True

def get_captcha_code(fid) -> tuple[str, bytes]:
    timestamp = round(time.time() * 1000)
    data = {
        "fid": fid,
        "time": str(timestamp),
        "init": 0,
    }
    data = generate_sign(data)
    url_captcha = "https://wjdr-giftcode-api.campfiregames.cn/api/captcha"
    try:
        res = requests.post(
            url_captcha,
            headers=headers,
            data=data
        )
        response_data = res.json()
        code = response_data.get('code', 10086)
        if code != 0:
            return "验证码请求失败", b''
        captcha_img_base64 = response_data['data']['img']
        captcha_img_base64 = captcha_img_base64.split(',')[1]
        captcha_img_bytes = base64.b64decode(captcha_img_base64)
        ocr = ddddocr.DdddOcr()
        result = ocr.classification(captcha_img_bytes)
        return result, captcha_img_bytes
    except Exception as e:
        print(e)
        return '验证码请求失败', b''



def _gift(fid, cdk, captcha_code):
    if not captcha_code or len(captcha_code) < 4 or captcha_code == '验证码请求失败':
        return "验证码识别错误", 1
    timestamp = round(time.time() * 1000)
    data = {
        "fid": fid,
        "cdk": cdk,
        "captcha_code": str(captcha_code),
        "time": str(timestamp)
    }
    data = generate_sign(data)
    url = "https://wjdr-giftcode-api.campfiregames.cn/api/gift_code"
    try:
        response = requests.post(url, headers=headers, data=data).json()
        message = response['msg']
        if message == "SUCCESS":
            return "兑换成功", 0
        elif message == "RECEIVED." or message == "USED.":
            return "已经兑换过了", 2
        elif message == "TIME ERROR.":
            return "不在兑换时间内", 3
        elif message == "STOVE_LV ERROR.":
            return "大熔炉等级过低", 4
        elif message == "CAPTCHA CHECK ERROR.":
            return "验证码错误", 5
        elif message == "CAPTCHA CHECK TOO FREQUENT.":
            return "服务器繁忙，请稍候再试", 6
        elif message == "CAPTCHA EXPIRED.":
            return "验证码已过期", 7
        elif message == "NOT LOGIN.":
            return "登录已过期", 8
        elif message == "SAME TYPE EXCHANGE.":
            return "兑换过同类型的礼包", 9
        elif message == "TIMEOUT RETRY.":
            return "超时请重试", 10
        elif message == "CDK NOT FOUND.":
            return "兑换码不存在", 11
        else:
            return message, 100
    except Exception:
        return "请求错误", 101

def _run(fid, cdk):
    """一人兑换一个"""
    userInfo = login_fid(fid)
    if isinstance(userInfo, str):
        return userInfo
    keyCode, _ = get_captcha_code(fid)
    result, code = _gift(fid, cdk, keyCode)
    if code in [1, 5, 7, 10] or keyCode == '验证码请求失败':
        keyCode, _ = get_captcha_code(fid)
        result, code = _gift(fid, cdk, keyCode)
    elif code == 8:
        userInfo = login_fid(fid)
        if isinstance(userInfo, str):
            return userInfo
        keyCode, _ = get_captcha_code(fid)
        result, code = _gift(fid, cdk, keyCode)
    userInfo['cdk'] = cdk
    return {'msg': result, 'code': code, 'userInfo': userInfo}


def _runAll(fid, cdkList, save_img=False):
    """一人兑换所有,统计成功失败数"""
    userInfo = login_fid(fid)
    if isinstance(userInfo, str):
        return userInfo
    count_error = 0
    count_success = 0
    cdk_success = ''
    cdk_res = ''  # 记录重复兑换的下次不兑换
    for cdk in cdkList:
        # print(f"当前兑换cdk:{cdk},兑换人:{fid}")
        keyCode, image_bytes = get_captcha_code(fid)
        # print("验证码识别结果", keyCode)
        _, code = _gift(fid, cdk, keyCode)
        print("兑换结果", _, code)
        if code in [1, 5, 7, 10] or keyCode == '验证码请求失败':
            if save_img and code == 5:
                save_image(image_bytes)
            keyCode, image_bytes = get_captcha_code(fid)
            _, code = _gift(fid, cdk, keyCode)
            # print("兑换结果2", _, code)
            count_error+=1
        elif code == 8:
            userInfo = login_fid(fid)
            if isinstance(userInfo, str):
                return userInfo
            keyCode, image_bytes = get_captcha_code(fid)
            _, code = _gift(fid, cdk, keyCode)
        if code == 0:
            count_success += 1
            cdk_success += cdk + ','
        elif code == 2:
            cdk_res += cdk + ','
        time.sleep(2.5)
    userInfo['cdk'] = cdk_success[:-1]
    userInfo['cdk_res'] = cdk_res[:-1]
    return {'count_error': count_error, 'count_success': count_success, 'userInfo': userInfo}


def _runUserAll(userCdkList: dict):
    """
    一键兑换所有
    :param userCdkList: 未使用兑换码的用户和兑换码列表
    :return:
    """
    data = []
    deleteUser = []
    for key, value in userCdkList.items():
        # print(f"正在帮{key}兑换", value)
        result = _runAll(key, value)
        # print(result)
        if any(key in result for key in ('大熔炉等级低于9', '用户角色不存在')):
            deleteUser.append(key)
            continue
        if isinstance(result, str):
            continue
        data.append(result)
        time.sleep(2)
    return data, deleteUser


def string_to_timestamp(time_str: str, timezone='Asia/Shanghai') -> str:
    """将时间字符串转换为时间戳（秒级）"""
    try:
        dt = datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
        tz = pytz.timezone(timezone)
        dt_localized = tz.localize(dt)
        return str(int(dt_localized.timestamp()))
    except ValueError as e:
        print(f"时间格式错误: {e}")
        return ''


if __name__ == '__main__':
    pass

