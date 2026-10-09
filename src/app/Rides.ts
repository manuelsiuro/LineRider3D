import { VEHICLES, vehicleById, type VehicleDef } from '../physics/vehicles';
import { selectVehicle, selectedOutfit, selectedVehicleId } from '../game/progress';
import { PAINTS, paintFor, rideProgress, unlockedAchievements } from '../game/achievements';
import { applyOutfit, applyPaint } from '../render/RiderView';
import type { Controls, MedalRow, RidePicker } from '../ui/UI';
import type { Core } from './core';

export interface RideHooks {
  /** Why the ride can't be switched right now, e.g. "this level's ride" (null: it can). */
  lockReason(): string | null;
  /** The ride changed: the current run starts over. */
  changed(): void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MARK_WIDTH: Record<VehicleDef['id'], number> = { sled: 0.07, skis: 0.07, snowboard: 0.18, bike: 0.08, moto: 0.12, buggy: 0.17, coffin: 0.08 };
const PUSH_LABEL: Record<VehicleDef['id'], string> = { sled: 'Push', skis: 'Skate', snowboard: 'Push', bike: 'Pedal', moto: 'Throttle', buggy: 'Gas', coffin: 'Push' };

/** The ride in use: the player's choice, or the one a level or challenge sets. */
export class Rides {
  current: VehicleDef = vehicleById(selectedVehicleId());
  /** Set when the current level or challenge decides the ride. */
  locked: VehicleDef | null = null;

  constructor(private c: Core, private hooks: RideHooks) {}

  apply(def: VehicleDef) {
    const { sim, riderView, sound, groundMarks, ui } = this.c;
    this.current = def;
    sim.setVehicle(def);
    riderView.setVehicle(def);
    sound.setRide(def.sound);
    this.dress();
    groundMarks.width = MARK_WIDTH[def.id];
    ui.setVehicle(def.id, def.name, this.hooks.lockReason());
    this.hooks.changed();
  }

  /** Locks a ride (levels, challenges) or frees the choice again (null). */
  lock(def: VehicleDef | null) {
    this.locked = def;
    const want = def ?? vehicleById(selectedVehicleId());
    if (want !== this.current) this.apply(want);
    else this.c.ui.setVehicle(this.current.id, this.current.name, this.hooks.lockReason());
  }

  /** Outfit colors, then the ride's paint job on top. */
  dress() {
    const o = selectedOutfit();
    applyOutfit(o);
    this.c.riderView.setHead(o.head);
    this.c.ghostView.setHead(o.head);
    const p = paintFor(this.current.id);
    if (p.colors) applyPaint(p.colors[0], p.colors[1]);
  }

  /** Picks a ride as the player's choice (persisted). */
  choose(id: string) {
    selectVehicle(id);
    this.apply(vehicleById(id));
  }

  /** The next ride in the roster; returns it, or null when the ride is locked. */
  cycle(): VehicleDef | null {
    if (this.locked) return null;
    const next = VEHICLES[(VEHICLES.indexOf(this.current) + 1) % VEHICLES.length];
    this.choose(next.id);
    return next;
  }

  /** Garage cards with challenge progress and paint jobs. */
  garageCards() {
    const got = unlockedAchievements();
    return VEHICLES.map((v) => {
      const prog = rideProgress(v.id, got);
      return {
        id: v.id,
        name: v.name,
        blurb: v.blurb,
        stats: v.stats,
        progress: prog,
        paint: paintFor(v.id).id,
        paints: PAINTS[v.id].map((p) => ({ id: p.id, name: p.name, colors: p.colors ?? [], unlocked: prog.done >= p.need, need: p.need })),
      };
    });
  }

  /** Controls of a ride, shown as key caps on the intro cards. */
  keys(def = this.current): Controls {
    // Sled-style rides flip back with ←; wheels flip back with → (like pulling a wheelie).
    const back = def.handling.flipSign > 0 ? 'left' : 'right';
    return {
      touch: this.c.isTouch,
      ground: [
        { key: 'right', label: PUSH_LABEL[def.id] },
        { key: 'left', label: 'Brake' },
        { key: 'jump', label: 'Jump' },
      ],
      air: [
        { key: back, label: 'Backflip' },
        { key: back === 'left' ? 'right' : 'left', label: 'Frontflip' },
        ...(def.handling.yaw ? [{ key: 'up' as const, label: 'Spin' }] : []),
      ],
      note: 'Let go before you land, and touch down flat for a Perfect.',
    };
  }

  /** Intro ride picker: free choice, or the level's own ride (with its medal times on levels). */
  picker(medals?: (id: string) => MedalRow | null): RidePicker {
    return {
      medals,
      options: VEHICLES.map((v) => ({ id: v.id, name: v.name })),
      selected: this.current.id,
      locked: this.locked !== null,
      lockNote: capitalize(this.hooks.lockReason() ?? ''),
      onPick: (id: string) => {
        this.choose(id);
        return this.keys();
      },
    };
  }
}
