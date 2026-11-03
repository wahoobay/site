// The admin's capability matrix: a copy of the server's Roles.java (wahoobay/api, common/auth/Roles.java). The server
// enforces (CapabilityFilter); this only decides what to SHOW. Keep it identical in meaning to Roles.java.

export const ROLES = Object.freeze(['owner', 'admin', 'intern', 'volunteer']);

/** Roles.ALL_CAPS, in the server's display order. */
export const CAPABILITIES = Object.freeze([
  'viewData', 'reviewSightings', 'editSpecies', 'editMedia', 'hideMedia', 'manageCameras',
  'manageSchools', 'recycle', 'inviteTeam', 'manageUsers', 'viewAudit', 'settings',
]);

/** Roles.ROLE_CAPS: the capabilities each role has before per-user grants and revokes. */
export const ROLE_CAPS = Object.freeze({
  owner: Object.freeze([...CAPABILITIES]),
  admin: Object.freeze(['viewData', 'reviewSightings', 'editSpecies', 'editMedia', 'hideMedia', 'manageCameras', 'recycle', 'inviteTeam', 'viewAudit', 'settings']),
  intern: Object.freeze(['viewData', 'reviewSightings', 'editSpecies', 'editMedia']),
  volunteer: Object.freeze([]),
});

/**
 * Whether `user` may use `capability`. The owner always may. Otherwise the starting set is the server's effective list
 * when the user carries one (`permissions`, as sign-in and /auth/me answer), else the role's defaults; then `grants` are
 * added and `revokes` removed. An unknown role has nothing.
 * @param {{ role?: string, permissions?: string[], grants?: string[], revokes?: string[] } | null | undefined} user
 * @param {string} capability
 */
export function can(user, capability) {
  if (!user || !CAPABILITIES.includes(capability)) return false;
  const role = String(user.role ?? '').toLowerCase();
  if (role === 'owner') return true;
  /** @type {readonly string[] | undefined} */
  const base = Array.isArray(user.permissions) ? user.permissions : /** @type {Record<string, readonly string[]>} */ (ROLE_CAPS)[role];
  if (!base) return false;
  const caps = new Set(base);
  for (const g of user.grants ?? []) caps.add(g);
  for (const r of user.revokes ?? []) caps.delete(r);
  return caps.has(capability);
}
