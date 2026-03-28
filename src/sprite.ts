/*
  small sprites will be automatically inlined by Vite.
  sprite files larger than the default 4kb assetsInlineLimit will be
  optimized and fetched after the initial bundle has loaded.
  read more at https://vite.dev/guide/assets#importing-asset-as-url

  moon sprite credit: https://deep-fold.itch.io/pixel-planet-generator
*/
import sprite from "./assets/images/sprite.png";

type SpriteSheet = {
  image: HTMLImageElement;
  frameWidthPx: number;
  frameHeightPx: number;
  frameCount: number;
};

export const moonSheet: SpriteSheet = {
  image: new Image(),
  frameWidthPx: 50,
  frameHeightPx: 50,
  frameCount: 5000 / 50,
};

moonSheet.image.src = sprite;

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  x: number,
  y: number,
  scale = 1,
) {
  const frame = frameIndex % sheet.frameCount;
  const sourceX = frame * sheet.frameWidthPx;
  const sourceY = 0;
  const drawWidthPx = sheet.frameWidthPx * scale;
  const drawHeightPx = sheet.frameHeightPx * scale;

  // see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
  ctx.drawImage(
    sheet.image,
    sourceX,
    sourceY,
    sheet.frameWidthPx,
    sheet.frameHeightPx,
    x,
    y,
    drawWidthPx,
    drawHeightPx,
  );
}
