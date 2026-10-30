// A hast plugin for the Markdown pages (Astro's Sätteri processor): an image that points into public/
// (`![alt](/images/…)`) gets its intrinsic width and height, so the page does not shift as it loads,
// and loads lazily.
import { readFile } from 'node:fs/promises';
import { imageMetadata } from 'astro/assets/utils';

const PUBLIC = new URL('../../public/', import.meta.url);

export default function publicImages() {
  return {
    name: 'public-images',
    element: {
      filter: ['img'],
      async visit(node, ctx) {
        const props = node.properties ?? {};
        const src = typeof props.src === 'string' ? props.src : '';
        if (!src.startsWith('/') || src.startsWith('//')) return;
        const file = new URL(decodeURI(src.slice(1)), PUBLIC);
        const { width, height } = await imageMetadata(await readFile(file), src);
        if (props.width === undefined) ctx.setProperty(node, 'width', width);
        if (props.height === undefined) ctx.setProperty(node, 'height', height);
        if (props.loading === undefined) ctx.setProperty(node, 'loading', 'lazy');
        if (props.decoding === undefined) ctx.setProperty(node, 'decoding', 'async');
      },
    },
  };
}
