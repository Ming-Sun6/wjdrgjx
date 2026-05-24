import os
import json
import time
import logging

import redis
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

db = SQLAlchemy()
logger = logging.getLogger(__name__)

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST") or "127.0.0.1"
REDIS_PORT = int(os.getenv("REDIS_PORT") or 6379)
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

_pool = None


def get_red():
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            decode_responses=True,
            db=1,
            socket_connect_timeout=2,
        )
    return _pool


def _redis():
    return redis.Redis(connection_pool=get_red())


def _redis_ok() -> bool:
    try:
        _redis().ping()
        return True
    except redis.RedisError as e:
        logger.warning("Redis unavailable: %s", e)
        return False


def setGiftCode(userInfos: list[dict]):
    """存入最新兑换的信息"""
    if not isinstance(userInfos, list) or not _redis_ok():
        return
    try:
        redis_conn = _redis()
        current_time = round(time.time())
        expire_time = 120 * 60 * 60

        for userInfo in userInfos:
            score = current_time
            user_data = json.dumps(userInfo, separators=(',', ':'))
            redis_conn.zadd('wjdrcdklist', {user_data: score})

        redis_conn.zremrangebyscore('wjdrcdklist', 0, current_time - expire_time)
    except redis.RedisError as e:
        logger.warning("setGiftCode failed: %s", e)


def getGiftCodesByPage(page=1, page_size=10):
    """分页获取兑换码信息"""
    empty = {
        'data': [],
        'pages': {
            'page': page,
            'page_size': page_size,
            'total_count': 0,
            'total_pages': 0,
            'has_next': False,
        },
    }
    if not _redis_ok():
        return empty
    try:
        redis_conn = _redis()
        start = (page - 1) * page_size
        end = start + page_size - 1
        page_data = redis_conn.zrevrange('wjdrcdklist', start, end, withscores=True)

        result = []
        for user_data, score in page_data:
            user_info = json.loads(user_data)
            user_info['timestamp'] = str(score)
            result.append(user_info)

        total_count = redis_conn.zcard('wjdrcdklist')
        total_pages = (total_count + page_size - 1) // page_size if total_count else 0

        return {
            'data': result,
            'pages': {
                'page': page,
                'page_size': page_size,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_next': page < total_pages,
            },
        }
    except redis.RedisError as e:
        logger.warning("getGiftCodesByPage failed: %s", e)
        return empty


def update_user_cdk_statistics():
    if not _redis_ok():
        return 0
    try:
        redis_conn = _redis()

        if not redis_conn.exists('user_cdk_statistics'):
            return save_user_cdk_statistics_to_redis()

        old_stats = {}
        all_old_data = redis_conn.hgetall('user_cdk_statistics')
        for fid, cdk_string in all_old_data.items():
            old_stats[int(fid)] = set(cdk_string.split(',')) if cdk_string else set()

        new_stats = get_user_cdk_statistics()
        merged_stats = old_stats.copy()

        for user_info in new_stats:
            fid = user_info['fid']
            new_cdks = set(user_info['cdk'].split(',')) if user_info['cdk'] else set()
            if fid in merged_stats:
                if len(merged_stats[fid]) >= 5:
                    merged_stats[fid] = new_cdks
                else:
                    merged_stats[fid].update(new_cdks)
            else:
                merged_stats[fid] = new_cdks

        for fid, cdk_set in merged_stats.items():
            if cdk_set:
                cdk_string = ','.join(sorted(cdk_set))
                redis_conn.hset('user_cdk_statistics', str(fid), cdk_string)
            else:
                redis_conn.hdel('user_cdk_statistics', str(fid))
        return len(merged_stats)
    except redis.RedisError as e:
        logger.warning("update_user_cdk_statistics failed: %s", e)
        return 0


def get_user_cdk_statistics():
    if not _redis_ok():
        return []
    try:
        redis_conn = _redis()
        all_data = redis_conn.zrange('wjdrcdklist', 0, -1, withscores=False)
        user_cdk_map = {}

        for user_data in all_data:
            user_info = json.loads(user_data)
            fid = user_info.get('fid')
            cdk = user_info.get('cdk', '')
            if fid not in user_cdk_map:
                user_cdk_map[fid] = set()
            if cdk:
                user_cdk_map[fid].update(c.strip() for c in cdk.split(','))

        result = []
        for fid, cdk_set in user_cdk_map.items():
            result.append({'fid': fid, 'cdk': ','.join(sorted(cdk_set))})
        return result
    except redis.RedisError as e:
        logger.warning("get_user_cdk_statistics failed: %s", e)
        return []


def save_user_cdk_statistics_to_redis():
    if not _redis_ok():
        return 0
    try:
        redis_conn = _redis()
        user_cdk_stats = get_user_cdk_statistics()
        for user_info in user_cdk_stats:
            redis_conn.hset('user_cdk_statistics', user_info['fid'], user_info['cdk'])
        return len(user_cdk_stats)
    except redis.RedisError as e:
        logger.warning("save_user_cdk_statistics_to_redis failed: %s", e)
        return 0


def check_user_has_cdk(fid, cdk):
    if not _redis_ok():
        return False
    try:
        redis_conn = _redis()
        cdk_string = redis_conn.hget('user_cdk_statistics', fid)
        if not cdk_string:
            return False
        return cdk in [c.strip() for c in cdk_string.split(',')]
    except redis.RedisError:
        return False


def batch_check_users_have_cdks(fid_list, cdk_list):
    """批量检查用户是否已兑换指定 CDK；Redis 不可用时视为均未兑换"""
    result = {
        'users_with_cdks': {},
        'users_without_cdks': {},
        'all_matched': [],
        'partial_matched': [],
        'none_matched': [],
    }

    if not fid_list:
        return result

    user_cdks_map = {fid: set() for fid in fid_list}

    if _redis_ok():
        try:
            redis_conn = _redis()
            cdk_strings = redis_conn.hmget('user_cdk_statistics', fid_list)
            for fid, cdk_string in zip(fid_list, cdk_strings):
                if cdk_string:
                    user_cdks_map[fid] = set(cdk_string.split(','))
        except redis.RedisError as e:
            logger.warning("batch_check_users_have_cdks failed: %s", e)

    for fid in fid_list:
        user_cdks = user_cdks_map.get(fid, set())
        has_cdks = []
        missing_cdks = []

        for cdk in cdk_list:
            if cdk in user_cdks:
                has_cdks.append(cdk)
            else:
                missing_cdks.append(cdk)

        if has_cdks:
            result['users_with_cdks'][fid] = has_cdks
        if missing_cdks:
            result['users_without_cdks'][fid] = missing_cdks

        if len(has_cdks) == len(cdk_list):
            result['all_matched'].append(fid)
        elif has_cdks:
            result['partial_matched'].append(fid)
        else:
            result['none_matched'].append(fid)

    return result


def clear_gift_codes():
    if not _redis_ok():
        return False
    try:
        return _redis().delete('wjdrcdklist') == 1
    except redis.RedisError:
        return False


def setUserID(fid: str | int):
    if not _redis_ok():
        return
    try:
        _redis().setex(str(fid), 120, 0)
    except redis.RedisError:
        pass


def getUserID(fid: str | int) -> tuple[bool, int]:
    if not _redis_ok():
        return False, 0
    try:
        redis_conn = _redis()
        if redis_conn.exists(str(fid)):
            return True, redis_conn.ttl(str(fid))
        return False, 0
    except redis.RedisError:
        return False, 0
