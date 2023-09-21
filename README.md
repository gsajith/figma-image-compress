# Figma Image Compressor

Batch-compress images in Figma.

if your canvas has many frames with high-definition images, Figma can lag or run out of memory. By compressing your images, you can save on memory and make your files run more smoothly.

## Quickstart

- Run `yarn` to install dependencies.
- Run `yarn build:watch` to start webpack in watch mode.
- Open `Figma` -> `Plugins` -> `Development` -> `Import plugin from manifest...` and choose `manifest.json` file from this repo.

⭐ To change the UI of your plugin (the react code), start editing [App.tsx](./src/app/components/App.tsx).
⭐ To interact with the Figma API edit [controller.ts](./src/plugin/controller.ts).
⭐ Read more on the [Figma API Overview](https://www.figma.com/plugin-docs/api/api-overview/).

## Tooling

This repo is using:

- React + Webpack
- TypeScript
- Prettier precommit hook
