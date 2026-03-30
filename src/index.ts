import { gamepads } from "@spud.gg/api";
import { draw, rebuildLevelFromText, update } from "./gameplay";
import { state } from "./state";
import { resizeCanvasForDpi } from "./helpers";
import { clearInputs } from "./inputs";
import { levels } from "./levels/levels";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d", { alpha: false })!;

if (import.meta.env.DEV || window.location.hash === "#debug") {
  addDebugControl();
}

let lastFrameTime = 0;
let timeToProcessPhysics = 0;

function gameLoop(now: number) {
  const dt = Math.min(now - lastFrameTime, 100); // clamp time delta to 100ms in case the user switched tabs
  lastFrameTime = now;

  resizeCanvasForDpi(ctx);

  {
    timeToProcessPhysics += dt;
    const physicsTickMs = 1000 / 500; // need to allow fast movement speed without glitches
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
      const isLastLevel = state.level === levels.length - 1;
      rebuildLevelFromText(level.trim(), isLastLevel);
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
