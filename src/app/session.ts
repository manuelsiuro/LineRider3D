/**
 * What the player is doing. Exactly one session is active; each mode decides
 * whether the editor is on, which ride is forced and what a finished run saves.
 *
 *   title  the menu, with the demo run looping behind it
 *   edit   the editor: the player's own track, the demo, or a shared track
 *          (a challenge link adds a score to beat and forces the challenger's ride)
 *   level  a built-in level: no editing, rider controls always on
 *   daily  the day's generated ride (same for everyone), like a level; a
 *          friend's link adds a score to beat
 *   puzzle a broken track to fix with limited ink: restricted editor, classic
 *          runs (no rider controls)
 */
export type Session =
  | { kind: 'title' }
  | { kind: 'edit'; challenge: number }
  | { kind: 'level'; index: number }
  | { kind: 'daily'; day: string; challenge: number }
  | { kind: 'puzzle'; index: number };

export const TITLE: Session = { kind: 'title' };
export const EDIT: Session = { kind: 'edit', challenge: 0 };

/** The built-in level being played, or null. */
export const levelOf = (s: Session) => (s.kind === 'level' ? s.index : null);

/** Score to beat from a friend's challenge link (0: none). */
export const challengeOf = (s: Session) => (s.kind === 'edit' || s.kind === 'daily' ? s.challenge : 0);

/** Fixed tracks with rules: no editor, rider controls on, the ride is set. */
export const fixedTrack = (s: Session) => s.kind === 'level' || s.kind === 'daily';

/** Riding (or editing) a track, as opposed to the title menu. */
export const inGame = (s: Session) => s.kind !== 'title';

/** The editor is on (free editing, shared tracks, puzzles). */
export const editing = (s: Session) => s.kind === 'edit' || s.kind === 'puzzle';

/** Nothing is autosaved over the player's own track. */
export const autosaves = (s: Session) => s.kind === 'edit';

/** Free editing: the player's own track, no level or challenge rules. */
export const freeEdit = (s: Session) => s.kind === 'edit' && s.challenge === 0;
