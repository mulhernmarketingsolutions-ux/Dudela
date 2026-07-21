import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://thedudelaco.com',
  output: 'hybrid',
  adapter: cloudflare({
    imageService: 'compile',
  }),
});
