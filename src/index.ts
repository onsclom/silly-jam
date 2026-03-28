import { gamepads } from "@spud.gg/api";
import { draw, update } from "./gameplay";
import { createEntity, removeEntity, state } from "./state";
import { resizeCanvasForDpi } from "./helpers";
import { clearInputs } from "./inputs";
import { parseLevel } from "./parser";

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
  const levelPromptButton = document.createElement("button");
  levelPromptButton.textContent = "Paste a level";
  levelPromptButton.addEventListener("click", () => {
    const level = prompt("Level?");
    if (level) {
      const parsed = parseLevel(level.trim());
      state.entities.forEach((_entity, i) => removeEntity(i));
      for (const { entity, x, y } of parsed.entities) {
        createEntity({ type: entity, x, y, w: 1, h: 1 });
      }
    }
  });
  levelPromptButton.style = `
    position: fixed;
    top: 10px;
    left: 10px;
  `;
  document.body.appendChild(levelPromptButton);
}
