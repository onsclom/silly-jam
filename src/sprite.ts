import sprite from "./assets/images/sprite.png";
import { state } from "./state";

type SpriteSheet = {
  image: HTMLImageElement;
  frameWidthPx: number;
  frameHeightPx: number;
  frameCount: number;
};

const sheet: SpriteSheet = {
  image: new Image(),
  frameWidthPx: 259,
  frameHeightPx: 259,
  frameCount: 16,
};

sheet.image.src = sprite;

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  // sheet: SpriteSheet,
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

export function drawWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  i: number,
) {
  const wallIndexes = [0, 1, 2, 3];
  const spriteIndex = wallIndexes[i % wallIndexes.length]!;
  const tileScale = 1.01 / sheet.frameWidthPx;
  drawSprite(ctx, spriteIndex, x - 0.5, y - 0.5, tileScale);
}

// todo: slow 2-frame wobble animation in code
export function drawBurger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const burgerIndex = 8;
  drawSprite(ctx, burgerIndex, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx);
}

export function drawToilet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stinky: boolean,
) {
  const toiletIndex = 9;
  if (!stinky) {
    drawSprite(ctx, toiletIndex, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx);
    return;
  }
  const indexModifier = Math.floor(state.elapsedSeconds) % 2 === 0 ? 1 : 2;
  const index = toiletIndex + indexModifier;
  drawSprite(ctx, index, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx);
}
