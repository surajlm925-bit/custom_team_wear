import { CATALOG_OPTIONS } from "../src/catalog/options.js";

const colors = new Set<string>();
for (const tier of Object.values(CATALOG_OPTIONS)) {
  for (const prod of Object.values(tier)) {
    for (const q of prod) {
      for (const c of q.colors) {
        colors.add(c);
      }
    }
  }
}
console.log(`All catalog colors (${colors.size}):\n`, JSON.stringify([...colors].sort(), null, 2));
