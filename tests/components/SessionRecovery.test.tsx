import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  readRememberedSession,
  rememberSession,
} from '../../src/features/session/rememberedSession';
import { SessionRecovery } from '../../src/features/session/SessionRecovery';

const id = 'ABCDEFGH2345';
const fetchMock = rs.fn<typeof fetch>();
beforeEach(() => {
  rs.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  rs.unstubAllGlobals();
  localStorage.clear();
});

test('resumes an approved session without mounting the setup page', async () => {
  fetchMock.mockResolvedValue(new Response('{}'));
  const resume = rs.fn();
  render(
    <SessionRecovery sessionId={id} onResume={resume}>
      Setup
    </SessionRecovery>,
  );
  await waitFor(() => expect(resume).toHaveBeenCalledWith(id));
  expect(screen.queryByText('Setup')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe(
    `/api/sessions/${id}/status?role=presenter`,
  );
  expect(readRememberedSession()).toBe(id);
});

test('no remembered or explicit session leaves the normal setup available', () => {
  render(
    <SessionRecovery sessionId={null} onResume={rs.fn()}>
      Setup
    </SessionRecovery>,
  );
  expect(screen.getByText('Setup')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([403, 410])(
  'clears inaccessible saved access on HTTP %s',
  async (status) => {
    rememberSession(id);
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    const resume = rs.fn();
    render(
      <SessionRecovery sessionId={id} onResume={resume}>
        Setup
      </SessionRecovery>,
    );
    await screen.findByText('Setup');
    expect(readRememberedSession()).toBeNull();
    expect(resume).not.toHaveBeenCalled();
  },
);

test('temporary failures retain the session and retry without pairing', async () => {
  rememberSession(id);
  fetchMock.mockRejectedValueOnce(new TypeError('Offline'));
  fetchMock.mockResolvedValueOnce(new Response('{}'));
  const resume = rs.fn();
  render(
    <SessionRecovery sessionId={id} onResume={resume}>
      Setup
    </SessionRecovery>,
  );
  await screen.findByRole('button', { name: 'Retry connection' });
  expect(readRememberedSession()).toBe(id);
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() => expect(resume).toHaveBeenCalledWith(id));
});

test('does not resume after navigation cancels a pending check', async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const resume = rs.fn();
  const { unmount } = render(
    <SessionRecovery sessionId={id} onResume={resume}>
      Setup
    </SessionRecovery>,
  );
  const signal = fetchMock.mock.calls[0][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve(new Response('{}'));
  });
  expect(resume).not.toHaveBeenCalled();
});

test('an online event retries a failed recovery immediately', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Offline'));
  fetchMock.mockResolvedValueOnce(new Response('{}'));
  const resume = rs.fn();
  render(
    <SessionRecovery sessionId={id} onResume={resume}>
      Setup
    </SessionRecovery>,
  );
  await screen.findByRole('button', { name: 'Retry connection' });
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(resume).toHaveBeenCalledWith(id));
});
