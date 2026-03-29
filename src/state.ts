import * as Camera from "./camera";

const MAX_ENTITIES = 2056;

export type Entity = {
  type:
    | "none"
    | "player"
    | "wall"
    | "burger"
    | "toilet"
    | "plate"
    | "poop"
    | "floor";
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  goalW: number;
  goalH: number;
  animatedW: number;
  animatedH: number;
  eatProgress: number; // 0..1 where 1 means not currently eating
  flipX: boolean;
  vx: number;
  vy: number;
  z: number; // z-axis for drawing
  squishX: number; // scale multiplier for squash/stretch (1 = normal)
  squishY: number;
};

function createEmptyEntity(index: number): Entity {
  return {
    type: "none",
    index,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    goalW: 0,
    goalH: 0,
    animatedW: 0,
    animatedH: 0,
    eatProgress: 1,
    flipX: false,
    vx: 0,
    vy: 0,
    z: 0,
    squishX: 1,
    squishY: 1,
  };
}

const entities: Entity[] = Array.from({ length: MAX_ENTITIES }).map(
  (entity, i) => createEmptyEntity(i),
) as Entity[];

export function createEntity(entity: Partial<Entity>) {
  const index = entities.findIndex((e) => e.type === "none");
  if (index === -1) throw new Error("probably should double max entities");
  const merged = { ...entities[index]!, ...entity };
  // default goalW/goalH/animatedW/animatedH to match w/h if not explicitly set
  if (entity.goalW === undefined) merged.goalW = merged.w;
  if (entity.goalH === undefined) merged.goalH = merged.h;
  if (entity.animatedW === undefined) merged.animatedW = merged.w;
  if (entity.animatedH === undefined) merged.animatedH = merged.h;
  entities[index] = merged;
}

export function removeEntity(index: number) {
  entities[index] = createEmptyEntity(index);
}

export function clearAllEntities() {
  entities.forEach((entity, index) => {
    if (entity.type !== "none") {
      removeEntity(index);
    }
  });
}

export const state = {
  level: 0,
  entities,
  camera: Camera.create(),
  elapsedSeconds: 0,
  keysDown: [] as string[],
  justPressed: [] as string[],
  justReleased: [] as string[],
  shakeX: 0,
  shakeY: 0,
  undoStack: [] as Entity[][],
  pendingUndoSnapshot: null as Entity[] | null,
  undoTextOpacity: 0,
  winScreen: false,
  winScreenTime: 0,
  levelTime: 0,
  moves: 0,
  undos: 0,
  restarts: 0,
  winStats: { time: 0, moves: 0, undos: 0, restarts: 0 },
  transitionTime: null as number | null, // null=inactive, negative=covering, positive=uncovering
  transitionLevel: null as number | null, // level to switch to at midpoint
};

export type State = typeof state;
