import { defineConfig } from 'vite';

const KiB = 1024;

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 40,
              maxSize: 450 * KiB,
            },
            {
              name: 'three-vendor',
              test: /node_modules[\\/](?:three|@react-three)[\\/]/,
              priority: 30,
              maxSize: 650 * KiB,
            },
            {
              name: 'xlsx-vendor',
              test: /node_modules[\\/]xlsx[\\/]/,
              priority: 30,
              maxSize: 650 * KiB,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 650 * KiB,
            },
          ],
        },
      },
    },
  },
});
