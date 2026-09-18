import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The app's numeric type scale (text-9 … text-26) is custom, so teach
// tailwind-merge to treat those classes as font-size utilities; otherwise
// they would be misclassified as text colors and wrongly deduplicated.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['9', '10', '11', '12', '13', '15', '17', '19', '22', '26'] }],
    },
  },
});

/**
 * Merge conditional class names and resolve Tailwind conflicts so that
 * later values (usually the caller's overrides) win over base styles.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
