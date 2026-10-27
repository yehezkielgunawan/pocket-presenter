import { expect, test } from '@rstest/core';
import { clientMessage, serverMessage } from '../../shared/protocol';
import {
  confirm,
  createState,
  failRender,
  navigate,
} from '../../shared/session';

test('does not advance confirmed state until matching PC acknowledgment', () => {
  const state = createState('ABC', 'a'.repeat(64), 3, 0);
  const pending = navigate(state, 'command-1', 1, 100);
  expect(pending.confirmedSlideIndex).toBe(0);
  expect(pending.pending?.targetSlideIndex).toBe(1);
  expect(confirm(pending, 1, 0)).toEqual(pending);
  expect(confirm(pending, 1, pending.revision).confirmedSlideIndex).toBe(1);
});

test('preserves Markdown format through both message schemas and accepts legacy plain text', () => {
  const message = {
    type: 'notes',
    index: 0,
    revision: 1,
    text: '# Intro',
    format: 'markdown',
  };
  expect(clientMessage.parse(message)).toEqual(message);
  expect(serverMessage.parse(message)).toEqual(message);
  const plain = { type: 'notes', index: 0, revision: 1, text: '**Literal**' };
  expect(serverMessage.parse(plain)).toMatchObject(plain);
  expect(clientMessage.safeParse({ ...message, format: 'html' }).success).toBe(
    false,
  );
  expect(serverMessage.safeParse({ ...message, format: 'html' }).success).toBe(
    false,
  );
});

test('deduplicates navigation commands and rejects overlapping transitions', () => {
  const state = createState('ABC', 'a'.repeat(64), 3, 0);
  const pending = navigate(state, 'one', 1, 100);
  expect(navigate(pending, 'two', 2, 110)).toEqual(pending);
  const done = confirm(pending, 1, pending.revision);
  expect(navigate(done, 'one', 2, 120)).toEqual(done);
});

test('bounds slides and requires reconciliation after render failure', () => {
  const state = createState('ABC', 'a'.repeat(64), 3, 0);
  expect(navigate(state, 'one', -1, 0)).toEqual(state);
  const pending = navigate(state, 'two', 1, 100);
  const failed = failRender(pending, pending.revision);
  expect(failed.confirmedSlideIndex).toBe(0);
  expect(failed.hostReady).toBe(false);
});

test('rejects invalid message types, unbounded indexes and oversized notes', () => {
  expect(
    clientMessage.safeParse({ type: 'navigate', commandId: 'x', target: -1 })
      .success,
  ).toBe(false);
  expect(
    clientMessage.safeParse({
      type: 'notes',
      index: 0,
      revision: 1,
      text: 'x'.repeat(16001),
    }).success,
  ).toBe(false);
  expect(clientMessage.safeParse({ type: 'unknown' }).success).toBe(false);
});
