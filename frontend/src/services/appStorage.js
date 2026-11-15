export const appStorage = {
  getItem(key) {
    const bridge = globalThis.appStorage;
    if (!bridge) return localStorage.getItem(key);
    const result = bridge.getItem(key);
    if (result.error) throw new Error('Storage read failed');
    if (result.value !== null) return result.value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) appStorage.setItem(key, legacy);
    return legacy;
  },
  setItem(key, value) {
    const bridge = globalThis.appStorage;
    if (!bridge) { localStorage.setItem(key, value); return; }
    if (bridge.setItem(key, value).error) throw new Error('Storage write failed');
  },
};
