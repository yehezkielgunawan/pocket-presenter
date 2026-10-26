export async function api<T>(
  path: string,
  body?: object,
  method = 'POST',
): Promise<T> {
  const response = await fetch(`/api/sessions${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed.');
  return result as T;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please retry.';
}
