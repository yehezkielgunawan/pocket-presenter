export type SlideSizingMode = 'fit' | 'fill' | 'stretch';

export function calculateSlideSizing(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: SlideSizingMode,
): { width: number; height: number } | null {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  if (mode === 'stretch') return { width: targetWidth, height: targetHeight };
  const ratios = [targetWidth / sourceWidth, targetHeight / sourceHeight];
  const scale = mode === 'fill' ? Math.max(...ratios) : Math.min(...ratios);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}
