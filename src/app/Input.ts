import { INPUT } from '../physics/Rider';
import { overlayOpen } from '../ui/UI';

const KEY_BITS: Record<string, number> = {
  ArrowRight: INPUT.push,
  ArrowUp: INPUT.spin,
  ArrowLeft: INPUT.brake,
  ArrowDown: INPUT.brake,
};

/** Live rider input from the arrow keys and the on-screen touch pad. */
export class Input {
  private keys = 0;
  /** Bits from the touch pad buttons. */
  touch = 0;

  /**
   * @param riding  whether arrow keys steer the rider right now
   * @param canCycleRide  whether V may switch rides (free editing only)
   */
  constructor(riding: () => boolean, canCycleRide: () => boolean, cycleRide: () => void) {
    addEventListener('keydown', (e) => {
      const bit = KEY_BITS[e.key];
      if (!bit || !riding()) return;
      e.preventDefault();
      this.keys |= bit;
    });
    addEventListener('keyup', (e) => {
      const bit = KEY_BITS[e.key];
      if (bit) this.keys &= ~bit;
    });
    addEventListener('blur', () => (this.keys = 0));
    addEventListener('keydown', (e) => {
      // V: next ride while editing (levels and challenges pick theirs on the intro).
      if ((e.key === 'v' || e.key === 'V') && canCycleRide() && !overlayOpen() && !(e.target instanceof HTMLInputElement)) cycleRide();
    });
  }

  /** Current input bits (keys and touch). */
  get mask() {
    return this.keys | this.touch;
  }

  /** Dev hook: hold keys by hand. */
  set devKeys(mask: number) {
    this.keys = mask;
  }
}
