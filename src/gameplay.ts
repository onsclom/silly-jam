import { State, clearAllEntities, createEntity, removeEntity } from "./state";
import { chompSound, sfx } from "./audio";
import {
  justMoved,
  justPressedRestart,
  justPressedSelect,
  justPressedUndo,
} from "./inputs";
import * as Camera from "./camera";
import { isColliding, expDecay, clamp } from "./util";
import { parseLevel } from "./parser";
import { levels } from "./levels/levels";
import {
  drawBurger,
  drawCrumbs,
  drawPlayer,
  drawToilet,
  drawWall,
} from "./sprite";
import { state } from "./state";

const DEBUG = true;
const MAX_UNDO_STACK = 128;
const WIN_SCREEN_INPUT_DELAY = 0.5; // prevents accidently startiong next level too soon

function wrapLevel(index: number) {
  return ((index % levels.length) + levels.length) % levels.length;
}

function prepLevel(index: number) {
  const parsed = parseLevel(levels[index]!);
  clearAllEntities();
  state.undoStack = [];
  state.pendingUndoSnapshot = null;
  state.levelTime = 0;
  state.moves = 0;
  state.undos = 0;
  state.restarts = 0;

  // floodfill floor tiles from player start, bounded by walls
  const walls = new Set<string>();
  let playerStart: { x: number; y: number } | null = null;
  for (const { entity, x, y } of parsed.entities) {
    if (entity === "wall") walls.add(`${x},${y}`);
    if (entity === "player") playerStart = { x, y };
  }
  if (playerStart) {
    const MAX_FLOOD = 500;
    const visited = new Set<string>();
    const queue = [playerStart];
    visited.add(`${playerStart.x},${playerStart.y}`);
    while (queue.length > 0 && visited.size < MAX_FLOOD) {
      const { x, y } = queue.shift()!;
      createEntity({ type: "floor", x, y, w: 1, h: 1, z: -1 });
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx!;
        const ny = y + dy!;
        const key = `${nx},${ny}`;
        if (!visited.has(key) && !walls.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  for (const { entity, x, y, flipX } of parsed.entities) {
    createEntity({
      type: entity,
      x,
      y,
      w: 1,
      h: 1,
      z: entity === "player" ? 10 : 0,
      flipX: flipX ?? false,
    });
  }
  return parsed;
}

export function update(state: State, dt: number) {
  if (state.winScreen) {
    state.winScreenTime += dt / 1000;
    if (state.winScreenTime > WIN_SCREEN_INPUT_DELAY) {
      if (
        justPressedSelect() ||
        justMoved.left() ||
        justMoved.right() ||
        justMoved.up() ||
        justMoved.down() ||
        justPressedRestart()
      ) {
        state.winScreen = false;
        state.winScreenTime = 0;
        state.level = wrapLevel(state.level + 1);
        prepLevel(state.level);
        const textarea = document.querySelector("textarea");
        if (textarea) {
          textarea.value = levels[state.level]!;
        }
        return;
      }
    }
    state.elapsedSeconds += dt / 1000;
    return;
  }

  if (DEBUG) {
    if (state.justPressed.includes("q")) {
      state.level = wrapLevel(state.level - 1);
      prepLevel(state.level);
      return;
    }
    if (state.justPressed.includes("e")) {
      state.level = wrapLevel(state.level + 1);
      prepLevel(state.level);
      return;
    }
  }

  if (justPressedRestart()) {
    prepLevel(state.level);
    state.restarts++;
    return;
  }

  if (justPressedUndo()) {
    if (state.undoStack.length > 0) {
      const snapshot = state.undoStack.pop()!;
      for (let i = 0; i < state.entities.length; i++) {
        Object.assign(state.entities[i]!, snapshot[i]!);
      }
      state.undoTextOpacity = 1;
      state.undos++;
      return;
    }
  }

  const players = state.entities.filter((e) => e.type === "player");
  const walls = state.entities.filter((e) => e.type === "wall");
  const burgers = state.entities.filter((e) => e.type === "burger");
  const toilets = state.entities.filter((e) => e.type === "toilet");

  const isEveryPlayerDoneMoving = players.every(
    (p) => p.vx === 0 && p.vy === 0,
  );

  for (const player of players) {
    if (isEveryPlayerDoneMoving) {
      const moves = [
        { check: justMoved.left, vx: -1, vy: 0, flipX: true },
        { check: justMoved.right, vx: 1, vy: 0, flipX: false },
        { check: justMoved.up, vx: 0, vy: -1 },
        { check: justMoved.down, vx: 0, vy: 1 },
      ];
      const move = moves.find((m) => m.check());

      if (move) {
        state.pendingUndoSnapshot = structuredClone(state.entities);
        player.vx = move.vx;
        player.vy = move.vy;
        if (move.flipX !== undefined) player.flipX = move.flipX;
        state.moves++;
      }
    }
  }

  for (const entity of state.entities) {
    const movementSpeed = 30;
    entity.x += (entity.vx * movementSpeed * dt) / 1000;
    entity.y += (entity.vy * movementSpeed * dt) / 1000;

    if (entity.type === "player") {
      const lastVx = entity.vx;
      const lastVy = entity.vy;
      let hitWall = false;
      for (const wall of walls) {
        if (isColliding(entity, wall)) {
          const eLeft = entity.x - entity.w / 2;
          const eRight = entity.x + entity.w / 2;
          const eTop = entity.y - entity.h / 2;
          const eBottom = entity.y + entity.h / 2;
          const wLeft = wall.x - wall.w / 2;
          const wRight = wall.x + wall.w / 2;
          const wTop = wall.y - wall.h / 2;
          const wBottom = wall.y + wall.h / 2;

          const overlapLeft = eRight - wLeft;
          const overlapRight = wRight - eLeft;
          const overlapTop = eBottom - wTop;
          const overlapBottom = wBottom - eTop;

          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);

          const resolveX = () => {
            if (overlapLeft < overlapRight) {
              entity.x = wLeft - entity.w / 2;
              if (entity.vx > 0) {
                entity.vx = 0;
                hitWall = true;
              }
            } else {
              entity.x = wRight + entity.w / 2;
              if (entity.vx < 0) {
                entity.vx = 0;
                hitWall = true;
              }
            }
          };

          const resolveY = () => {
            if (overlapTop < overlapBottom) {
              entity.y = wTop - entity.h / 2;
              if (entity.vy > 0) {
                hitWall = true;
                entity.vy = 0;
              }
            } else {
              entity.y = wBottom + entity.h / 2;
              if (entity.vy < 0) {
                hitWall = true;
                entity.vy = 0;
              }
            }
          };

          if (minOverlapX < minOverlapY) {
            resolveX();
          } else if (minOverlapY < minOverlapX) {
            resolveY();
          } else {
            if (entity.vx !== 0) {
              resolveX();
            } else {
              resolveY();
            }
          }
          break;
        }
      }
      if (hitWall) {
        sfx("hitWall").play({ detune: Math.random() * 1000 - 500 });
        const shakeStrength = 0.15 * entity.w ** 1.5;
        state.shakeX = -lastVx * shakeStrength;
        state.shakeY = -lastVy * shakeStrength;

        // commit pending undo snapshot only if the move was meaningful
        if (state.pendingUndoSnapshot) {
          const prev = state.pendingUndoSnapshot.find(
            (e) => e.index === entity.index,
          );
          const movedEnough =
            prev &&
            (Math.abs(entity.x - prev.x) > 0.01 ||
              Math.abs(entity.y - prev.y) > 0.01);
          if (movedEnough) {
            state.undoStack.push(state.pendingUndoSnapshot);
            if (state.undoStack.length > MAX_UNDO_STACK)
              state.undoStack.shift();
          }
          state.pendingUndoSnapshot = null;
        }
      }

      const burgerSizeChangeAmount = 0.5;

      for (const burger of burgers) {
        if (
          isColliding(
            entity,
            // making burger hitbox half size so things work nicer
            { ...burger, w: burger.w / 2, h: burger.h / 2 },
          )
        ) {
          const wasEating = entity.eatProgress < 1;
          const eatProgressBeforeChomp = entity.eatProgress;
          chompSound();
          createEntity({
            type: "plate",
            x: burger.x,
            y: burger.y,
            w: 0.5,
            h: 0.5,
            z: -1,
          });
          removeEntity(burger.index);
          entity.goalW += burgerSizeChangeAmount;
          entity.goalH += burgerSizeChangeAmount;
          entity.eatProgress = wasEating ? eatProgressBeforeChomp : 0;
        }
      }
      for (const toilet of toilets) {
        if (
          isColliding(
            entity,
            // making toilet hitbox half size so things work nicer
            { ...toilet, w: toilet.w / 2, h: toilet.h / 2 },
          )
        ) {
          // only use toilet if there was burger eaten
          if (entity.goalW > 1) {
            sfx("toilet").play();
            createEntity({
              type: "poop",
              x: toilet.x,
              y: toilet.y,
              w: 0.5,
              h: 0.5,
              z: -1,
              flipX: toilet.flipX,
            });
            removeEntity(toilet.index);
            entity.goalW -= burgerSizeChangeAmount;
            entity.goalH -= burgerSizeChangeAmount;
          }
        }
      }

      // try to grow/shrink toward goal size using simulation:
      // apply goal size, resolve wall collisions iteratively,
      // and revert if still stuck after several passes
      if (entity.w !== entity.goalW || entity.h !== entity.goalH) {
        const savedX = entity.x;
        const savedY = entity.y;
        const savedW = entity.w;
        const savedH = entity.h;
        entity.w = entity.goalW;
        entity.h = entity.goalH;

        const maxPasses = 4;
        for (let pass = 0; pass < maxPasses; pass++) {
          let hadCollision = false;
          for (const wall of walls) {
            if (!isColliding(entity, wall)) continue;
            hadCollision = true;

            const wLeft = wall.x - wall.w / 2;
            const wRight = wall.x + wall.w / 2;
            const wTop = wall.y - wall.h / 2;
            const wBottom = wall.y + wall.h / 2;

            const overlapLeft = entity.x + entity.w / 2 - wLeft;
            const overlapRight = wRight - (entity.x - entity.w / 2);
            const overlapTop = entity.y + entity.h / 2 - wTop;
            const overlapBottom = wBottom - (entity.y - entity.h / 2);

            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              if (overlapLeft < overlapRight) {
                entity.x = wLeft - entity.w / 2;
              } else {
                entity.x = wRight + entity.w / 2;
              }
            } else {
              if (overlapTop < overlapBottom) {
                entity.y = wTop - entity.h / 2;
              } else {
                entity.y = wBottom + entity.h / 2;
              }
            }
          }
          if (!hadCollision) break;
        }

        // if still colliding after resolution, revert — not enough room
        const stillColliding = walls.some((wall) => isColliding(entity, wall));
        if (stillColliding) {
          entity.x = savedX;
          entity.y = savedY;
          entity.w = savedW;
          entity.h = savedH;
        }
      }

      if (entity.eatProgress < 1) {
        entity.eatProgress = Math.min(1, entity.eatProgress + dt / 300);
      }
    }
  }

  // can check for win once after all moving done
  if (!state.entities.some(({ type }) => type === "burger")) {
    state.level = wrapLevel(state.level + 1);
    prepLevel(state.level);
    sfx("win").play();
    const textarea = document.querySelector("textarea");
    if (textarea) {
      textarea.value = levels[state.level]!;
    }
  }

  state.shakeX = expDecay(state.shakeX, 0, 20, dt);
  state.shakeY = expDecay(state.shakeY, 0, 20, dt);
  state.undoTextOpacity = expDecay(state.undoTextOpacity, 0, 5, dt);

  for (const entity of state.entities) {
    if (entity.type === "none") continue;
    const growAnimationSpeed = 12;
    entity.animatedW = expDecay(
      entity.animatedW,
      entity.w,
      growAnimationSpeed,
      dt,
    );
    entity.animatedH = expDecay(
      entity.animatedH,
      entity.h,
      growAnimationSpeed,
      dt,
    );
  }

  state.levelTime += dt / 1000;
  state.elapsedSeconds += dt / 1000;
}

prepLevel(0);

export function draw(state: State, ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas.getBoundingClientRect();

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#3a7bb8");
  skyGradient.addColorStop(1, "#6aaccc");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "white";
  ctx.lineWidth = 0.02;

  const margin = 1;
  const gameArea = {
    width:
      Math.max(...state.entities.map((entity) => entity.x)) + 1 + margin * 2,
    height:
      Math.max(...state.entities.map((entity) => entity.y)) + 1 + margin * 2,
  };
  state.camera.x = (gameArea.width - 1) / 2 - margin + state.shakeX;
  state.camera.y = (gameArea.height - 1) / 2 - margin + state.shakeY;
  state.camera.zoom = Camera.aspectFitZoom(
    ctx.canvas.getBoundingClientRect(),
    gameArea.width,
    gameArea.height,
  );

  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    ctx.strokeStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "1px sans-serif";

    const zAxisSortedEntities = state.entities
      .filter((e) => e.type !== "none")
      .sort((a, b) => a.z - b.z);
    for (const entity of zAxisSortedEntities) {
      switch (entity.type) {
        case "player": {
          // ctx.strokeRect(
          //   entity.x - entity.animatedW / 2,
          //   entity.y - entity.animatedH / 2,
          //   entity.animatedW,
          //   entity.animatedH,
          // );
          // todo:
          // - facing left or right
          // - squished effect
          // - idle vs walk vs eat + grow animation
          // - maybe a hand-drawn outline so rectangle is still visible?
          drawPlayer(ctx, entity);
          break;
        }
        case "floor": {
          ctx.fillStyle =
            (entity.x + entity.y) % 2 === 0 ? "#b0b0b0" : "#9a9a9a";
          ctx.fillRect(entity.x - 0.5, entity.y - 0.5, 1.01, 1.01);
          break;
        }
        case "wall": {
          drawWall(ctx, entity.x, entity.y, entity.index);
          break;
        }
        case "burger": {
          drawBurger(ctx, entity.x, entity.y);
          break;
        }
        case "toilet":
        case "poop": {
          const isStinky = entity.type === "poop";
          ctx.save();
          if (isStinky) ctx.globalAlpha = 0.4;
          if (entity.flipX) {
            ctx.save();
            ctx.translate(entity.x, entity.y);
            ctx.scale(-1, 1);
            drawToilet(ctx, 0, 0, isStinky);
            ctx.restore();
          } else {
            drawToilet(ctx, entity.x, entity.y, isStinky);
          }
          ctx.restore();
          break;
        }
        case "plate": {
          drawCrumbs(ctx, entity.x, entity.y, entity.index);
          break;
        }
      }
    }
  });

  // Level counter top-right
  {
    const padding = 16;
    const levelFontSize = Math.min(width, height) * 0.035;
    ctx.save();
    ctx.font = `bold ${levelFontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillText(
      `${state.level + 1} / ${levels.length}`,
      width - padding + 1,
      padding + 1,
    );
    ctx.fillStyle = "white";
    ctx.fillText(
      `${state.level + 1} / ${levels.length}`,
      width - padding,
      padding,
    );
    ctx.restore();
  }

  if (state.undoTextOpacity > 0.01) {
    ctx.globalAlpha = state.undoTextOpacity;
    ctx.fillStyle = "white";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("UNDO", width / 2, height / 2);
    ctx.globalAlpha = 1;
  }

  if (state.winScreen) {
    drawWinScreen(state, ctx, width, height);
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}.${ms}` : `${s}.${ms}s`;
}

function drawWinScreen(
  state: State,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const t = state.winScreenTime;
  const minSide = Math.min(width, height);
  const fontSize = minSide * 0.075;

  const overlayAlpha = Math.min(t * 3, 0.6);
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, width, height);

  const letters = "LEVEL COMPLETED!".split("");
  const letterSpacing = fontSize * 0.7;
  const totalWidth = letters.length * letterSpacing;
  const startX = width / 2 - totalWidth / 2 + letterSpacing / 2;
  const titleY = height * 0.3;

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i]!;
    const wavePhase = t * 4 - i * 0.4;
    const waveY = Math.sin(wavePhase) * fontSize * 0.15;
    const waveRotation = Math.sin(wavePhase) * 0.15;
    const hue = (t * 120 + i * 36) % 360;

    const letterDelay = i * 0.05;
    const scaleT = clamp(0, (t - letterDelay) * 4, 1);
    const scale =
      scaleT < 1 ? scaleT * (1 + Math.sin(scaleT * Math.PI) * 0.3) : 1;

    const x = startX + i * letterSpacing;
    const y = titleY + waveY;

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const metrics = ctx.measureText(letter);
    const glyphW = metrics.width;
    const glyphH =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const centerOffsetX = glyphW / 2;
    const centerOffsetY = metrics.actualBoundingBoxAscent - glyphH / 2;

    ctx.translate(x, y);
    ctx.rotate(waveRotation);
    ctx.scale(scale, scale);

    const shadowOffset = fontSize * 0.06;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillText(
      letter,
      -centerOffsetX + shadowOffset,
      centerOffsetY + shadowOffset,
    );

    ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
    ctx.fillText(letter, -centerOffsetX, centerOffsetY);

    ctx.restore();
  }

  const stats = [
    { label: "Time", value: formatTime(state.winStats.time) },
    { label: "Moves", value: `${state.winStats.moves}` },
    { label: "Undos", value: `${state.winStats.undos}` },
    { label: "Restarts", value: `${state.winStats.restarts}` },
  ];

  const statFontSize = fontSize * 0.45;
  const statLineHeight = statFontSize * 2;
  const statsStartY = height * 0.45;
  const statsDelay = 0.3;

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i]!;
    const statT = Math.max(0, t - statsDelay - i * 0.1);
    if (statT <= 0) continue;

    const scaleT = Math.min(1, statT * 4);
    const scale =
      scaleT < 1 ? scaleT * (1 + Math.sin(scaleT * Math.PI) * 0.3) : 1;
    const y = statsStartY + i * statLineHeight;
    const rowText = `${stat.label}  ${stat.value}`;
    const valueHue = (t * 80 + i * 60) % 360;

    ctx.save();
    ctx.translate(width / 2, y);
    ctx.scale(scale, scale);

    ctx.font = `${statFontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8d8d8";
    ctx.fillText(stat.label, -statFontSize * 0.3, 0);

    ctx.font = `bold ${statFontSize}px sans-serif`;
    ctx.textAlign = "left";

    const shadowOff = statFontSize * 0.05;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(stat.value, statFontSize * 0.3 + shadowOff, shadowOff);

    ctx.fillStyle = "white";
    ctx.fillText(stat.value, statFontSize * 0.3, 0);

    ctx.restore();
  }

  if (t > WIN_SCREEN_INPUT_DELAY) {
    const promptAlpha = 0.5 + Math.sin(t * 5) * 0.5;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = "white";
    ctx.font = `${fontSize * 0.3}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Press any key to continue", width / 2, height * 0.82);
    ctx.globalAlpha = 1;
  }
}
