// All NPC strokes use the same width in butterfly-local units. Native body
// lines represent subpixel widths with coverage; antenna ribbons can shrink.
export const NPC_STROKE_WIDTH = .018;

export const butterflyStrokeWidthGLSL = `
  float butterflyStrokePixels(mat4 transform, vec3 point, vec3 tangent, vec2 viewport) {
    vec3 perpendicular = normalize(vec3(-tangent.y, tangent.x, 0.));
    vec4 center = transform * vec4(point, 1.);
    vec4 along = transform * vec4(point + tangent * .05, 1.);
    vec4 edge = transform * vec4(point + perpendicular * ${NPC_STROKE_WIDTH}, 1.);
    vec2 centerNdc = center.xy / max(abs(center.w), .0001);
    vec2 direction = (along.xy / max(abs(along.w), .0001) - centerNdc) * viewport;
    vec2 normal = vec2(-direction.y, direction.x) / max(length(direction), .0001);
    vec2 width = (edge.xy / max(abs(edge.w), .0001) - centerNdc) * viewport * .5;
    return abs(dot(width, normal));
  }
`;

// Viewport dimensions are physical pixels, also for DPR and offscreen renders.
// Query the native line limit once per context, never per butterfly/frame.
const nativeWidthRanges = new WeakMap();
export function updateButterflyStrokeViewport(renderer, uniforms, viewport, widthScale = 1) {
  renderer.getCurrentViewport(viewport);
  const gl = renderer.getContext();
  if (!nativeWidthRanges.has(gl)) nativeWidthRanges.set(gl, gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE));
  const [minimum, maximum] = nativeWidthRanges.get(gl);
  uniforms.uLineWidth.value = Math.min(maximum, Math.max(minimum, renderer.getPixelRatio())) * widthScale;
  uniforms.uViewport.value.set(Math.max(1, viewport.z), Math.max(1, viewport.w));
}
