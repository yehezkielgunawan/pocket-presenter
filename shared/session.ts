import type { Snapshot } from './protocol';

export interface SessionState
  extends Omit<Snapshot, 'hostConnected' | 'presenterConnected'> {
  recentCommands: string[];
}
export function createState(
  sessionId: string,
  fingerprint: string,
  slideCount: number,
  initialIndex: number,
): SessionState {
  return {
    sessionId,
    fingerprint,
    slideCount,
    confirmedSlideIndex: initialIndex,
    revision: 0,
    pending: null,
    hostReady: true,
    status: 'active',
    expiresAt: Date.now() + 86400000,
    recentCommands: [],
  };
}
export function navigate(
  state: SessionState,
  commandId: string,
  target: number,
  now: number,
): SessionState {
  if (
    state.status !== 'active' ||
    !state.hostReady ||
    state.pending ||
    state.recentCommands.includes(commandId) ||
    target < 0 ||
    target >= state.slideCount ||
    target === state.confirmedSlideIndex
  )
    return state;
  const revision = state.revision + 1;
  return {
    ...state,
    revision,
    pending: {
      commandId,
      targetSlideIndex: target,
      revision,
      deadline: now + 15000,
    },
    recentCommands: [...state.recentCommands.slice(-99), commandId],
  };
}
export function confirm(
  state: SessionState,
  index: number,
  revision: number,
): SessionState {
  if (
    !state.pending ||
    state.pending.revision !== revision ||
    state.pending.targetSlideIndex !== index
  )
    return state;
  return {
    ...state,
    confirmedSlideIndex: index,
    pending: null,
    hostReady: true,
  };
}
export function failRender(
  state: SessionState,
  revision: number,
): SessionState {
  if (state.pending?.revision !== revision) return state;
  return {
    ...state,
    pending: null,
    hostReady: false,
    revision: state.revision + 1,
  };
}
