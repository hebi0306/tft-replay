export async function localReplay(method, args = {}) {
  if (!window.localReplay) throw new Error('capture_desktop_only');
  const response = await window.localReplay.request(method, args);
  if (response.error) throw new Error(response.error);
  return response.result;
}
