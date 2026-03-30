import { gamepads } from "@spud.gg/api";
import { parseLevel } from "./parser";
import { levels } from "./levels/levels";
import {
  ENTITY_DRAW_FNS,
  bakeStaticLayer,
  drawBakedFloorLayer,
  drawBakedWallLayer,
  drawBakedWallShadowLayer,
} from "./sprite";
import { clearAllEntities, createEntity, state } from "./state";
import { draw, rebuildLevelFromText, update } from "./gameplay";
import * as Camera from "./camera";
import * as Renderer from "./renderer";
import { resizeCanvasForDpi } from "./helpers";
import { clearInputs } from "./inputs";

type Tool = "@" | "#" | "b" | "t" | "T" | "g" | " ";

const TOOL_LABELS: Record<Tool, string> = {
  "@": "Player",
  "#": "Wall",
  b: "Burger",
  t: "Toilet L",
  T: "Toilet R",
  g: "Glass",
  " ": "Eraser",
};

const GRID_DEFAULT_W = 19;
const GRID_DEFAULT_H = 11;
const SHADOW_OFFSET = 0.12;

let grid: string[][] = [];
let gridW = GRID_DEFAULT_W;
let gridH = GRID_DEFAULT_H;
let currentTool: Tool = "#";
let currentLevelIndex = 0;
let isPainting = false;
let lastPaintX = -1;
let lastPaintY = -1;
let isPlaying = false;

function initGrid(w: number, h: number): string[][] {
  const g: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      row.push(" ");
    }
    g.push(row);
  }
  return g;
}

function gridToText(): string {
  return grid.map((row) => row.join("")).join("\n");
}

function loadLevelToGrid(levelText: string) {
  const lines = levelText.split("\n");
  gridH = lines.length;
  gridW = Math.max(...lines.map((l) => l.length));
  grid = initGrid(gridW, gridH);
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y]!.length; x++) {
      grid[y]![x] = lines[y]![x]!;
    }
  }
}

function rebuildPreview() {
  const text = gridToText();
  const parsed = parseLevel(text);
  clearAllEntities();

  const walls = new Set<string>();
  let playerStart: { x: number; y: number } | null = null;
  for (const { entity, x, y } of parsed.entities) {
    if (entity === "wall") walls.add(`${x},${y}`);
    if (entity === "player") playerStart = { x, y };
  }
  if (playerStart) {
    const visited = new Set<string>();
    const queue = [playerStart];
    visited.add(`${playerStart.x},${playerStart.y}`);
    while (queue.length > 0 && visited.size < 500) {
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
  for (const key of walls) {
    const [wx, wy] = key.split(",").map(Number);
    createEntity({ type: "floor", x: wx!, y: wy!, w: 1, h: 1, z: -1 });
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
  bakeStaticLayer(state.entities, SHADOW_OFFSET);
}

function setCell(x: number, y: number, tool: Tool) {
  if (x < 0 || x >= gridW || y < 0 || y >= gridH) return;

  if (tool === "@") {
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        if (grid[gy]![gx] === "@") grid[gy]![gx] = " ";
      }
    }
  }

  grid[y]![x] = tool;
  rebuildPreview();
}

export function startEditor(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: false })!;

  // Build UI
  const uiContainer = document.createElement("div");
  uiContainer.id = "editor-ui";
  uiContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 12px;
    background: rgba(0,0,0,0.85);
    color: white;
    font-family: monospace;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 100;
    flex-wrap: wrap;
  `;
  document.body.appendChild(uiContainer);

  // Level selector
  const levelSelect = document.createElement("select");
  levelSelect.style.cssText =
    "font-family: monospace; font-size: 13px; padding: 2px 4px;";
  const newOpt = document.createElement("option");
  newOpt.value = "new";
  newOpt.textContent = "New Level";
  levelSelect.appendChild(newOpt);
  for (let i = 0; i < levels.length; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Level ${i + 1}`;
    levelSelect.appendChild(opt);
  }
  levelSelect.onchange = () => {
    if (levelSelect.value === "new") {
      grid = initGrid(GRID_DEFAULT_W, GRID_DEFAULT_H);
      gridW = GRID_DEFAULT_W;
      gridH = GRID_DEFAULT_H;
    } else {
      currentLevelIndex = Number(levelSelect.value);
      loadLevelToGrid(levels[currentLevelIndex]!);
    }
    rebuildPreview();
  };
  uiContainer.appendChild(levelSelect);

  // Separator
  function addSep() {
    const sep = document.createElement("span");
    sep.textContent = "|";
    sep.style.opacity = "0.4";
    sep.classList.add("editor-only");
    uiContainer.appendChild(sep);
  }

  addSep();

  // Tool buttons
  const tools: Tool[] = ["#", "@", "b", "t", "T", "g", " "];
  const toolButtons: HTMLButtonElement[] = [];

  for (const tool of tools) {
    const btn = document.createElement("button");
    btn.textContent = TOOL_LABELS[tool];
    btn.dataset["tool"] = tool;
    btn.classList.add("editor-only");
    btn.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      padding: 4px 8px;
      cursor: pointer;
      border: 2px solid transparent;
      border-radius: 4px;
      background: #444;
      color: white;
    `;
    btn.onclick = () => {
      currentTool = tool;
      updateToolHighlight();
    };
    uiContainer.appendChild(btn);
    toolButtons.push(btn);
  }

  function updateToolHighlight() {
    for (const btn of toolButtons) {
      const isActive = btn.dataset["tool"] === currentTool;
      btn.style.borderColor = isActive ? "#ffcc00" : "transparent";
      btn.style.background = isActive ? "#665500" : "#444";
    }
  }
  updateToolHighlight();

  addSep();

  // Resize buttons
  function makeResizeBtn(label: string, action: () => void) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.classList.add("editor-only");
    btn.style.cssText =
      "font-family: monospace; font-size: 12px; padding: 4px 8px; cursor: pointer; border: 1px solid #666; border-radius: 4px; background: #333; color: white;";
    btn.onclick = action;
    uiContainer.appendChild(btn);
  }

  makeResizeBtn("W+", () => {
    gridW++;
    for (const row of grid) row.push(" ");
    rebuildPreview();
  });
  makeResizeBtn("W-", () => {
    if (gridW <= 3) return;
    gridW--;
    for (const row of grid) row.pop();
    rebuildPreview();
  });
  makeResizeBtn("H+", () => {
    gridH++;
    grid.push(Array(gridW).fill(" "));
    rebuildPreview();
  });
  makeResizeBtn("H-", () => {
    if (gridH <= 3) return;
    gridH--;
    grid.pop();
    rebuildPreview();
  });

  addSep();

  // Copy button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy Level Text";
  copyBtn.classList.add("editor-only");
  copyBtn.style.cssText =
    "font-family: monospace; font-size: 12px; padding: 4px 8px; cursor: pointer; border: 1px solid #666; border-radius: 4px; background: #335; color: white;";
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(gridToText());
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy Level Text"), 1500);
  };
  uiContainer.appendChild(copyBtn);

  // Play/Edit toggle button
  const playBtn = document.createElement("button");
  playBtn.textContent = "Play";
  playBtn.style.cssText =
    "font-family: monospace; font-size: 13px; font-weight: bold; padding: 4px 14px; cursor: pointer; border: 2px solid #4a4; border-radius: 4px; background: #2a5a2a; color: #8f8; margin-left: auto;";
  playBtn.onclick = () => togglePlay();
  uiContainer.appendChild(playBtn);

  // Size label
  const sizeLabel = document.createElement("span");
  sizeLabel.classList.add("editor-only");
  sizeLabel.style.cssText = "opacity: 0.6;";
  uiContainer.appendChild(sizeLabel);

  // Load first level
  loadLevelToGrid(levels[0]!);
  levelSelect.value = "0";
  rebuildPreview();

  // Camera for editor
  const editorCamera = Camera.create();

  // --- Play mode state ---
  let playLastFrameTime = 0;
  let playTimeToProcess = 0;

  function enterPlay() {
    isPlaying = true;
    // Set up game state to play the current editor level
    state.gamePhase = "gameplay";
    state.winScreen = false;
    state.winScreenTime = 0;
    state.gameBeatScreen = false;
    state.gameBeatScreenTime = 0;
    state.transitionTime = null;
    state.transitionLevel = null;
    state.undoStack = [];
    state.pendingUndoSnapshot = null;
    state.levelTime = 0;
    state.moves = 0;
    state.undos = 0;
    state.restarts = 0;
    rebuildLevelFromText(gridToText().trim(), false);
    playLastFrameTime = 0;
    playTimeToProcess = 0;
    updatePlayUI();
  }

  function exitPlay() {
    isPlaying = false;
    rebuildPreview();
    updatePlayUI();
  }

  function togglePlay() {
    if (isPlaying) {
      exitPlay();
    } else {
      enterPlay();
    }
  }

  function updatePlayUI() {
    // Toggle visibility of editor-only elements
    const editorOnlyEls = uiContainer.querySelectorAll(".editor-only");
    for (const el of editorOnlyEls) {
      (el as HTMLElement).style.display = isPlaying ? "none" : "";
    }
    levelSelect.style.display = isPlaying ? "none" : "";

    if (isPlaying) {
      playBtn.textContent = "Edit";
      playBtn.style.borderColor = "#aa6622";
      playBtn.style.background = "#5a3a1a";
      playBtn.style.color = "#fc8";
    } else {
      playBtn.textContent = "Play";
      playBtn.style.borderColor = "#4a4";
      playBtn.style.background = "#2a5a2a";
      playBtn.style.color = "#8f8";
    }
  }

  // Mouse -> grid coord
  function mouseToGrid(e: MouseEvent): { gx: number; gy: number } | null {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = Camera.screenToWorld(mx, my, rect, editorCamera);
    const gx = Math.round(world.x);
    const gy = Math.round(world.y);
    if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return null;
    return { gx, gy };
  }

  canvas.addEventListener("mousedown", (e) => {
    if (isPlaying) return;
    const pos = mouseToGrid(e);
    if (!pos) return;
    isPainting = true;
    lastPaintX = pos.gx;
    lastPaintY = pos.gy;
    setCell(pos.gx, pos.gy, currentTool);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isPlaying) return;
    if (!isPainting) return;
    const pos = mouseToGrid(e);
    if (!pos) return;
    if (pos.gx === lastPaintX && pos.gy === lastPaintY) return;
    lastPaintX = pos.gx;
    lastPaintY = pos.gy;
    setCell(pos.gx, pos.gy, currentTool);
  });

  window.addEventListener("mouseup", () => {
    isPainting = false;
    lastPaintX = -1;
    lastPaintY = -1;
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (isPlaying) {
      // Escape exits play mode
      if (e.key === "Escape") {
        exitPlay();
        e.preventDefault();
      }
      return;
    }
    const toolByKey: Record<string, Tool> = {
      "1": "#",
      "2": "@",
      "3": "b",
      "4": "t",
      "5": "T",
      "6": "g",
      "7": " ",
    };
    if (toolByKey[e.key]) {
      currentTool = toolByKey[e.key]!;
      updateToolHighlight();
    }
  });

  // Unified render loop
  function loop(now: number) {
    resizeCanvasForDpi(ctx);

    if (isPlaying) {
      if (playLastFrameTime === 0) playLastFrameTime = now;
      const dt = Math.min(now - playLastFrameTime, 100);
      playLastFrameTime = now;

      playTimeToProcess += dt;
      const physicsTickMs = 1000 / 500;
      while (playTimeToProcess > physicsTickMs) {
        playTimeToProcess -= physicsTickMs;
        update(state, physicsTickMs);
        gamepads.clearInputs();
        clearInputs();
      }

      draw(state, ctx);
    } else {
      const { width, height } = canvas.getBoundingClientRect();

      const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
      skyGradient.addColorStop(0, "#3a7bb8");
      skyGradient.addColorStop(1, "#6aaccc");
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, width, height);

      const margin = 2;
      editorCamera.x = (gridW - 1) / 2;
      editorCamera.y = (gridH - 1) / 2;
      editorCamera.zoom = Camera.aspectFitZoom(
        canvas.getBoundingClientRect(),
        gridW + margin * 2,
        gridH + margin * 2 + 2,
      );
      editorCamera.y -= 0.8;

      Camera.drawWithCamera(ctx, editorCamera, (ctx) => {
        Renderer.submit(-1, (ctx) => drawBakedFloorLayer(ctx));
        Renderer.submit(0, (ctx) => drawBakedWallLayer(ctx));
        Renderer.submit(-0.5, (ctx) => drawBakedWallShadowLayer(ctx));

        for (const entity of state.entities) {
          if (
            entity.type === "none" ||
            entity.type === "floor" ||
            entity.type === "wall"
          )
            continue;

          if (entity.type === "player") {
            const { x, y, z } = entity;
            Renderer.submit(z, (ctx) => {
              ctx.save();
              ctx.fillStyle = "#ff6644";
              ctx.beginPath();
              ctx.arc(x, y, 0.35, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "white";
              ctx.font = "0.35px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("@", x, y + 0.05);
              ctx.restore();
            });
          } else {
            const drawFn = ENTITY_DRAW_FNS[entity.type];
            if (drawFn) {
              const e = entity;
              Renderer.submit(e.z, (ctx) => drawFn(ctx, e));
            }
          }
        }

        // Grid overlay
        Renderer.submit(100, (ctx) => {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 0.02;
          for (let x = 0; x < gridW; x++) {
            for (let y = 0; y < gridH; y++) {
              ctx.strokeRect(x - 0.5, y - 0.5, 1, 1);
            }
          }
          ctx.restore();
        });

        Renderer.flush(ctx);
      });

      sizeLabel.textContent = `${gridW} x ${gridH}`;
      state.elapsedSeconds += 1 / 60;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
