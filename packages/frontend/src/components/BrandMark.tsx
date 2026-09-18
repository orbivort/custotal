import type { SVGProps } from 'react';
import { cn } from '../lib/cn';

/* ---------------------------------------------------------------------------
   Custotal brand mark — "the custody bracket"

   A squared "C" whose counter holds one solid seal. The C is the name; the
   seal is the product thesis, that the customer record stays in the holder's
   custody. It is the one place the system's brass secondary is allowed to
   carry meaning instead of state, the way a stamp carries emphasis on a
   document.

   WHY IT IS DRAWN RATHER THAN TYPED
   The mark used to be the literal character "C" set in IBM Plex Sans inside a
   rounded plate. A letter in a coloured square is the default placeholder of
   every product that has not decided on a mark: it is indistinguishable at
   16px from a hundred others. This version keeps the monogram — so it still
   reads as "Custotal" next to the wordmark — but gives it a silhouette no
   stock font can produce:

     - flat, square terminals, so it reads as a ledger bracket rather than as
       a round letterform;
     - a 45-degree chamfer on each outer arm tip, the filing cue of a clipped
       page corner, which also makes the aperture look like it is *holding*
       something rather than merely being empty;
     - one deliberate asymmetry, the seal sitting a quarter-unit right of the
       counter's centre, which is enough to stop the counter reading as a
       mechanically centred hole.

   THREE PROPERTIES THAT DECIDE THE DESIGN
   1. It must survive at 16px. The seal's gaps are 2.5 units, which falls
      under 1.5 device px below 24px, so the mark ships in two optical sizes
      (`detail`) and drops the seal in the smaller one. See FULL_DETAIL_MIN.
   2. It must survive a single ink. Monochrome flattens the seal onto the
      bracket's colour at full strength — half-toning it would erase the dot
      that the compact step is already fighting to keep.
   3. It must survive both grounds. The seal's brass changes with what is
      behind it, not with the page theme: `warn` on paper, `brass-light` on
      navy. See ON_GROUND.

   GEOMETRY
   Everything is authored on a 32-unit grid, and every edge lands on a whole or
   half unit (4, 9.5, 22.5, 28...) so the mark stays crisp at the sizes the app
   actually renders: 16, 20, 24, 26, 28, 32, 40, 48 and 64. Nothing is derived
   from a stroke width or a transform, which matters on fractional device pixel
   ratios — a 1x display at 125% scaling renders a 26px mark at 32.5px, and
   paths that were computed by scaling something else blur there first.
   ------------------------------------------------------------------------- */

/** The mark's design grid. Every coordinate below is in these units. */
const GRID = 32;

/**
 * Full detail: spine 5.5 units thick, arms 5.5, 5-unit chamfers.
 * Read clockwise from the top-left outer corner.
 */
const BRACKET = 'M4 4H23L28 9.5H9.5V22.5H28L23 28H4Z';

/**
 * Compact detail: the same silhouette with the stroke thickened to 6 units and
 * the aperture widened, so nothing inside it falls below ~2 device px at 16px.
 */
const BRACKET_COMPACT = 'M4 4H22L28 10H10V22H28L22 28H4Z';

/** The seal: one record, 8 units square, 2.5 units clear of the arms. */
const SEAL = { x: 15, y: 12, side: 8 } as const;

/**
 * Below this rendered size the seal's 2.5-unit clearances round to under
 * 1.5 device px and the counter fills in, which turns the mark into a solid
 * blob. 24 is also the size of the smallest place it is used next to text.
 */
const FULL_DETAIL_MIN = 24;

/** ~22% of the edge — the "square-ish, never pill" corner of --radius-lg. */
const TILE_RADIUS = 7;

export type BrandTone = 'light' | 'dark' | 'mono';
export type BrandDetail = 'auto' | 'full' | 'compact';

/**
 * A glyph is always read against something. `ground` names that surface, and
 * the seal takes whichever brass survives on it. Using the warm `warn` step on
 * the navy plate measures 1.9:1, where it reads as a smudge; `brass-light` on
 * paper falls to 2.2:1 and is likewise banned there.
 */
const ON_GROUND = {
  light: { bracket: 'fill-forest', seal: 'fill-warn' },
  dark: { bracket: 'fill-paper', seal: 'fill-brass-light' },
} as const;

interface Palette {
  /** The navy/paper plate behind the glyph, when the mark is used as an icon. */
  plate: string | null;
  bracket: string;
  seal: string;
}

function palette(tone: BrandTone, tile: boolean): Palette {
  if (tone === 'mono') {
    // One ink. On a plate the glyph knocks out in cream; bare, it inherits.
    return tile
      ? { plate: 'fill-current', bracket: 'fill-cream', seal: 'fill-cream' }
      : { plate: null, bracket: 'fill-current', seal: 'fill-current' };
  }

  if (tile) {
    // The plate *is* the ground, so it inverts against the surface tone.
    return tone === 'dark'
      ? { plate: 'fill-paper', ...ON_GROUND.light }
      : { plate: 'fill-forest', ...ON_GROUND.dark };
  }

  return { plate: null, ...ON_GROUND[tone] };
}

export interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered box in px. Every part of the mark scales from this one number. */
  size?: number;
  /** Which surface the mark is read against. `mono` flattens it to one ink. */
  tone?: BrandTone;
  /**
   * Reverses the mark onto a plate, which is the app-icon and sign-in form.
   * A plated mark is background-agnostic: it carries its own contrast, which
   * is why the sign-in screen can use it without knowing the page theme.
   */
  tile?: boolean;
  /**
   * `auto` (default) drops the seal below 24px. Override only when the mark is
   * composited at a size the browser will not be told about — a sprite, a
   * canvas draw, an export.
   */
  detail?: BrandDetail;
  /**
   * Accessible name. Omit it wherever a visible wordmark already names the
   * product, so the pair is announced once rather than twice.
   */
  label?: string;
}

export function BrandMark({
  size = 32,
  tone = 'light',
  tile = false,
  detail = 'auto',
  label,
  className,
  ...rest
}: BrandMarkProps) {
  const full = detail === 'full' || (detail === 'auto' && size >= FULL_DETAIL_MIN);
  const { plate, bracket, seal } = palette(tone, tile);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      className={cn('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {plate ? <rect width={GRID} height={GRID} rx={TILE_RADIUS} className={plate} /> : null}
      <path d={full ? BRACKET : BRACKET_COMPACT} className={bracket} />
      {full ? (
        <rect x={SEAL.x} y={SEAL.y} width={SEAL.side} height={SEAL.side} className={seal} />
      ) : null}
    </svg>
  );
}

export type BrandOrientation = 'horizontal' | 'stacked';

/**
 * Wordmark steps, keyed to the mark so the lockup scales as one object rather
 * than as a plate plus an unrelated run of text. The ratios land at two thirds
 * of the mark at the rail size and two fifths at the sign-in hero, which is
 * where a lockup stops reading as a caption and starts leading.
 */
function wordmarkSize(size: number): string {
  if (size >= 48) return 'text-26';
  if (size >= 36) return 'text-22';
  return 'text-19';
}

export interface BrandLockupProps extends Omit<BrandMarkProps, 'label'> {
  /**
   * `horizontal` is the shell form: mark, then name, on one line.
   * `stacked` is the hero form used where the brand leads the page.
   */
  orientation?: BrandOrientation;
  /** Applied to the wordmark alone — the rail folds it away while collapsed. */
  wordmarkClassName?: string;
}

export function BrandLockup({
  size = 32,
  tone = 'light',
  orientation = 'horizontal',
  wordmarkClassName,
  className,
  ...mark
}: BrandLockupProps) {
  const stacked = orientation === 'stacked';

  return (
    <div
      className={cn(
        'flex',
        stacked ? 'flex-col items-center gap-3' : 'items-center gap-2.5',
        className,
      )}
    >
      {/* Decorative here: the wordmark below is always in the tree, so the
          lockup announces the product name exactly once. */}
      <BrandMark size={size} tone={tone} {...mark} />
      <span
        className={cn(
          'font-display font-semibold tracking-tight',
          wordmarkSize(size),
          tone === 'dark' ? 'text-paper' : tone === 'mono' ? 'text-current' : 'text-ink',
          wordmarkClassName,
        )}
      >
        Custotal
      </span>
    </div>
  );
}
