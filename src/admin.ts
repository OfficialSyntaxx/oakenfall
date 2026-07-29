/* Developer toggles, reached from the admin panel behind the promo code.
 *
 * A const object with mutable contents, for the same reason G is one: a module
 * cannot assign to an imported binding, so `ADMIN.debug = true` from anywhere
 * works where `debug = true` would be a compile error.
 *
 * Not saved and not player-facing — a hold always loads with these off.
 */
export const ADMIN = {
  /** Hunger and fatigue stop advancing, so a hold can be left running. */
  freezeNeeds: false,
  /** No raids roll, scheduled or random. */
  noRaids: false,
  /** Draws the on-screen diagnostics overlay. */
  debug: false,
};
