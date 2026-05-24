import hashlib
import hmac
import os
import time
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

class ApiSigner:
    def __init__(self, secret_key):
        self.secret_key = secret_key.encode('utf-8')

    def generate_signature(self, data):
        """生成签名"""
        timestamp = str(int(time.time()))

        # 添加时间戳到数据中
        data_with_timestamp = data.copy()
        data_with_timestamp['timestamp'] = timestamp

        # 按字段名排序并拼接
        sorted_data = sorted(data_with_timestamp.items())
        sign_str = '&'.join([f"{k}={v}" for k, v in sorted_data])

        # 使用HMAC-SHA256生成签名
        signature = hmac.new(
            self.secret_key,
            sign_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        return signature, timestamp

    def verify_signature(self, data, signature, timestamp, expire_seconds=30):
        """验证签名"""
        # 检查时间戳是否过期
        current_time = int(time.time())
        if current_time - int(timestamp) > expire_seconds:
            return False
        # 重新生成签名进行验证
        data_with_timestamp = data.copy()
        data_with_timestamp['timestamp'] = timestamp

        sorted_data = sorted(data_with_timestamp.items())
        sign_str = '&'.join([f"{k}={v}" for k, v in sorted_data])

        expected_sign = hmac.new(
            self.secret_key,
            sign_str.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(expected_sign, signature)


# 初始化签名器
SECRET_KEY = (os.getenv('SECRET_KEY') or '').strip()
api_signer = ApiSigner(secret_key=SECRET_KEY) if SECRET_KEY else None


def api_sign_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not api_signer:
            return jsonify({
                'code': 500,
                'error': '服务未配置',
                'message': 'SECRET_KEY 未在 .env 中配置'
            }), 500

        # 从URL参数中获取签名信息
        signature = request.args.get('signature')
        timestamp = request.args.get('timestamp')

        if not signature or not timestamp:
            return jsonify({
                'code': 401,
                'error': '签名参数缺失',
                'message': 'URL中需要包含 signature 和 timestamp 参数'
            }), 401

        # 获取所有URL参数（除了签名相关参数）
        all_params = request.args.to_dict()

        # 提取业务参数（排除签名参数）
        business_params = all_params.copy()
        business_params.pop('signature', None)
        business_params.pop('timestamp', None)

        # 对于POST请求，合并表单数据
        if request.method == 'POST':
            if request.is_json:
                json_data = request.get_json() or {}
                business_params.update(json_data)
            else:
                form_data = request.form.to_dict()
                business_params.update(form_data)

        # 验证签名
        is_valid = api_signer.verify_signature(business_params, signature, timestamp)

        if not is_valid:
            return jsonify({
                'code': 401,
                'error': '签名验证失败',
                'message': ''
            }), 401

        # 将业务参数添加到request对象中，方便后续使用
        request.business_params = business_params

        return f(*args, **kwargs)

    return decorated

def test():
    import requests
    params = {}
    data = {
        'fid': 661455442,
    }
    signature, timestamp = api_signer.generate_signature(data)
    params['signature'] = signature
    params['timestamp'] = timestamp
    print(params)


    response = requests.post('http://127.0.0.1:5201/api/giftCodeAll', params=params, json=data)
    print(response.text)

# if __name__ == '__main__':
#     pass
#     test()