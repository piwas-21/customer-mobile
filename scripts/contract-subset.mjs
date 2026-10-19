const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const own = (value, key) => Object.hasOwn(value ?? {}, key);
const orderedEntries = (value) =>
  Object.keys(value)
    .sort()
    .map((key) => [key, value[key]]);
export function customerSubset(document, operations) {
  if (!/^3\.0\.\d+$/.test(document.openapi) || !Object.keys(operations).length)
    throw new Error('Expected OpenAPI 3.0 and a non-empty operation allowlist');
  const paths = Object.create(null);
  for (const [path, selected] of orderedEntries(operations)) {
    const source = document.paths?.[path];
    if (!path.startsWith('/api/') || !Array.isArray(selected) || !selected.length)
      throw new Error(`Invalid customer operation selection: ${path}`);
    const item = {};
    for (const method of selected) {
      if (!methods.has(method) || !own(source, method))
        throw new Error(`Missing customer operation: ${method} ${path}`);
      item[method] = source[method];
    }
    if (own(source, 'parameters')) item.parameters = source.parameters;
    paths[path] = item;
  }
  const components = Object.create(null);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (own(value, '$ref')) {
      const match = /^#\/components\/([a-zA-Z]+)\/([^/]+)$/.exec(value.$ref);
      if (!match) throw new Error(`Unsupported contract reference: ${value.$ref}`);
      const [, kind, name] = match;
      if (!own(document.components?.[kind], name))
        throw new Error(`Missing contract component: ${value.$ref}`);
      components[kind] ??= Object.create(null);
      if (!own(components[kind], name)) {
        components[kind][name] = document.components[kind][name];
        visit(components[kind][name]);
      }
    }
    if (Array.isArray(value.security)) {
      for (const requirement of value.security) {
        for (const name of Object.keys(requirement)) {
          visit({ $ref: `#/components/securitySchemes/${name}` });
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(paths);
  visit({ security: document.security });
  return {
    openapi: document.openapi,
    info: { title: 'Sofra customer API subset', version: '1.0.0' },
    ...(document.security ? { security: document.security } : {}),
    paths,
    components: Object.fromEntries(
      orderedEntries(components).map(([kind, entries]) => [
        kind,
        Object.fromEntries(orderedEntries(entries)),
      ]),
    ),
  };
}
