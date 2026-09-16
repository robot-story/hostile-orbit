// Shared by the briefing, completion flow and progression tests.
export const OPERATION_WEAPONS = {
  meridian: ['hammer', 'reaper', 'atlas', 'javelin'],
  lantern: ['arc', 'lancer', 'breaker'],
};
export function rewardPreview(map, difficulty, unlocked = []) {
  return {
    xp: Math.round(1200 * (difficulty?.xp || 1)),
    requisition: Math.round(500 * (difficulty?.xp || 1)),
    weapon: (OPERATION_WEAPONS[map] || OPERATION_WEAPONS.meridian).find(id => !unlocked.includes(id)) || null,
  };
}
export function applyMissionRewards(profile, result) {
  if (!result.rewardId) throw new Error('Mission reward receipt needs an ID');
  profile.rewardReceipts ||= {};
  if (profile.rewardReceipts[result.rewardId]) return profile.rewardReceipts[result.rewardId];
  const weapon = result.success ? rewardPreview(result.map, null, profile.unlockedWeapons).weapon : null;
  const receipt = { weaponUnlocks: weapon ? [weapon] : [], levelBefore: profile.level };
  for (const key of ['xp', 'requisition', 'intel']) profile[key] = (profile[key] || 0) + Math.max(0, Number(result[key]) || 0);
  if (weapon) profile.unlockedWeapons.push(weapon);
  profile.level = 1 + Math.floor(Math.sqrt(profile.xp / 400));
  receipt.levelAfter = profile.level;
  profile.rewardReceipts[result.rewardId] = receipt;
  return receipt;
}
