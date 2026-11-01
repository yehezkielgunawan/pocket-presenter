export async function presenterAccess(
  id: string,
  signal: AbortSignal,
): Promise<'approved' | 'pair' | 'ended'> {
  const response = await fetch(`/api/sessions/${id}/status?role=presenter`, {
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 403) return 'pair';
  if (response.status === 410) return 'ended';
  if (!response.ok) throw new Error('Cannot reach the session.');
  return 'approved';
}
