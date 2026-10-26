import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('offers local PPTX selection and joining an existing session', async () => {
  render(<App />);
  expect(
    await screen.findByLabelText('Choose a PowerPoint file'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /join a session/i })).toHaveAttribute(
    'href',
    '/join',
  );
});
