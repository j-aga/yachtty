import { clamp } from './sim';

/** Where the on-screen tiller and mainsheet sit, in CSS pixels. */
export interface Layout {
  scale: number;
  tiller: { px: number; py: number; len: number; reach: number };
  sheet: { x: number; top: number; bottom: number };
}

export function computeLayout(w: number, h: number): Layout {
  const scale = clamp(Math.min(w, h) / 720, 0.62, 1.15);
  const pad = 26 * scale;
  const len = 135 * scale;
  return {
    scale,
    tiller: {
      px: pad + 120 * scale,
      py: h - pad - 28 * scale,
      len,
      reach: len * Math.sin((35 * Math.PI) / 180),
    },
    sheet: {
      x: w - pad - 62 * scale,
      top: h - pad - 215 * scale,
      bottom: h - pad - 40 * scale,
    },
  };
}

/** Touch, mouse and keyboard input for the tiller and mainsheet. */
export class Input {
  tiller = 0;
  sheet = 0.5;
  layout: Layout = computeLayout(800, 600);
  /** Turn a control off for levels that only teach the other one. */
  tillerEnabled = true;
  sheetEnabled = true;

  private tillerPointer: number | null = null;
  private sheetPointer: number | null = null;
  private keys = new Set<string>();

  get holdingTiller(): boolean {
    return this.tillerPointer !== null;
  }
  get holdingSheet(): boolean {
    return this.sheetPointer !== null;
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      const zone = this.zoneAt(e.clientX, e.clientY);
      if (zone === 'tiller' && this.tillerPointer === null && this.tillerEnabled) {
        this.tillerPointer = e.pointerId;
        this.moveTiller(e.clientX);
      } else if (zone === 'sheet' && this.sheetPointer === null && this.sheetEnabled) {
        this.sheetPointer = e.pointerId;
        this.moveSheet(e.clientY);
      } else {
        return;
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; dragging still works without it.
      }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.tillerPointer) this.moveTiller(e.clientX);
      else if (e.pointerId === this.sheetPointer) this.moveSheet(e.clientY);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.tillerPointer) this.tillerPointer = null;
      if (e.pointerId === this.sheetPointer) this.sheetPointer = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (KEYS.has(e.key)) {
        this.keys.add(e.key);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Let go of everything, e.g. when a new level starts. */
  release(): void {
    this.tillerPointer = null;
    this.sheetPointer = null;
    this.keys.clear();
  }

  update(dt: number): void {
    if (this.tillerPointer === null) {
      const left = this.down('ArrowLeft', 'a', 'A');
      const right = this.down('ArrowRight', 'd', 'D');
      if (this.tillerEnabled && left !== right) {
        this.tiller = clamp(this.tiller + (right ? 1 : -1) * 3.5 * dt, -1, 1);
      } else {
        // Let go and the tiller springs back to the middle.
        this.tiller *= Math.exp(-dt / 0.12);
        if (Math.abs(this.tiller) < 0.005) this.tiller = 0;
      }
    }
    if (this.sheetPointer === null && this.sheetEnabled) {
      const pullIn = this.down('ArrowDown', 's', 'S');
      const letOut = this.down('ArrowUp', 'w', 'W');
      if (pullIn !== letOut) {
        this.sheet = clamp(this.sheet + (letOut ? 1 : -1) * 0.5 * dt, 0, 1);
      }
    }
  }

  private down(...names: string[]): boolean {
    return names.some((n) => this.keys.has(n));
  }

  private zoneAt(x: number, y: number): 'tiller' | 'sheet' | null {
    const { tiller, sheet, scale } = this.layout;
    if (
      Math.abs(x - tiller.px) < tiller.reach + 70 * scale &&
      y > tiller.py - tiller.len - 60 * scale
    ) {
      return 'tiller';
    }
    if (Math.abs(x - sheet.x) < 85 * scale && y > sheet.top - 60 * scale) return 'sheet';
    return null;
  }

  private moveTiller(x: number): void {
    const { px, reach } = this.layout.tiller;
    this.tiller = clamp((x - px) / reach, -1, 1);
  }

  private moveSheet(y: number): void {
    const { top, bottom } = this.layout.sheet;
    // Top of the track = let out, bottom = pulled in.
    this.sheet = clamp((bottom - y) / (bottom - top), 0, 1);
  }
}

const KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'a',
  'A',
  'd',
  'D',
  'w',
  'W',
  's',
  'S',
]);
