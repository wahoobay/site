// The intrinsic size of a photo under public/ (`/images/…`), for the width and height attributes
// that stop the page shifting as the photo loads.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { imageMetadata } from 'astro/assets/utils';

// Relative to the project root (the build's working directory): this module is bundled, so import.meta.url is not.
const PUBLIC = pathToFileURL(`${process.cwd()}/public/`);

export async function publicImageSize(src) {
  const { width, height } = await imageMetadata(await readFile(new URL(decodeURI(src.slice(1)), PUBLIC)), src);
  return { width, height };
}
