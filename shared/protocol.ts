import { z } from 'zod';

const index = z.number().int().min(0).max(499);
const revision = z.number().int().nonnegative();
export const deckInput = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  slideCount: z.number().int().min(1).max(500),
  initialIndex: index,
});
export const clientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    commandId: z.string().min(1).max(80),
    target: index,
  }),
  z.object({
    type: z.literal('ready'),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ type: z.literal('renderConfirmed'), index, revision }),
  z.object({ type: z.literal('renderFailed'), revision }),
  z.object({
    type: z.literal('notes'),
    index,
    revision,
    text: z.string().max(16000),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessage>;
export interface Pending {
  commandId: string;
  targetSlideIndex: number;
  revision: number;
  deadline: number;
}
export interface Snapshot {
  sessionId: string;
  fingerprint: string;
  slideCount: number;
  confirmedSlideIndex: number;
  revision: number;
  pending: Pending | null;
  hostReady: boolean;
  hostConnected: boolean;
  presenterConnected: boolean;
  status: 'active' | 'ended';
  expiresAt: number;
}
export type ServerMessage =
  | { type: 'snapshot'; state: Snapshot }
  | { type: 'renderTarget'; index: number; revision: number }
  | { type: 'requestNotes'; index: number; revision: number }
  | { type: 'notes'; index: number; revision: number; text: string }
  | { type: 'pairing'; requestId: string; label: string }
  | { type: 'error'; message: string };

export const serverMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    state: z.object({
      sessionId: z.string(),
      fingerprint: z.string(),
      slideCount: z.number().int().min(1).max(500),
      confirmedSlideIndex: index,
      revision,
      pending: z
        .object({
          commandId: z.string(),
          targetSlideIndex: index,
          revision,
          deadline: z.number(),
        })
        .nullable(),
      hostReady: z.boolean(),
      hostConnected: z.boolean(),
      presenterConnected: z.boolean(),
      status: z.enum(['active', 'ended']),
      expiresAt: z.number(),
    }),
  }),
  z.object({ type: z.literal('renderTarget'), index, revision }),
  z.object({ type: z.literal('requestNotes'), index, revision }),
  z.object({
    type: z.literal('notes'),
    index,
    revision,
    text: z.string().max(16000),
  }),
  z.object({
    type: z.literal('pairing'),
    requestId: z.string(),
    label: z.string(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
