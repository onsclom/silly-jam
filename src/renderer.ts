type RenderEntry = {
  z: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
};

const renderList: RenderEntry[] = [];

export function submit(
  z: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  renderList.push({ z, draw });
}

export function flush(ctx: CanvasRenderingContext2D) {
  renderList.sort((a, b) => a.z - b.z);
  for (const entry of renderList) {
    entry.draw(ctx);
  }
  renderList.length = 0;
}
