import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { createState } from '../../shared/session';
import { RemoteView } from '../../src/features/remote/RemoteView';

test('hides stale notes and disables navigation while a slide is pending', () => {
  const state = {
    ...createState('TEST', 'a'.repeat(64), 2, 0),
    hostConnected: true,
    presenterConnected: true,
    revision: 2,
    pending: {
      commandId: 'test',
      revision: 2,
      targetSlideIndex: 1,
      deadline: Date.now() + 1000,
    },
  };
  render(
    <RemoteView
      state={state}
      notes={{ index: 0, revision: 1, text: 'Private old note' }}
      connected
      navigate={() => {}}
    />,
  );
  expect(screen.queryByText('Private old note')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
});

test('renders Markdown only for confirmed notes marked as Markdown', () => {
  const state = {
    ...createState('TEST', 'a'.repeat(64), 2, 0),
    hostReady: true,
    hostConnected: true,
    presenterConnected: true,
  };
  const { rerender } = render(
    <RemoteView
      state={state}
      notes={{
        index: 0,
        revision: 0,
        text: '# Intro\n\n- **Welcome**',
        format: 'markdown',
      }}
      connected
      navigate={() => {}}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Intro' })).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveTextContent('Welcome');
  rerender(
    <RemoteView
      state={state}
      notes={{ index: 0, revision: 0, text: '# Plain PPTX note' }}
      connected
      navigate={() => {}}
    />,
  );
  expect(
    screen.queryByRole('heading', { name: 'Plain PPTX note' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('# Plain PPTX note')).toBeInTheDocument();
});
