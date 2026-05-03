const DEFAULT_PROFILE_BIO = '这个人很高冷，连个人介绍都不改！';
const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '123456789qaz', 'qaz123456',
  'qwerty', 'qwerty123', 'password', 'abc123456', 'abc12345',
  '11111111', '00000000', '87654321', '1q2w3e4r', '1q2w3e4r5t',
  '1qaz2wsx', '1qaz2wsx3edc'
]);

function createValidationError(error) {
  const err = new Error(error);
  err.code = error;
  return err;
}

function countChars(str) {
  return Array.from(String(str || '')).length;
}

function isValidDisplayName(name) {
  const value = String(name || '');
  if (!value || value.trim() !== value) return false;
  const len = countChars(value);
  if (len < 2 || len > 15) return false;
  try {
    return /^[\p{L}\p{N}_]+$/u.test(value);
  } catch (_err) {
    return /^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(value);
  }
}

function isValidStrongLoginId(loginId) {
  return /^[A-Za-z0-9_]{8,18}$/.test(String(loginId || ''));
}

function normalizeProfileBio(value) {
  if (value === null || value === undefined) return DEFAULT_PROFILE_BIO;
  const text = String(value).trim();
  if (!text) return DEFAULT_PROFILE_BIO;
  if (countChars(text) > 120) return null;
  return text;
}

function getPasswordRuleError(password) {
  const v = String(password || '');
  if (v.length < 8 || v.length > 18) return 'PASSWORD_RULE';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'PASSWORD_RULE';
  if (WEAK_PASSWORDS.has(v.toLowerCase())) return 'PASSWORD_WEAK';
  return null;
}

function normalizeAdminUserPatchPayload(input) {
  const payload = input || {};
  const output = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'loginId')) {
    const loginId = String(payload.loginId || '').trim();
    if (!isValidStrongLoginId(loginId)) throw createValidationError('BAD_LOGIN_ID');
    output.loginId = loginId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'username')) {
    const username = String(payload.username || '').trim();
    if (!isValidDisplayName(username)) throw createValidationError('BAD_USERNAME');
    output.username = username;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'bio')) {
    const bio = normalizeProfileBio(payload.bio);
    if (bio === null) throw createValidationError('BAD_BIO');
    output.bio = bio;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'newPassword')) {
    const newPassword = String(payload.newPassword || '').trim();
    const pwdErr = getPasswordRuleError(newPassword);
    if (pwdErr) throw createValidationError(pwdErr);
    output.newPassword = newPassword;
  }

  return output;
}

function validateBatchAdminUserAction(input) {
  const payload = input || {};
  const action = String(payload.action || '').trim().toLowerCase();
  const rawUserIds = Array.isArray(payload.userIds) ? payload.userIds : [];
  if (!rawUserIds.length) {
    return { ok: false, error: 'EMPTY_USER_IDS' };
  }
  const userIds = rawUserIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0).map((id) => Number(id));
  if (userIds.length !== rawUserIds.length) {
    return { ok: false, error: 'BAD_USER_IDS' };
  }
  if (!['mute', 'reset_bio', 'reset_username'].includes(action)) {
    return { ok: false, error: 'BAD_BATCH_ACTION' };
  }
  return {
    ok: true,
    action,
    userIds
  };
}

function buildBatchResetUsername(prefix, userId) {
  const base = String(prefix || 'user').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'user';
  const suffix = String(Number(userId)).replace(/[^0-9]/g, '') || '0';
  const maxTotal = 15;
  const maxSuffix = Math.min(8, Math.max(1, maxTotal - 2));
  const safeSuffix = suffix.slice(-maxSuffix);
  const maxBaseLength = Math.max(1, maxTotal - safeSuffix.length - 1);
  const safeBase = base.slice(0, maxBaseLength);
  return `${safeBase}_${safeSuffix}`;
}

module.exports = {
  DEFAULT_PROFILE_BIO,
  isValidDisplayName,
  isValidStrongLoginId,
  normalizeProfileBio,
  getPasswordRuleError,
  normalizeAdminUserPatchPayload,
  validateBatchAdminUserAction,
  buildBatchResetUsername
};
