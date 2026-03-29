import sprite from "./assets/images/sprite.png";
import playerSprite from "./assets/images/player-sprite.png";
import playerFrames from "./assets/images/player-sprite.frames.json";
import { Entity, state } from "./state";

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
  frameCount: 20,
};

sheet.image.src = sprite;
const playerSheetImage = new Image();
playerSheetImage.src = playerSprite;

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

export function drawBurger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const rotate = Math.floor(state.elapsedSeconds * 3) % 2 === 0;
  const burgerIndex = 8;
  const tileScale = 1 / sheet.frameWidthPx;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate ? Math.PI / 20 : -Math.PI / 20);
  drawSprite(ctx, burgerIndex, -0.5, -0.5, tileScale);
  ctx.restore();
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

export function drawCrumbs(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  i: number,
) {
  const crumbIndexes = [16, 17, 18];
  const index = crumbIndexes[i % crumbIndexes.length]!;
  drawSprite(ctx, index, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx);
}

const frames = {
  small: {
    idle: playerFrames.filter(
      (f) => f.size === "small" && f.eat === undefined && !f.squish,
    ),
    eat: playerFrames.filter((f) => f.size === "small" && f.eat !== undefined),
    hit: playerFrames.filter((f) => f.size === "small" && f.squish),
  },
  medium: {
    idle: playerFrames.filter(
      (f) => f.size === "medium" && f.eat === undefined && !f.squish,
    ),
    eat: playerFrames.filter((f) => f.size === "medium" && f.eat !== undefined),
    hit: playerFrames.filter((f) => f.size === "medium" && f.squish),
  },
  large: {
    idle: playerFrames.filter(
      (f) => f.size === "large" && f.eat === undefined && !f.squish,
    ),
    eat: playerFrames.filter((f) => f.size === "large" && f.eat !== undefined),
    hit: playerFrames.filter((f) => f.size === "large" && f.squish),
  },
  xl: {
    idle: playerFrames.filter(
      (f) => f.size === "xl" && f.eat === undefined && !f.squish,
    ),
    eat: playerFrames.filter((f) => f.size === "xl" && f.eat !== undefined),
    hit: playerFrames.filter((f) => f.size === "xl" && f.squish),
  },
  xxl: {
    idle: playerFrames.filter(
      (f) => f.size === "xxl" && f.eat === undefined && !f.squish,
    ),
    eat: playerFrames.filter((f) => f.size === "xxl" && f.eat !== undefined),
    hit: playerFrames.filter((f) => f.size === "xxl" && f.squish),
  },
};

export function drawPlayer(ctx: CanvasRenderingContext2D, entity: Entity) {
  const sizeKeys = ["small", "medium", "large", "xl", "xxl"] as const;
  const sizeStep = 0.5;
  const sizeIndex = Math.max(
    0,
    Math.min(sizeKeys.length - 1, Math.round((entity.goalW - 1) / sizeStep)),
  );
  const size = sizeKeys[sizeIndex]!;
  const bucket = frames[size];

  const eatFrames = bucket.eat;
  const idleFrames = bucket.idle;
  const usingEat = entity.eatProgress < 1 && eatFrames.length > 0;

  const frame = usingEat
    ? eatFrames[
        Math.min(
          eatFrames.length - 1,
          Math.floor(entity.eatProgress * eatFrames.length),
        )
      ]!
    : idleFrames[Math.floor(state.elapsedSeconds * 2) % idleFrames.length]!;

  const drawW = entity.animatedW;
  const drawH = entity.animatedH;
  const moving = entity.vx !== 0 || entity.vy !== 0;
  const wobbleLeft = Math.floor(state.elapsedSeconds * 3) % 2 === 0;

  ctx.save();
  ctx.translate(entity.x, entity.y);
  if (moving) {
    ctx.rotate(wobbleLeft ? Math.PI / 20 : -Math.PI / 20);
  }
  ctx.scale(entity.squishX, entity.squishY);
  if (entity.flipX) {
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    playerSheetImage,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    -drawW / 2,
    -drawH / 2,
    drawW,
    drawH,
  );
  ctx.restore();
}

export function drawFloor(ctx: CanvasRenderingContext2D, entity: Entity) {
  const { x, y, index } = entity;
  ctx.fillStyle = "#f0f0f2";
  ctx.fillRect(x - 0.5, y - 0.5, 1.01, 1.01);
  const opacities = [0.3, 0.4, 0.2, 0.6, 0.35, 0.4, 0.3, 0.4, 0.25, 0.6, 0.35];
  const rotations = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  const tileIndexes = [12, 13];
  const rotation = rotations[index % rotations.length]!;
  const i = tileIndexes[index % tileIndexes.length]!;
  ctx.save();
  ctx.globalAlpha = opacities[index % opacities.length]!;
  ctx.translate(x, y);
  ctx.scale(rotation[0], rotation[1]);
  drawSprite(ctx, i, -0.5, -0.5, 1 / sheet.frameWidthPx);
  ctx.restore();
}
