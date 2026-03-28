import { Button, gamepads, Motion } from "@spud.gg/api";
import { state } from "./state";

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  state.keysDown.push(e.key);
  state.justPressed.push(e.key);
});

window.addEventListener("keyup", (e) => {
  state.keysDown = state.keysDown.filter((k) => k !== e.key);
  state.justReleased.push(e.key);
});

export function clearInputs() {
  state.justPressed = [];
  state.justReleased = [];
}

export const justMoved = {
  left() {
    return (
      state.justPressed.includes("ArrowLeft") ||
      state.justPressed.includes("a") ||
      gamepads.singlePlayer.buttonJustPressed(Button.DpadLeft) ||
      gamepads.singlePlayer.leftStick.motion().direction.x === Motion.Left
    );
  },
  right() {
    return (
      state.justPressed.includes("ArrowRight") ||
      state.justPressed.includes("d") ||
      gamepads.singlePlayer.buttonJustPressed(Button.DpadRight) ||
      gamepads.singlePlayer.leftStick.motion().direction.x === Motion.Right
    );
  },
  up() {
    return (
      state.justPressed.includes("ArrowUp") ||
      state.justPressed.includes("w") ||
      gamepads.singlePlayer.buttonJustPressed(Button.DpadUp) ||
      gamepads.singlePlayer.leftStick.motion().direction.y === Motion.Up
    );
  },
  down() {
    return (
      state.justPressed.includes("ArrowDown") ||
      state.justPressed.includes("s") ||
      gamepads.singlePlayer.buttonJustPressed(Button.DpadDown) ||
      gamepads.singlePlayer.leftStick.motion().direction.y === Motion.Down
    );
  },
};

export function justPressedRestart() {
  const redoKey = "r";
  return (
    state.justPressed.includes(redoKey) ||
    gamepads.singlePlayer.buttonJustPressed(Button.North) // "Y" button
  );
}

export function justPressedSelect() {
  return (
    state.justPressed.includes("Enter") ||
    state.justPressed.includes(" ") ||
    gamepads.singlePlayer.buttonJustPressed(Button.South) // "A" button
  );
}
