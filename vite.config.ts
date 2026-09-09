import { defineConfig } from 'vite';

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
            },
            {
              name: 'three-vendor',
              test: /node_modules[\\/](?:three|@react-three)[\\/]/,
              priority: 30,
            },
            {
              name: 'xlsx-vendor',
              test: /node_modules[\\/]xlsx[\\/]/,
              priority: 25,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
