import sprite from "./assets/images/sprite.png";
import burgerBoySprite from "./assets/images/burger-boy.png";
import playerSprite from "./assets/images/player-sprite.png";
import playerFrames from "./assets/images/player-sprite.frames.json";
import { easing } from "@spud.gg/api";
import { Entity, state } from "./state";

type SpriteSheet = {
  image: HTMLImageElement;
  frameWidthPx: number;
  frameHeightPx: number;
  frameCount: number;
};

export const sheet: SpriteSheet = {
  image: new Image(),
  frameWidthPx: 259,
  frameHeightPx: 259,
  frameCount: 24,
};

sheet.image.src = sprite;

/** 660×330 strip: two 330×330 frames. */
export const burgerBoySheet: SpriteSheet = {
  image: new Image(),
  frameWidthPx: 330,
  frameHeightPx: 330,
  frameCount: 2,
};
burgerBoySheet.image.src = burgerBoySprite;

const playerSheetImage = new Image();
playerSheetImage.src = playerSprite;

const SHADOW_COLOR = "#404040";

function bakeShadow(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

let sheetShadow: HTMLCanvasElement | null = null;
let playerShadow: HTMLCanvasElement | null = null;
sheet.image.addEventListener("load", () => {
  sheetShadow = bakeShadow(sheet.image);
});
playerSheetImage.addEventListener("load", () => {
  playerShadow = bakeShadow(playerSheetImage);
});

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  frameIndex: number,
  x: number,
  y: number,
  scale = 1,
  shadow = false,
  row = 0,
) {
  const img = shadow && sheetShadow ? sheetShadow : sheet.image;
  const frame = frameIndex % sheet.frameCount;
  const sourceX = frame * sheet.frameWidthPx;
  const sourceY = row * sheet.frameHeightPx;
  const drawWidthPx = sheet.frameWidthPx * scale;
  const drawHeightPx = sheet.frameHeightPx * scale;

  ctx.drawImage(
    img,
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

/** Draw one frame centered at `(cx, cy)`, scaled to a square of side `sizePx`. */
export function drawBurgerBoyFrame(
  ctx: CanvasRenderingContext2D,
  frameIndex: number,
  cx: number,
  cy: number,
  sizePx: number,
) {
  const frame = frameIndex % burgerBoySheet.frameCount;
  const srcX = frame * burgerBoySheet.frameWidthPx;
  const half = sizePx / 2;
  ctx.drawImage(
    burgerBoySheet.image,
    srcX,
    0,
    burgerBoySheet.frameWidthPx,
    burgerBoySheet.frameHeightPx,
    cx - half,
    cy - half,
    sizePx,
    sizePx,
  );
}

// Auto-tile neighbor bitmask: top=1, right=2, bottom=4, left=8
// Maps bitmask -> sprite index on row 2 of the sprite sheet
const autoTileMap: Record<number, { row: number; index: number }> = {
  0b0000: { row: 0, index: 4 },  // no neighbors
  0b0001: { row: 1, index: 0 },  // top only
  0b0011: { row: 1, index: 1 },  // top + right
  0b1001: { row: 1, index: 2 },  // left + top
  0b1100: { row: 1, index: 3 },  // left + bottom
  0b0010: { row: 1, index: 4 },  // right only
  0b1000: { row: 1, index: 5 },  // left only
  0b0110: { row: 1, index: 6 },  // bottom + right
  0b0100: { row: 1, index: 7 },  // bottom only
  0b1010: { row: 1, index: 8 },  // left + right
  0b0101: { row: 1, index: 9 },  // top + bottom
};

export function drawWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  i: number,
  shadow = false,
  neighborMask = -1,
) {
  const tileScale = 1.01 / sheet.frameWidthPx;
  if (neighborMask >= 0 && neighborMask in autoTileMap) {
    const tile = autoTileMap[neighborMask]!;
    drawSprite(ctx, tile.index, x - 0.5, y - 0.5, tileScale, shadow, tile.row);
  } else {
    const wallIndexes = [0, 1, 2, 3];
    const spriteIndex = wallIndexes[i % wallIndexes.length]!;
    drawSprite(ctx, spriteIndex, x - 0.5, y - 0.5, tileScale, shadow);
  }
}

export function drawBurger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shadow = false,
) {
  const rotate = Math.floor(state.elapsedSeconds * 3) % 2 === 0;
  const burgerIndex = 8;
  const tileScale = 1 / sheet.frameWidthPx;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate ? Math.PI / 20 : -Math.PI / 20);
  drawSprite(ctx, burgerIndex, -0.5, -0.5, tileScale, shadow);
  ctx.restore();
}

export function drawGlass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glassState: 0 | 1 | 2,
  shadow = false,
) {
  const glassIndexByState = [21, 22, 23] as const;
  const glassIndex = glassIndexByState[glassState];
  const tileScale = 1.01 / sheet.frameWidthPx;
  drawSprite(ctx, glassIndex, x - 0.5, y - 0.5, tileScale, shadow);
}

export function drawToilet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stinky: boolean,
  shadow = false,
) {
  const toiletIndex = 9;
  if (!stinky) {
    drawSprite(
      ctx,
      toiletIndex,
      x - 0.5,
      y - 0.5,
      1 / sheet.frameWidthPx,
      shadow,
    );
    return;
  }
  const indexModifier = Math.floor(state.elapsedSeconds) % 2 === 0 ? 1 : 2;
  const index = toiletIndex + indexModifier;
  drawSprite(ctx, index, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx, shadow);
}

export function drawCrumbs(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  i: number,
  shadow = false,
) {
  const crumbIndexes = [16, 17, 18];
  const index = crumbIndexes[i % crumbIndexes.length]!;
  drawSprite(ctx, index, x - 0.5, y - 0.5, 1 / sheet.frameWidthPx, shadow);
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

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  shadow = false,
) {
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
  const wantsToGrowButCant = entity.goalW > entity.w;
  const showBlockedGrowFx = wantsToGrowButCant;
  // hackathon knobs: tune blocked-grow timing/strength here
  const blockedWaitSeconds = 0.5;
  const blockedPushSeconds = 0.2;
  const blockedFailSeconds = 0.28;
  const blockedSettleSeconds = 0.22;
  const blockedCycleSeconds =
    blockedWaitSeconds +
    blockedPushSeconds +
    blockedFailSeconds +
    blockedSettleSeconds;
  const blockedGrowScaleAmount = 0.07;
  const blockedOverlayAlphaMin = 0.16;
  const blockedOverlayAlphaMax = 0.82;
  const blockedIconScaleAmount = 0.15;
  const blockedSettleFloor = 0.08;

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
  let blockedAttempt = 0;
  if (showBlockedGrowFx) {
    const blockedCycleT = state.elapsedSeconds % blockedCycleSeconds;
    if (blockedCycleT > blockedWaitSeconds) {
      const pushEnd = blockedWaitSeconds + blockedPushSeconds;
      const failEnd = pushEnd + blockedFailSeconds;
      if (blockedCycleT <= pushEnd) {
        const t = (blockedCycleT - blockedWaitSeconds) / blockedPushSeconds;
        blockedAttempt = easing.easeOutCubic(t);
      } else if (blockedCycleT <= failEnd) {
        const t = (blockedCycleT - pushEnd) / blockedFailSeconds;
        blockedAttempt =
          (1 - easing.easeInOutSine(t)) * (1 - blockedSettleFloor) +
          blockedSettleFloor;
      } else {
        const t = (blockedCycleT - failEnd) / blockedSettleSeconds;
        blockedAttempt = (1 - easing.easeOutSine(t)) * blockedSettleFloor;
      }
    }
  }
  // mimic the squish feel with an exponential-style curve
  const blockedSquishEase = 1 - Math.exp(-8 * blockedAttempt);
  const blockedGrowScale = 1 + blockedSquishEase * blockedGrowScaleAmount;

  ctx.save();
  ctx.translate(entity.x, entity.y);
  if (moving) {
    ctx.rotate(wobbleLeft ? Math.PI / 20 : -Math.PI / 20);
  }
  ctx.scale(entity.squishX, entity.squishY);
  if (showBlockedGrowFx) {
    ctx.scale(blockedGrowScale, 1);
  }
  if (entity.flipX) {
    ctx.scale(-1, 1);
  }

  const img = shadow && playerShadow ? playerShadow : playerSheetImage;
  ctx.drawImage(
    img,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    -drawW / 2,
    -drawH / 2,
    drawW,
    drawH,
  );

  if (showBlockedGrowFx) {
    const blockedOverlayAlpha =
      blockedOverlayAlphaMin +
      blockedAttempt * (blockedOverlayAlphaMax - blockedOverlayAlphaMin);
    ctx.save();
    ctx.globalCompositeOperation = "hue";
    ctx.globalAlpha = blockedOverlayAlpha;
    ctx.fillStyle = "red";
    ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const blockedIconPulse = easing.easeInOutSine(blockedAttempt);
    const blockedIconScale = 1 + blockedIconPulse * blockedIconScaleAmount;
    const blockedIconDrawW = drawW * blockedIconScale;
    const blockedIconDrawH = drawH * blockedIconScale;
    if (!shadow) {
      ctx.drawImage(
        sheet.image,
        19 * sheet.frameWidthPx,
        0,
        sheet.frameWidthPx,
        sheet.frameHeightPx,
        -blockedIconDrawW / 2,
        -blockedIconDrawH / 2,
        blockedIconDrawW,
        blockedIconDrawH,
      );
    }
  }

  ctx.restore();
}

// todo probably pre-bake these multi-tile subtile things
// or at least just compute once per level instead of every draw
export function drawFloor(ctx: CanvasRenderingContext2D, entity: Entity) {
  const { x, y, index } = entity;
  const floorSubdivisionCount = 4;
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
  const subtileSize = 1 / floorSubdivisionCount;

  for (let row = 0; row < floorSubdivisionCount; row += 1) {
    for (let col = 0; col < floorSubdivisionCount; col += 1) {
      const virtualIndex =
        index * floorSubdivisionCount * floorSubdivisionCount +
        row * floorSubdivisionCount +
        col;
      const rotation = rotations[virtualIndex % rotations.length]!;
      const i = tileIndexes[virtualIndex % tileIndexes.length]!;
      const offsetX = -0.5 + (col + 0.5) * subtileSize;
      const offsetY = -0.5 + (row + 0.5) * subtileSize;

      ctx.save();
      ctx.globalAlpha = opacities[virtualIndex % opacities.length]!;
      ctx.translate(x + offsetX, y + offsetY);
      ctx.scale(rotation[0], rotation[1]);
      drawSprite(
        ctx,
        i,
        -subtileSize / 2,
        -subtileSize / 2,
        subtileSize / sheet.frameWidthPx,
      );
      ctx.restore();
    }
  }
}
