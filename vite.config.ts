import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom)[\\/]/,
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
              priority: 20,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
              maxSize: 700 * 1024,
            },
          ],
        },
      },
    },
  },
});
