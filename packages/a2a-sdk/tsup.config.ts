import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server/index.ts',
    'src/server/express/index.ts',
    'src/client/index.ts',
    'src/crypto/index.ts',
    'src/audit/index.ts',
    'src/middleware/index.ts',
    'src/testing/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ['express', 'postgres'],
});
