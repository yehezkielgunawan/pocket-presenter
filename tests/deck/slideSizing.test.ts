import { expect, test } from '@rstest/core';
import { calculateSlideSizing } from '../../src/features/deck/slideSizing';

test('fits the entire slide within the stage without limiting enlargement', () => {
  expect(calculateSlideSizing(400, 200, 2000, 1500, 'fit')).toEqual({
    width: 2000,
    height: 1000,
  });
  expect(calculateSlideSizing(200, 400, 800, 600, 'fit')).toEqual({
    width: 300,
    height: 600,
  });
});

test('fills the stage with proportional content that can be clipped', () => {
  expect(calculateSlideSizing(400, 200, 800, 600, 'fill')).toEqual({
    width: 1200,
    height: 600,
  });
  expect(calculateSlideSizing(200, 400, 800, 600, 'fill')).toEqual({
    width: 800,
    height: 1600,
  });
});

test('stretches each dimension independently', () => {
  expect(calculateSlideSizing(400, 200, 800, 600, 'stretch')).toEqual({
    width: 800,
    height: 600,
  });
});

test('all modes agree when the proportions match', () => {
  for (const mode of ['fit', 'fill', 'stretch'] as const)
    expect(calculateSlideSizing(400, 200, 800, 400, mode)).toEqual({
      width: 800,
      height: 400,
    });
});

test('defers sizing when source or container dimensions are not usable', () => {
  for (const [sourceWidth, sourceHeight, targetWidth, targetHeight] of [
    [0, 200, 800, 600],
    [400, 200, 0, 600],
    [400, 200, 800, 0],
    [400, 200, -1, 600],
    [400, 200, Infinity, 600],
  ] as const)
    expect(
      calculateSlideSizing(
        sourceWidth,
        sourceHeight,
        targetWidth,
        targetHeight,
        'fit',
      ),
    ).toBeNull();
});
