// The root mascot.js is the source of truth; this copies it into the package as core.js.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, '..', '..', 'mascot.js'), join(here, 'core.js'));
console.log('core.js synced from mascot.js');
