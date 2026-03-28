import { State, createEntity, removeEntity } from "./state";
import { chompSound, sfx } from "./audio";
import { justMoved } from "./inputs";
import * as Camera from "./camera";
import { isColliding } from "./util";
import { parseLevel } from "./parser";

// seb level
// export const level = `
// ###############
// ############  #
// #####b    #t  #
// ##### #       #
// ##### #       #
// ## ## #########
// #b    #b   ####
// ## #    b    ##
// ## #          #
// ## #@        t#
// ##  ###       #
// ##    b       #
// ##            #
// ##            #
// ##            #
// ##          ###
// ###############`.trim();

// tutorial 2
// export const level = `
// ###################
// ##                #
// ##                #
// ##                #
// ##                #
// ##   @            #
// ###################
// `.trim();

// // tutorial 1
export const level = `
###################
#b               b#
##                #
##    t#          #
################# #
#@                #
###################
`.trim();

// austin level
// export const level = `
// ######################
// ### t #### t##       #
// ##  @ ##    ## ## ## #
// #              ## ## #
// ####        ## ##   b#
// ### ###     ## ###  b#
// ##        # ## ###  t#
// ##        #### #######
// ##     #b ####  #   ##
// ##b #     ###       ##
// ###       ###  b  t ##
// ### #   #######     ##
// ######################
// `.trim();

const parsed = parseLevel(level);
for (const { entity, x, y } of parsed.entities) {
  createEntity({ type: entity, x, y, w: 1, h: 1 });
}

export function update(state: State, dt: number) {
  const players = state.entities.filter((e) => e.type === "player");
  const walls = state.entities.filter((e) => e.type === "wall");
  const burgers = state.entities.filter((e) => e.type === "burger");
  const toilets = state.entities.filter((e) => e.type === "toilet");

  const isEveryPlayerDoneMoving = players.every(
    (p) => p.vx === 0 && p.vy === 0,
  );

  // handle movement inputs
  for (const player of players) {
    if (isEveryPlayerDoneMoving) {
      if (justMoved.left()) {
        player.vx = -1;
      } else if (justMoved.right()) {
        player.vx = 1;
      } else if (justMoved.up()) {
        player.vy = -1;
      } else if (justMoved.down()) {
        player.vy = 1;
      }
    }
  }

  for (const entity of state.entities) {
    const movementSpeed = 10;
    entity.x += (entity.vx * movementSpeed * dt) / 1000;
    entity.y += (entity.vy * movementSpeed * dt) / 1000;

    if (entity.type === "player") {
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
              if (entity.vx > 0) entity.vx = 0;
            } else {
              entity.x = wRight + entity.w / 2;
              if (entity.vx < 0) entity.vx = 0;
            }
          };

          const resolveY = () => {
            if (overlapTop < overlapBottom) {
              entity.y = wTop - entity.h / 2;
              if (entity.vy > 0) entity.vy = 0;
            } else {
              entity.y = wBottom + entity.h / 2;
              if (entity.vy < 0) entity.vy = 0;
            }
          };

          if (minOverlapX < minOverlapY) {
            resolveX();
          } else if (minOverlapY < minOverlapX) {
            resolveY();
          } else {
            // tie: resolve based on velocity
            if (entity.vx !== 0) {
              resolveX();
            } else {
              resolveY();
            }
          }
          break;
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
          chompSound();
          removeEntity(burger.index);
          entity.goalW += burgerSizeChangeAmount;
          entity.goalH += burgerSizeChangeAmount;
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
    }
  }

  state.elapsedSeconds += dt / 1000;
}

export function draw(state: State, ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas.getBoundingClientRect();
  const center = {
    x: width / 2,
    y: height / 2,
  };

  ctx.fillStyle = "#0b0d1a";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 0.02;

  const gameArea = {
    width: parsed.level.width,
    height: parsed.level.height,
  };
  state.camera.x = (parsed.level.width - 1) / 2;
  state.camera.y = (parsed.level.height - 1) / 2;
  state.camera.zoom = Camera.aspectFitZoom(
    ctx.canvas.getBoundingClientRect(),
    gameArea.width,
    gameArea.height,
  );

  Camera.drawWithCamera(ctx, state.camera, (ctx) => {
    // lets draw a rect around the game area
    ctx.strokeStyle = "red";
    ctx.strokeRect(-0.5, -0.5, parsed.level.width, parsed.level.height);

    ctx.strokeStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "1px sans-serif";

    for (const entity of state.entities) {
      if (entity.type !== "none") {
        ctx.strokeRect(
          entity.x - entity.w / 2,
          entity.y - entity.h / 2,
          entity.w,
          entity.h,
        );
      }

      const debugEmojis = {
        player: "👤",
        wall: "🧱",
        burger: "🍔",
        toilet: "🚽",
      };
      const emoji = debugEmojis[entity.type as keyof typeof debugEmojis];
      if (emoji) {
        ctx.fillText(emoji, entity.x, entity.y);
      }
    }
  });
}
