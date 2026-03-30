import { State, clearAllEntities, createEntity, removeEntity } from "./state";
import {
  chompSound,
  glassHitSound,
  glassShatterSound,
  hitWallSound,
  sfx,
  tutorialKeySound,
  winSound,
} from "./audio";
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
  drawArtwork,
  bakeStaticLayer,
  drawBakedFloorLayer,
  drawBakedWallLayer,
  drawBakedWallShadowLayer,
  burgerBoySheet,
  drawBurger,
  drawBurgerBoyFrame,
  drawCrumbs,
  drawGlass,
  drawGlassShatterFx,
  drawPlayer,
  drawSheetCellCentered,
  drawToilet,
  sheet,
  tutorialArrowSpriteByKey,
} from "./sprite";
import { state } from "./state";
import * as Renderer from "./renderer";

const DEBUG = import.meta.env.DEV || window.location.hash === "#debug";
const SHADOWS_ENABLED = true; // @seb in case you don't like these
const SHADOW_OFFSET = 0.12;
const MAX_UNDO_STACK = 128;
const WIN_SCREEN_INPUT_DELAY = 0.5; // prevents accidently startiong next level too soon

// transition stuff
const TRANSITION_COVER_TIME = 0.5;
const TRANSITION_UNCOVER_TIME = 0.5;
const BURGER_TILE_SIZE = 70; // px on screen

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function startTransition(level: number) {
  state.transitionTime = -TRANSITION_COVER_TIME;
  state.transitionLevel = level;
}

function updateControlsTutorial(state: State, dt: number) {
  for (const pressedKey of state.justPressed) {
    const isTutorialKey = state.tutorialKeys.some((key) =>
      key.keys.includes(pressedKey),
    );
    if (isTutorialKey) tutorialKeySound();
  }

  for (const key of state.tutorialKeys) {
    if (!key.popped) {
      const wasPressed = state.justPressed.some((k) => key.keys.includes(k));
      if (wasPressed) {
        key.popped = true;
        key.popTime = state.elapsedSeconds;
      }
    }

    if (key.popped) {
      key.popScale = expDecay(key.popScale, 0, 16, dt);
    }
  }

  // all popped and fully scaled down? go to title
  if (state.tutorialKeys.every((k) => k.popped && k.popScale < 0.01)) {
    state.gamePhase = "title";
    state.titleTime = 0;
  }
}

function wrapLevel(index: number) {
  return ((index % levels.length) + levels.length) % levels.length;
}

function populateEntitiesFromParsedLevel(
  parsed: ReturnType<typeof parseLevel>,
  isLastLevel: boolean,
) {
  clearAllEntities();

  // floodfill floor tiles from player start, bounded by walls
  const walls = new Set<string>();
  const floodBarriers = new Set<string>();
  let playerStart: { x: number; y: number } | null = null;
  for (const { entity, x, y } of parsed.entities) {
    if (entity === "wall") walls.add(`${x},${y}`);
    if (entity === "player") playerStart = { x, y };
    // on last level, glass also blocks floodfill
    if (isLastLevel && entity === "glass") floodBarriers.add(`${x},${y}`);
  }
  // combine walls and any extra barriers for floodfill
  const floodBlockers = new Set([...walls, ...floodBarriers]);
  // Draw floors under every wall
  for (const key of walls) {
    const [wx, wy] = key.split(",").map(Number);
    createEntity({ type: "floor", x: wx!, y: wy!, w: 1, h: 1, z: -1 });
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
        if (!visited.has(key) && !floodBlockers.has(key)) {
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

  const wallTiles = parsed.entities
    .filter(({ entity }) => entity === "wall")
    .map(({ x, y }) => ({ x, y }));
  if (wallTiles.length > 0) {
    const artworkSpriteIndexes = [10, 14] as const;
    shuffleInPlace(wallTiles);
    const { x, y } = wallTiles[0]!;
    const artworkSpriteIndex =
      artworkSpriteIndexes[
        Math.floor(Math.random() * artworkSpriteIndexes.length)
      ]!;
    createEntity({
      type: "artwork",
      x,
      y,
      w: 1,
      h: 1,
      z: 1,
      artworkSpriteIndex,
    });
  }

  bakeStaticLayer(state.entities, SHADOW_OFFSET);
}

export function rebuildLevelFromText(levelText: string, isLastLevel = false) {
  const parsed = parseLevel(levelText);
  populateEntitiesFromParsedLevel(parsed, isLastLevel);
  return parsed;
}

function prepLevel(index: number) {
  const parsed = parseLevel(levels[index]!);
  state.undoStack = [];
  state.pendingUndoSnapshot = null;
  state.levelTime = 0;
  state.moves = 0;
  state.undos = 0;
  state.restarts = 0;

  // reset game stats when starting from level 0
  if (index === 0) {
    state.gameStats = { time: 0, moves: 0, undos: 0, restarts: 0 };
  }

  const isLastLevel = index === levels.length - 1;
  populateEntitiesFromParsedLevel(parsed, isLastLevel);

  return parsed;
}

export function update(state: State, dt: number) {
  state.elapsedSeconds += dt / 1000;

  // --- Controls tutorial phase ---
  if (state.gamePhase === "controls") {
    updateControlsTutorial(state, dt);
    return;
  }

  // --- Title screen phase ---
  if (state.gamePhase === "title") {
    state.titleTime += dt / 1000;
    if (state.titleTime > 0.5 && state.justPressed.length > 0) {
      state.gamePhase = "gameplay";
      startTransition(0);
    }
    return;
  }

  // --- Gameplay phase ---
  // advance transition
  if (state.transitionTime !== null) {
    const prev = state.transitionTime;
    state.transitionTime += dt / 1000;

    // crossed zero = midpoint, swap level
    if (prev < 0 && state.transitionTime >= 0) {
      const isRestart = state.transitionLevel === state.level;
      const savedStats = {
        levelTime: state.levelTime,
        moves: state.moves,
        undos: state.undos,
        restarts: state.restarts,
      };
      state.level = state.transitionLevel!;
      prepLevel(state.level);
      if (isRestart) {
        state.levelTime = savedStats.levelTime;
        state.moves = savedStats.moves;
        state.undos = savedStats.undos;
        state.restarts = savedStats.restarts;
      }
      state.winScreen = false;
      state.winScreenTime = 0;
      state.gameBeatScreen = false;
      state.gameBeatScreenTime = 0;
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.value = levels[state.level]!;
      }
    }

    // done uncovering
    if (state.transitionTime >= TRANSITION_UNCOVER_TIME) {
      state.transitionTime = null;
      state.transitionLevel = null;
    }

    return;
  }

  if (state.gameBeatScreen) {
    state.gameBeatScreenTime += dt / 1000;
    // don't return — let physics keep running so the player flies out
  }

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
        startTransition(wrapLevel(state.level + 1));
        return;
      }
    }
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

  if (!state.gameBeatScreen) {
    if (justPressedRestart()) {
      state.restarts++;
      startTransition(state.level);
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
  }

  const players = state.entities.filter((e) => e.type === "player");
  const walls = state.entities.filter((e) => e.type === "wall");
  const glasses = state.entities.filter((e) => e.type === "glass");
  const burgers = state.entities.filter((e) => e.type === "burger");
  const toilets = state.entities.filter((e) => e.type === "toilet");
  const getBlockingObstacles = () =>
    state.entities.filter(
      (e) => e.type === "wall" || (e.type === "glass" && e.glassState !== 2),
    );

  const isEveryPlayerDoneMoving = players.every(
    (p) => p.vx === 0 && p.vy === 0,
  );

  for (const player of players) {
    if (player.vx === 0 && player.vy === 0) {
      player.moveStartedAgainstCrackedGlassIndex = -1;
    }
  }

  if (!state.gameBeatScreen) {
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
          const targetX = Math.round(player.x) + move.vx;
          const targetY = Math.round(player.y) + move.vy;
          // From rest, pressing into a glass tile ahead: no crack/shatter on that tile this move.
          const adjacentGlassAhead = glasses.find(
            (glass) =>
              glass.glassState !== 2 &&
              Math.round(glass.x) === targetX &&
              Math.round(glass.y) === targetY,
          );
          player.moveStartedAgainstCrackedGlassIndex = adjacentGlassAhead
            ? adjacentGlassAhead.index
            : -1;
          if (move.flipX !== undefined) player.flipX = move.flipX;
          state.moves++;
        }
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

      // First pass: apply state transitions to all overlapping glass this frame.
      // This lets bigger players affect multiple glass tiles in one bump.
      let crackedAnyGlass = false;
      let shatteredAnyGlass = false;
      for (const glass of glasses) {
        if (glass.glassState === 2) continue;
        if (!isColliding(entity, glass)) continue;

        if (glass.glassState === 0) {
          const startedFromRestAdjacentAndPushedIntoThisGlass =
            entity.moveStartedAgainstCrackedGlassIndex === glass.index;
          if (!startedFromRestAdjacentAndPushedIntoThisGlass) {
            glass.glassState = 1;
            crackedAnyGlass = true;
          }
          continue;
        }

        const startedFromRestAdjacentAndPushedIntoThisGlass =
          entity.moveStartedAgainstCrackedGlassIndex === glass.index;
        if (!startedFromRestAdjacentAndPushedIntoThisGlass) {
          glass.glassState = 2;
          const brokeFromLeft = entity.vx > 0;
          createEntity({
            type: "glassShatterFx",
            x: glass.x + (brokeFromLeft ? 1 : -1),
            y: glass.y,
            w: 1,
            h: 1,
            z: 1,
            flipX: !brokeFromLeft,
            shatterFxStartedAt: state.elapsedSeconds,
          });
          shatteredAnyGlass = true;
        }
      }
      if (crackedAnyGlass) glassHitSound();
      if (shatteredAnyGlass) {
        glassShatterSound();
        entity.moveStartedAgainstCrackedGlassIndex = -1;
      }

      let hitObstacle = false;
      let hitWall = false;
      const blockingObstacles = getBlockingObstacles();
      for (const obstacle of blockingObstacles) {
        if (isColliding(entity, obstacle)) {
          const eLeft = entity.x - entity.w / 2;
          const eRight = entity.x + entity.w / 2;
          const eTop = entity.y - entity.h / 2;
          const eBottom = entity.y + entity.h / 2;
          const wLeft = obstacle.x - obstacle.w / 2;
          const wRight = obstacle.x + obstacle.w / 2;
          const wTop = obstacle.y - obstacle.h / 2;
          const wBottom = obstacle.y + obstacle.h / 2;

          const overlapLeft = eRight - wLeft;
          const overlapRight = wRight - eLeft;
          const overlapTop = eBottom - wTop;
          const overlapBottom = wBottom - eTop;

          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);
          let hitThisObstacle = false;

          const resolveX = () => {
            if (overlapLeft < overlapRight) {
              entity.x = wLeft - entity.w / 2;
              if (lastVx > 0) {
                entity.vx = 0;
                hitThisObstacle = true;
              }
            } else {
              entity.x = wRight + entity.w / 2;
              if (lastVx < 0) {
                entity.vx = 0;
                hitThisObstacle = true;
              }
            }
          };

          const resolveY = () => {
            if (overlapTop < overlapBottom) {
              entity.y = wTop - entity.h / 2;
              if (lastVy > 0) {
                hitThisObstacle = true;
                entity.vy = 0;
              }
            } else {
              entity.y = wBottom + entity.h / 2;
              if (lastVy < 0) {
                hitThisObstacle = true;
                entity.vy = 0;
              }
            }
          };

          if (minOverlapX < minOverlapY) {
            resolveX();
          } else if (minOverlapY < minOverlapX) {
            resolveY();
          } else {
            if (lastVx !== 0) {
              resolveX();
            } else {
              resolveY();
            }
          }
          if (hitThisObstacle) {
            hitObstacle = true;
            if (obstacle.type === "wall") {
              hitWall = true;
            }
          }
        }
      }
      if (hitObstacle) {
        if (hitWall) {
          // const sizeScale = entity.w ** 1.5;
          hitWallSound(entity);
        }
        const shakeStrength = 0.09 * entity.w ** 1.5;
        state.shakeX = -lastVx * shakeStrength;
        state.shakeY = -lastVy * shakeStrength;

        // squish & squash on wall impact
        const squishAmount = 0.3;
        if (lastVx !== 0) {
          entity.squishX = 1 - squishAmount;
          entity.squishY = 1 + squishAmount;
        } else {
          entity.squishX = 1 + squishAmount;
          entity.squishY = 1 - squishAmount;
        }

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
        entity.moveStartedAgainstCrackedGlassIndex = -1;
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
          chompSound(entity);
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
          for (const obstacle of getBlockingObstacles()) {
            if (!isColliding(entity, obstacle)) continue;
            hadCollision = true;

            const wLeft = obstacle.x - obstacle.w / 2;
            const wRight = obstacle.x + obstacle.w / 2;
            const wTop = obstacle.y - obstacle.h / 2;
            const wBottom = obstacle.y + obstacle.h / 2;

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
        const stillColliding = getBlockingObstacles().some((obstacle) =>
          isColliding(entity, obstacle),
        );
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

  // only show win once the final bite animation has finished
  const hasBurgersLeft = state.entities.some(({ type }) => type === "burger");
  const playerStillEating = state.entities.some(
    (entity) => entity.type === "player" && entity.eatProgress < 1,
  );
  const isLastLevel = state.level === levels.length - 1;
  if (!hasBurgersLeft && !playerStillEating && !isLastLevel) {
    state.winScreen = true;
    state.winScreenTime = 0;
    state.winStats = {
      time: state.levelTime,
      moves: state.moves,
      undos: state.undos,
      restarts: state.restarts,
    };
    state.gameStats.time += state.levelTime;
    state.gameStats.moves += state.moves;
    state.gameStats.undos += state.undos;
    state.gameStats.restarts += state.restarts;
    winSound();
  }

  // last level: all glass shattered = beat the game
  if (isLastLevel && !state.gameBeatScreen) {
    const hasUnshatteredGlass = state.entities.some(
      (e) => e.type === "glass" && e.glassState !== 2,
    );
    if (!hasUnshatteredGlass) {
      state.gameBeatScreen = true;
      state.gameBeatScreenTime = 0;
      state.gameStats.time += state.levelTime;
      state.gameStats.moves += state.moves;
      state.gameStats.undos += state.undos;
      state.gameStats.restarts += state.restarts;
      winSound();
    }
  }

  // last level: continuously spawn burgers ahead of the player for fun
  if (state.gameBeatScreen) {
    for (const player of state.entities.filter((e) => e.type === "player")) {
      if (player.vx !== 0 || player.vy !== 0) {
        const spawnDist = player.w / 2 + 1.5;
        const spawnX = player.x + player.vx * spawnDist;
        const spawnY = player.y + player.vy * spawnDist;
        // only spawn if no burger already nearby
        const hasBurgerNear = state.entities.some(
          (e) =>
            e.type === "burger" &&
            Math.abs(e.x - spawnX) < 1 &&
            Math.abs(e.y - spawnY) < 1,
        );
        if (!hasBurgerNear) {
          createEntity({
            type: "burger",
            x: spawnX,
            y: spawnY,
            w: 1,
            h: 1,
            z: 0,
          });
        }
      }
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
    const squishDecaySpeed = 12;
    entity.squishX = expDecay(entity.squishX, 1, squishDecaySpeed, dt);
    entity.squishY = expDecay(entity.squishY, 1, squishDecaySpeed, dt);
  }

  state.levelTime += dt / 1000;
}

// Only prep level 0 if starting in gameplay (not intro)
if (state.gamePhase === "gameplay") {
  prepLevel(0);
}

export function draw(state: State, ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas.getBoundingClientRect();

  // --- Draw intro phases ---
  if (state.gamePhase === "controls" || state.gamePhase === "title") {
    drawIntro(state, ctx, width, height);
    return;
  }

  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#3a7bb8");
  skyGradient.addColorStop(1, "#6aaccc");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "white";
  ctx.lineWidth = 0.02;

  const margin = 1;
  const activeEntities = state.entities.filter((e) => e.type !== "none");
  let minX = Math.min(...activeEntities.map((e) => e.x - e.w / 2));
  let maxX = Math.max(...activeEntities.map((e) => e.x + e.w / 2));
  let minY = Math.min(...activeEntities.map((e) => e.y - e.h / 2));
  let maxY = Math.max(...activeEntities.map((e) => e.y + e.h / 2));

  // on last level, add extra padding around the player so they're not at the edge
  if (state.gameBeatScreen) {
    const player = activeEntities.find((e) => e.type === "player");
    if (player) {
      const pad = player.w * 2 + 3;
      minX = Math.min(minX, player.x - pad);
      maxX = Math.max(maxX, player.x + pad);
      minY = Math.min(minY, player.y - pad);
      maxY = Math.max(maxY, player.y + pad);
    }
  }

  const gameArea = {
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
  state.camera.x = (minX + maxX) / 2 + state.shakeX;
  state.camera.y = (minY + maxY) / 2 + state.shakeY;
  state.camera.zoom = Camera.aspectFitZoom(
    ctx.canvas.getBoundingClientRect(),
    gameArea.width,
    gameArea.height,
  );

  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    ctx.strokeStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "1px handwriting";

    const SHADOW_Z = -0.5; // between everything and floor

    // Draw baked static layers at correct z-levels
    Renderer.submit(-1, (ctx) => drawBakedFloorLayer(ctx));
    Renderer.submit(0, (ctx) => drawBakedWallLayer(ctx));
    if (SHADOWS_ENABLED) {
      Renderer.submit(SHADOW_Z, (ctx) => drawBakedWallShadowLayer(ctx));
    }

    for (const entity of state.entities) {
      if (
        entity.type === "none" ||
        entity.type === "floor" ||
        entity.type === "wall"
      )
        continue;

      // helper to submit a shadow version of a draw call
      const submitShadow = !SHADOWS_ENABLED
        ? () => {}
        : (drawFn: (ctx: CanvasRenderingContext2D) => void) => {
            Renderer.submit(SHADOW_Z, (ctx) => {
              ctx.save();
              ctx.translate(SHADOW_OFFSET, SHADOW_OFFSET);
              drawFn(ctx);
              ctx.restore();
            });
          };

      switch (entity.type) {
        case "player": {
          const e = entity;
          submitShadow((ctx) => drawPlayer(ctx, e, true));
          Renderer.submit(entity.z, (ctx) => drawPlayer(ctx, e));
          break;
        }
        case "artwork": {
          const { x, y, z, artworkSpriteIndex } = entity;
          Renderer.submit(z, (ctx) =>
            drawArtwork(ctx, x, y, artworkSpriteIndex),
          );
          break;
        }
        case "burger": {
          const { x, y, z } = entity;
          submitShadow((ctx) => drawBurger(ctx, x, y, true));
          Renderer.submit(z, (ctx) => drawBurger(ctx, x, y));
          break;
        }
        case "glass": {
          const { x, y, z, glassState } = entity;
          submitShadow((ctx) => drawGlass(ctx, x, y, glassState, true));
          Renderer.submit(z, (ctx) => drawGlass(ctx, x, y, glassState));
          break;
        }
        case "glassShatterFx": {
          const { x, y, z, flipX, shatterFxStartedAt } = entity;
          Renderer.submit(z, (ctx) => {
            if (flipX) {
              ctx.save();
              ctx.translate(x, y);
              ctx.scale(-1, 1);
              drawGlassShatterFx(ctx, 0, 0, shatterFxStartedAt);
              ctx.restore();
              return;
            }
            drawGlassShatterFx(ctx, x, y, shatterFxStartedAt);
          });
          break;
        }
        case "toilet":
        case "poop": {
          const { x, y, z, flipX } = entity;
          const isStinky = entity.type === "poop";
          const drawIt = (ctx: CanvasRenderingContext2D, shadow = false) => {
            ctx.save();
            if (isStinky) ctx.globalAlpha = 0.4;
            if (flipX) {
              ctx.save();
              ctx.translate(x, y);
              ctx.scale(-1, 1);
              drawToilet(ctx, 0, 0, isStinky, shadow);
              ctx.restore();
            } else {
              drawToilet(ctx, x, y, isStinky, shadow);
            }
            ctx.restore();
          };
          if (!isStinky) submitShadow((ctx) => drawIt(ctx, true));
          Renderer.submit(z, (ctx) => drawIt(ctx));
          break;
        }
        case "plate": {
          const { x, y, index: i, z } = entity;
          Renderer.submit(z, (ctx) => drawCrumbs(ctx, x, y, i));
          break;
        }
      }
    }

    Renderer.flush(ctx);
  });

  // Level counter top-right
  {
    const padding = 16;
    const levelFontSize = Math.min(width, height) * 0.035;
    ctx.save();
    ctx.font = `bold ${levelFontSize}px handwriting`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillText(
      `${state.level + 1} / ${levels.length - 1}`,
      width - padding + 1,
      padding + 1,
    );
    ctx.fillStyle = "white";
    ctx.fillText(
      `${state.level + 1} / ${levels.length - 1}`,
      width - padding,
      padding,
    );
    ctx.restore();
  }

  if (state.undoTextOpacity > 0.01) {
    ctx.globalAlpha = state.undoTextOpacity;
    ctx.font = "bold 48px handwriting";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText("UNDO", width / 2 + 2, height / 2 + 2);
    ctx.fillStyle = "gray";
    ctx.fillText("UNDO", width / 2, height / 2);
    ctx.globalAlpha = 1;
  }

  if (state.winScreen) {
    drawWinScreen(state, ctx, width, height);
  }

  if (state.gameBeatScreen) {
    drawGameBeatScreen(state, ctx, width, height);
  }

  if (state.transitionTime !== null) {
    drawTransition(ctx, width, height);
  }
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  if (state.transitionTime === null) return;
  const covering = state.transitionTime < 0;
  // t goes 0→1 over each phase
  const t = covering
    ? clamp(
        0,
        (state.transitionTime + TRANSITION_COVER_TIME) / TRANSITION_COVER_TIME,
        1,
      )
    : clamp(0, state.transitionTime / TRANSITION_UNCOVER_TIME, 1);

  const cols = Math.ceil(width / BURGER_TILE_SIZE) + 1;
  const rows = Math.ceil(height / BURGER_TILE_SIZE) + 1;
  const maxDist = cols + rows;

  const burgerFrame = 8;
  const srcX = burgerFrame * sheet.frameWidthPx;
  const srcSize = sheet.frameWidthPx;

  const drawSize = BURGER_TILE_SIZE * 2.5;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dist = col + row;
      const delay = dist / maxDist;
      const localT = clamp(0, (t - delay * 0.6) / 0.4, 1);
      if (covering && localT <= 0) continue;

      // cover: scale 0→1, uncover: scale 1→0
      const eased = localT * (2 - localT); // ease out
      const scale = covering ? eased : 1 - eased;
      if (scale <= 0) continue;

      const cx = col * BURGER_TILE_SIZE;
      const cy = row * BURGER_TILE_SIZE;
      const size = drawSize * scale;

      const tiltAmount = covering ? 1 - localT : localT;
      const tilt = (col % 2 === row % 2 ? 1 : -1) * 0.4 * tiltAmount;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.drawImage(
        sheet.image,
        srcX,
        0,
        srcSize,
        srcSize,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      ctx.restore();
    }
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

  const letters = "LEveL CoMpLeTE".split("");
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
    ctx.font = `bold ${fontSize}px handwriting`;
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

    ctx.font = `${statFontSize}px handwriting`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8d8d8";
    ctx.fillText(stat.label, -statFontSize * 0.3, 0);

    ctx.font = `bold ${statFontSize}px handwriting`;
    ctx.textAlign = "left";

    const shadowOff = statFontSize * 0.05;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(stat.value, statFontSize * 0.3 + shadowOff, shadowOff);

    ctx.fillStyle = "white";
    ctx.fillText(stat.value, statFontSize * 0.3, 0);

    ctx.restore();
  }

  if (t > WIN_SCREEN_INPUT_DELAY) {
    const promptAlpha = 0.5 + Math.sin(t * 2.5) * 0.25;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = "white";
    ctx.font = `${statFontSize}px handwriting`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Press any key to continue", width / 2, height * 0.82);
    ctx.globalAlpha = 1;
  }
}

function drawGameBeatScreen(
  state: State,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const t = state.gameBeatScreenTime;
  const minSide = Math.min(width, height);
  const fontSize = minSide * 0.075;

  const overlayAlpha = Math.min(t * 3, 0.6);
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, width, height);

  // "YOU BEAT THE GAME!" title
  const letters = "YOU BEAT THE GAME!".split("");
  const letterSpacing = fontSize * 0.65;
  const totalWidth = letters.length * letterSpacing;
  const startX = width / 2 - totalWidth / 2 + letterSpacing / 2;
  const titleY = height * 0.25;

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i]!;
    const wavePhase = t * 4 - i * 0.4;
    const waveY = Math.sin(wavePhase) * fontSize * 0.15;
    const waveRotation = Math.sin(wavePhase) * 0.15;
    const hue = (t * 120 + i * 20) % 360;

    const letterDelay = i * 0.04;
    const scaleT = clamp(0, (t - letterDelay) * 4, 1);
    const scale =
      scaleT < 1 ? scaleT * (1 + Math.sin(scaleT * Math.PI) * 0.3) : 1;

    const x = startX + i * letterSpacing;
    const y = titleY + waveY;

    ctx.save();
    ctx.font = `bold ${fontSize}px handwriting`;
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

  // Stats
  const stats = [
    { label: "Total Time", value: formatTime(state.gameStats.time) },
    { label: "Total Moves", value: `${state.gameStats.moves}` },
    { label: "Total Undos", value: `${state.gameStats.undos}` },
    { label: "Total Restarts", value: `${state.gameStats.restarts}` },
  ];

  const statFontSize = fontSize * 0.45;
  const statLineHeight = statFontSize * 2;
  const statsStartY = height * 0.42;
  const statsDelay = 0.5;

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i]!;
    const statT = Math.max(0, t - statsDelay - i * 0.1);
    if (statT <= 0) continue;

    const scaleT = Math.min(1, statT * 4);
    const scale =
      scaleT < 1 ? scaleT * (1 + Math.sin(scaleT * Math.PI) * 0.3) : 1;
    const y = statsStartY + i * statLineHeight;

    ctx.save();
    ctx.translate(width / 2, y);
    ctx.scale(scale, scale);

    ctx.font = `${statFontSize}px handwriting`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8d8d8";
    ctx.fillText(stat.label, -statFontSize * 0.3, 0);

    ctx.font = `bold ${statFontSize}px handwriting`;
    ctx.textAlign = "left";

    const shadowOff = statFontSize * 0.05;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(stat.value, statFontSize * 0.3 + shadowOff, shadowOff);

    ctx.fillStyle = "white";
    ctx.fillText(stat.value, statFontSize * 0.3, 0);

    ctx.restore();
  }

  // "Thanks for playing!" message
  const thanksDelay = 1.2;
  const thanksT = Math.max(0, t - thanksDelay);
  if (thanksT > 0) {
    const thanksScale = Math.min(1, thanksT * 4);
    const scale =
      thanksScale < 1
        ? thanksScale * (1 + Math.sin(thanksScale * Math.PI) * 0.3)
        : 1;
    const thanksFontSize = fontSize * 0.55;
    const thanksAlpha = 0.7 + Math.sin(t * 2) * 0.3;

    ctx.save();
    ctx.translate(width / 2, height * 0.78);
    ctx.scale(scale, scale);
    ctx.globalAlpha = thanksAlpha;
    ctx.font = `bold ${thanksFontSize}px handwriting`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const shadowOff = thanksFontSize * 0.05;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillText("Thanks for playing!", shadowOff, shadowOff);

    const thanksHue = (t * 60) % 360;
    ctx.fillStyle = `hsl(${thanksHue}, 80%, 70%)`;
    ctx.fillText("Thanks for playing!", 0, 0);

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ==================== INTRO SCREENS ====================

function drawIntro(
  state: State,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  // sky background
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, "#3a7bb8");
  skyGradient.addColorStop(1, "#6aaccc");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  if (state.gamePhase === "controls") {
    drawControlsTutorial(state, ctx, width, height);
  } else {
    drawTitleScreen(state, ctx, width, height);
  }
}

function drawControlsTutorial(
  state: State,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const minSide = Math.min(width, height);
  const keySize = minSide * 0.11;
  const spacing = keySize * 1.4;
  const cx = width / 2;
  const cy = height * 0.4; // arrow cluster sits a bit above center

  const t = state.elapsedSeconds;

  for (const key of state.tutorialKeys) {
    // fully gone
    if (key.popped && key.popScale < 0.01) continue;

    let scale: number;
    if (key.popped) {
      scale = key.popScale;
    } else {
      // gentle scale pulse
      scale = 1 + Math.sin(t * 1.5 + key.bobPhase) * 0.03;
    }

    // origin position + gentle oscillation around it
    const bobX = Math.sin(t * key.bobSpeedX + key.bobPhase) * key.bobRadiusX;
    const bobY =
      Math.cos(t * key.bobSpeedY + key.bobPhase * 1.3) * key.bobRadiusY;
    const screenX = cx + key.originX * spacing + bobX;
    const screenY = cy + key.originY * spacing + bobY;

    // gentle tilt oscillation
    const tilt = key.popped ? 0 : Math.sin(t * 0.8 + key.bobPhase) * 0.04;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);

    // key background - rounded rect
    const ks = keySize;
    const r = ks * 0.2;
    ctx.beginPath();
    ctx.roundRect(-ks / 2, -ks / 2, ks, ks, r);

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = ks * 0.04;
    ctx.stroke();

    const arrowSprite = tutorialArrowSpriteByKey[key.keys[0]!];
    const iconSize = ks * 1.3;
    if (arrowSprite && sheet.image.complete) {
      drawSheetCellCentered(
        ctx,
        arrowSprite.index,
        arrowSprite.row,
        0,
        0,
        iconSize,
      );
    } else {
      ctx.font = `bold ${ks * 0.5}px handwriting`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText(key.label, 0, 0);
    }

    ctx.restore();
  }
}

function drawTitleScreen(
  state: State,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const minSide = Math.min(width, height);
  const t = state.titleTime;
  const cx = width / 2;

  // Player character in center - animate entrance
  const playerEntranceT = clamp(0, t * 3, 1);
  const playerScale = playerEntranceT * (2 - playerEntranceT); // ease out
  const playerSize = minSide * 0.3;

  if (burgerBoySheet.image.complete) {
    ctx.save();
    ctx.translate(cx, height * 0.42);
    ctx.scale(playerScale, playerScale);
    const wobble = Math.sin(state.elapsedSeconds * 2) * 0.05;
    ctx.rotate(wobble);
    const frameIndex = Math.floor(t / 0.5) % 2;
    drawBurgerBoyFrame(ctx, frameIndex, 0, 0, playerSize);
    ctx.restore();
  }

  // Title text - placeholder
  const titleDelay = 0.2;
  const titleT = clamp(0, (t - titleDelay) * 3, 1);
  if (titleT > 0) {
    const titleFontSize = minSide * 0.09;
    const titleScale = titleT * (2 - titleT);

    const titleText = "BURGER BOY";
    const letters = titleText.split("");
    const letterSpacing = titleFontSize * 0.65;
    const totalWidth = letters.length * letterSpacing;
    const startX = cx - totalWidth / 2 + letterSpacing / 2;
    const titleY = height * 0.15;

    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i]!;
      const letterDelay = i * 0.03;
      const letterT = clamp(0, (titleT - letterDelay) * 3, 1);
      const scale = letterT * (2 - letterT);
      const waveY =
        Math.sin(state.elapsedSeconds * 3 - i * 0.5) * titleFontSize * 0.08;
      const waveRot = Math.sin(state.elapsedSeconds * 3 - i * 0.5) * 0.06;
      const hue = (state.elapsedSeconds * 60 + i * 30) % 360;

      ctx.save();
      ctx.translate(startX + i * letterSpacing, titleY + waveY);
      ctx.rotate(waveRot);
      ctx.scale(scale, scale);

      ctx.font = `bold ${titleFontSize}px handwriting`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // shadow
      const shadowOffset = titleFontSize * 0.06;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillText(letter, shadowOffset, shadowOffset);

      // colorful letter
      ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.fillText(letter, 0, 0);

      ctx.restore();
    }
  }

  // "Press any key to go to town"
  if (t > 0.5) {
    const promptAlpha = 0.5 + Math.sin(state.elapsedSeconds * 2.5) * 0.3;
    ctx.save();
    ctx.globalAlpha = clamp(0, promptAlpha, 1);
    ctx.font = `${minSide * 0.04}px handwriting`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText("Press any key to go to town", cx, height * 0.75);
    ctx.restore();
  }
}
