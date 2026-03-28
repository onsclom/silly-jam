import * as Camera from "./camera";

const MAX_ENTITIES = 512;

export type Entity = {
  type: "none" | "player" | "wall" | "burger" | "toilet" | "plate" | "poop";
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  goalW: number;
  goalH: number;
  vx: number;
  vy: number;
  z: number; // z-axis for drawing
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
    vx: 0,
    vy: 0,
    z: 0,
  };
}

const entities: Entity[] = Array.from({ length: MAX_ENTITIES }).map(
  (entity, i) => createEmptyEntity(i),
) as Entity[];

export function createEntity(entity: Partial<Entity>) {
  const index = entities.findIndex((e) => e.type === "none");
  if (index === -1) throw new Error("probably should double max entities");
  const merged = { ...entities[index]!, ...entity };
  // default goalW/goalH to match w/h if not explicitly set
  if (entity.goalW === undefined) merged.goalW = merged.w;
  if (entity.goalH === undefined) merged.goalH = merged.h;
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
};

export type State = typeof state;
