import { gamepads } from "@spud.gg/api";
import { draw, update } from "./gameplay";
import { clearAllEntities, createEntity, removeEntity, state } from "./state";
import { resizeCanvasForDpi } from "./helpers";
import { clearInputs } from "./inputs";
import { parseLevel } from "./parser";
import { levels } from "./levels/levels";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

addDebugControl();

const ctx = canvas.getContext("2d", { alpha: false })!;

let lastFrameTime = 0;
let timeToProcessPhysics = 0;

function gameLoop(now: number) {
  const dt = Math.min(now - lastFrameTime, 100); // clamp time delta to 100ms in case the user switched tabs
  lastFrameTime = now;

  resizeCanvasForDpi(ctx);

  {
    timeToProcessPhysics += dt;
    const physicsTickMs = 1000 / 120; // process physics updates at a fixed 120hz time step
    while (timeToProcessPhysics > physicsTickMs) {
      timeToProcessPhysics -= physicsTickMs;
      update(state, physicsTickMs);
      gamepads.clearInputs();
      clearInputs();
    }
  }

  draw(state, ctx);
  requestAnimationFrame(gameLoop); // queue up the next tick
}

requestAnimationFrame(gameLoop);

function addDebugControl() {
  const textarea = document.createElement("textarea");
  textarea.value = levels[0]!;
  const updateLevel = () => {
    const level = textarea.value;
    if (level) {
      const parsed = parseLevel(level.trim());
      clearAllEntities();
      for (const { entity, x, y } of parsed.entities) {
        createEntity({ type: entity, x, y, w: 1, h: 1 });
      }
    }
  };

  textarea.onkeydown = (e) => e.stopPropagation();
  textarea.onblur = updateLevel;

  textarea.style = `
    position: fixed;
    top: 10px;
    left: 10px;
  `;
  document.body.appendChild(textarea);
}
