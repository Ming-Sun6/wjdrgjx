-- Giftcode tables (same RDS as toolbox). Run once on server or use: python init_db.py

CREATE TABLE IF NOT EXISTS gc_user (
    id SERIAL PRIMARY KEY,
    created_at VARCHAR(20),
    username VARCHAR(128),
    email VARCHAR(50) DEFAULT '',
    fid INTEGER NOT NULL,
    "endTime" VARCHAR(20),
    total INTEGER DEFAULT 0,
    success INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    status INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_gc_user_fid ON gc_user (fid);

CREATE TABLE IF NOT EXISTS gc_redeem_code (
    id SERIAL PRIMARY KEY,
    created_at VARCHAR(20),
    code VARCHAR(30) NOT NULL UNIQUE,
    total INTEGER DEFAULT 0,
    success INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    type INTEGER NOT NULL,
    "endTime" VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS gc_admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128),
    password VARCHAR(128) NOT NULL,
    created_at VARCHAR(20),
    status INTEGER DEFAULT 0
);
