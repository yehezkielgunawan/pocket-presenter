import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('offers presentation and notes selection and joining an existing session', async () => {
  render(<App />);
  expect(await screen.findByLabelText('Presentation file')).toBeInTheDocument();
  expect(screen.getByLabelText('Presentation notes Markdown')).toBeDisabled();
  expect(screen.getByRole('link', { name: /join a session/i })).toHaveAttribute(
    'href',
    '/join',
  );
});
