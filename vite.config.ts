/// <reference path="./src/vite-env.d.ts" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ context }) => {
  return {
    plugins: context === 'ui' ? [react(), tailwindcss()] : [],
  };
});
