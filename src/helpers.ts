/*
  by default, canvas rendering is blurry on high-dpi screens.
  this fixes it by scaling the pixel buffer by the devicePixelRatio
  and then setting a matching transform so that the drawing coords
  can stay in CSS pixels.

  see also: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
*/
export function resizeCanvasForDpi(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas.getBoundingClientRect();
  ctx.canvas.width = width * window.devicePixelRatio;
  ctx.canvas.height = height * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
