import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    nz: './src/nz.ts',
    portable: './src/portable.ts',
    node: './src/node.ts',
    'node-browser': './src/node-browser.ts',
    anz: './src/anz.ts',
    asb: './src/asb.ts',
    bnz: './src/bnz.ts',
    kiwibank: './src/kiwibank.ts',
    tsb: './src/tsb.ts',
    westpac: './src/westpac.ts'
  },
  clean: true,
  dts: true,
  format: ['esm', 'cjs'],
  target: 'node22',
  fixedExtension: false,
  sourcemap: true,
  unbundle: true,
  treeshake: true
});
