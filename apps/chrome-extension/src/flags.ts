// Compile-time build flavor. Vite statically replaces import.meta.env.VITE_*
// during production builds, so STORE_BUILD folds to a constant and every
// guard around it becomes dead code the minifier removes. It is NOT a
// runtime switch: the pilot zip and the store zip come from the same source
// with two different build commands.
export const STORE_BUILD = import.meta.env.VITE_STORE_BUILD === "1";
