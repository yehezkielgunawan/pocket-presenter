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
