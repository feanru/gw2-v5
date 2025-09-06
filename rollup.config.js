import terser from '@rollup/plugin-terser';
import { writeFileSync } from 'node:fs';

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
      'ingredientTreeWorker': 'src/js/workers/ingredientTreeWorker.js',
      'costsWorker': 'src/js/workers/costsWorker.js'
    },
  external: ['./tabs.min.js', './services/recipeService.min.js'],
  plugins: [
    terser(),
    {
      name: 'manifest',
      generateBundle(options, bundle) {
        const manifest = {};
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === 'chunk') {
            const isWorker = chunk.facadeModuleId?.includes('/workers/') ?? false;
            const originalName = `/dist/js/${chunk.name}${chunk.isEntry ? (isWorker ? '.js' : '.min.js') : '.js'}`;
            manifest[originalName] = `/dist/js/${fileName}`;
          }
        }
        writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
      }
    }
  ],
  output: {
    dir: 'dist/js',
    format: 'es',
    entryFileNames: (chunkInfo) =>
      chunkInfo.facadeModuleId.includes('/workers/')
        ? '[name].[hash].js'
        : '[name].[hash].min.js',
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
