export function decodeEntity(entity) {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><body>&${entity};</body></html>`,
    'text/html',
  );
  const decoded = parsed.body.textContent;
  return decoded === `&${entity};` ? undefined : decoded;
}
