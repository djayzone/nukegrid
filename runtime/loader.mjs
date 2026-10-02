export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    try {
      return await nextResolve(specifier.slice(0, -3) + ".ts", context);
    } catch {
      // Fall back to the original specifier for real JavaScript files.
    }
  }
  return nextResolve(specifier, context);
}
