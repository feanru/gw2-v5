import terser from '@rollup/plugin-terser';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minify } from 'terser';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const appVersion = process.env.APP_VERSION || pkg.version;
const noHashEntries = new Set([
  'ui-helpers',
  'compare-ui',
  'storageUtils',
  'compareHandlers',
  'cuenta',
  'tabs',
  'search-modal-core'
]);

export default {
  // Entradas separadas para cada vista o funcionalidad pesada
  input: {
    'bundle-auth-nav': 'src/js/bundle-auth-nav.js',
    'bundle-dones': 'src/js/bundle-dones.js',
    'bundle-fractales': 'src/js/bundle-fractales.js',
    'bundle-forja-mistica': 'src/js/bundle-forja-mistica.js',
    'bundle-legendary': 'src/js/bundle-legendary.js',
    'bundle-utils-1': 'src/js/bundle-utils-1.js',
    'item-loader': 'src/js/item-loader.js',
    'items-core': 'src/js/items-core.js',
    'tabs': 'src/js/tabs.js',
    'feedback-modal': 'src/js/feedback-modal.js',
    'leg-craft-tabs': 'src/js/leg-craft-tabs.js',
    'search-modal': 'src/js/search-modal.js',
    'search-modal-core': 'src/js/search-modal-core.js',
    'search-modal-compare-craft': 'src/js/search-modal-compare-craft.js',
    'sw-register': 'src/js/sw-register.js',
    'item-mejores': 'src/js/item-mejores.js',
    'itemHandlers': 'src/js/itemHandlers.js',
    'storageUtils': 'src/js/storageUtils.js',
    'ui-helpers': 'src/js/ui-helpers.js',
    'compare-ui': 'src/js/compare-ui.js',
    'compareHandlers': 'src/js/compareHandlers.js',
    'item-ui': 'src/js/item-ui.js',
    'cuenta': 'src/js/cuenta.js',
      'ingredientTreeWorker': 'src/js/workers/ingredientTreeWorker.js',
      'costsWorker': 'src/js/workers/costsWorker.js'
    },
  external: ['./tabs.min.js', './services/recipeService.min.js'],
  plugins: [
    terser(),
    {
      name: 'manifest',
      async generateBundle(options, bundle) {
        const manifest = {};
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === 'chunk') {
            const isWorker = chunk.facadeModuleId?.includes('/workers/') ?? false;
            const originalName = `/dist/js/${chunk.name}${chunk.isEntry ? (isWorker ? '.js' : '.min.js') : '.js'}`;
            manifest[originalName] = `/dist/${appVersion}/${fileName}`;
          }
        }
        for (const dir of ['utils', 'services', 'workers']) {
          let files = [];
          try {
            files = readdirSync(join('src/js', dir));
          } catch {}
          for (const file of files) {
            if (!file.endsWith('.js')) continue;
            const needsMin = dir !== 'workers' && !file.endsWith('.min.js');
            const srcPath = join('src/js', dir, file);
            let code = readFileSync(srcPath, 'utf8');
            if (needsMin) {
              const result = await minify(code);
              code = result.code;
            }
            const outFile = `${dir}/${needsMin ? file.replace(/\.js$/, '.min.js') : file}`;
            this.emitFile({ type: 'asset', fileName: outFile, source: code });
            const distFile = `/dist/js/${dir}/${needsMin ? file.replace(/\.js$/, '.min.js') : file}`;
            manifest[distFile] = `/dist/${appVersion}/${outFile}`;
          }
        }
        writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
      }
    }
  ],
  output: {
    dir: `dist/${appVersion}`,
    format: 'es',
    sourcemap: true,
    entryFileNames: (chunkInfo) => {
      const name = chunkInfo.name;
      if (noHashEntries.has(name)) {
        return '[name].min.js';
      }
      return chunkInfo.facadeModuleId.includes('/workers/')
        ? '[name].[hash].js'
        : '[name].[hash].min.js';
    },
    chunkFileNames: '[name]-[hash].js',
    manualChunks(id) {
      if (id.includes('src/js/utils')) {
        return 'utils';
      }
      if (id.includes('src/js/services/recipeService.js')) {
        return 'services';
      }
    }
  }
};
