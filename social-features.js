'use strict';

function rankPointsRows(rows) {
  const sorted = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, id: Number(row.id), points: Math.max(0, Number(row.points || 0)) }))
    .sort((a, b) => b.points - a.points || a.id - b.id);

  let previousPoints = null;
  let currentRank = 0;
  return sorted.map((row, index) => {
    if (previousPoints === null || row.points !== previousPoints) currentRank = index + 1;
    previousPoints = row.points;
    return { ...row, rank: currentRank };
  });
}

function getChatSendPolicy(input) {
  const state = input && typeof input === 'object' ? input : {};
  const incomingCount = Math.max(0, Number(state.incomingCount || 0));
  const outgoingCount = Math.max(0, Number(state.outgoingCount || 0));
  const established = incomingCount > 0 && outgoingCount > 0;
  const allowed = Boolean(state.iFollow) || incomingCount > 0;

  if (!allowed) return { allowed: false, established, limit: 'follow_required' };
  return {
    allowed: true,
    established,
    limit: state.mutualFollow || established ? 'minute' : 'daily'
  };
}

function canReadChatThread(input) {
  const state = input && typeof input === 'object' ? input : {};
  return Boolean(state.iFollow) || Boolean(state.followsMe)
    || Number(state.incomingCount || 0) > 0 || Number(state.outgoingCount || 0) > 0;
}

function createKeyedSerialExecutor() {
  const tails = new Map();
  return async function runSerial(key, task) {
    const lockKey = String(key);
    const previous = tails.get(lockKey) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    tails.set(lockKey, tail);
    await previous.catch(() => {});
    try {
      return await task();
    } finally {
      release();
      if (tails.get(lockKey) === tail) tails.delete(lockKey);
    }
  };
}

module.exports = {
  rankPointsRows,
  getChatSendPolicy,
  canReadChatThread,
  createKeyedSerialExecutor
};
