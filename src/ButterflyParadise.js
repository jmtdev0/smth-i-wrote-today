import * as THREE from 'three';
import { seededRandom } from './noise.js';
import { TUNNEL_EXIT_Z } from './TunnelWorld.js';
import { meadowReadiness } from './MeadowArrival.js';
import { createInstancedButterflyBodies } from './InstancedButterflyBodies.js';
import { BUTTERFLY_WHITE_LINE } from './Butterfly.js';
import { NPC_STROKE_WIDTH } from './ButterflyStroke.js';
import { createSkyApparition } from './SkyApparition.js';
import { HEAVEN_SKY } from './WorldAtmosphere.js';
import { createMeadowLife } from './MeadowLife.js';
import { arrangeChoreography, heavenFlightPosition as flightPosition } from './HeavenChoreography.js';
import { meadowHeight, meadowSurfaceHeight } from './MeadowSurface.js';
import { BUTTERFLY_VERTICAL_SPEED } from './flight.js';
import { companionTarget, createFlightHeading, releaseIntoOrbit } from './CompanionFlight.js';
import { createMeadowGrass, createMiddleMeadowGrass, createFarMeadowGrass } from './MeadowGrass.js';
import { createMeadowCanopy } from './MeadowCanopy.js';
import { createHeavenClouds, heavenCloudsGLSL } from './HeavenClouds.js';
import { createHeavenButterflyShadows } from './HeavenButterflyShadows.js';
export { meadowHeight } from './MeadowSurface.js';

export const PARADISE_BUTTERFLY_COUNT = 1400;
export const HEAVEN_FIELD_SIZE = 1600;
export const MEADOW_SIZE = 3200;
const PALETTE = ['#ffbbdc', '#87dcdb', '#ffca72', '#b8a0f0', '#8ebfe9', '#c8e68e', '#f68f9d'];
const NPC_WING_CURVE_SEGMENTS = 24;

function upperWing() {
  const s = new THREE.Shape();
  s.moveTo(.05, .08);
  s.bezierCurveTo(.18, .92, .72, 1.72, 1.5, 1.62);
  s.bezierCurveTo(2.08, 1.54, 2.08, .75, 1.67, .22);
  s.bezierCurveTo(1.25, -.28, .5, -.18, .05, .08);
  return s;
}
function lowerWing() {
  const s = new THREE.Shape();
  s.moveTo(.06, .02);
  s.bezierCurveTo(.5, -.14, 1.35, -.22, 1.55, -.78);
  s.bezierCurveTo(1.78, -1.4, 1.18, -1.73, .68, -1.44);
  s.bezierCurveTo(.22, -1.16, .04, -.5, .06, .02);
  return s;
}

function wingStrokes(side, index, shape) {
  const paths = index === 0 ? [
    [[.08, .08], [.55, .72], [1.5, 1.54]],
    [[.08, .08], [.92, .48], [1.82, .58]],
    [[.08, .08], [.7, .12], [1.62, .18]],
  ] : [
    [[.08, 0], [.72, -.45], [1.5, -.78]],
    [[.08, -.04], [.45, -.88], [.72, -1.4]],
  ];
  const vertices = [];
  // Use the fill's exact polygon for the edge, so the outline cannot detach
  // while flapping. Bake both faces into the existing instanced vein draw.
  const edge = shape.getPoints(NPC_WING_CURVE_SEGMENTS).map(p => new THREE.Vector2(p.x * side, p.y));
  if (edge.at(-1).equals(edge[0])) edge.pop();
  const offsets = edge.map((point, i) => {
    const before = edge[(i + edge.length - 1) % edge.length], after = edge[(i + 1) % edge.length];
    const a = new THREE.Vector2(-(point.y - before.y), point.x - before.x).normalize();
    const b = new THREE.Vector2(-(after.y - point.y), after.x - point.x).normalize();
    const miter = a.clone().add(b).normalize();
    return miter.multiplyScalar(NPC_STROKE_WIDTH * .5 / Math.max(.5, miter.dot(b)));
  });
  for (const z of [.012, -.012]) for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    for (const [j, sign] of [[i, 1], [i, -1], [next, 1], [next, 1], [i, -1], [next, -1]]) {
      vertices.push(edge[j].x + offsets[j].x * sign, edge[j].y + offsets[j].y * sign, z);
    }
  }
  for (const path of paths) {
    const curve = new THREE.QuadraticBezierCurve3(...path.map(([x, y]) => new THREE.Vector3(x * side, y, .012)));
    const points = curve.getPoints(16);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const n = new THREE.Vector3(-(b.y - a.y), b.x - a.x, 0).normalize().multiplyScalar(NPC_STROKE_WIDTH * .5);
      const a1 = a.clone().add(n), a2 = a.clone().sub(n), b1 = b.clone().add(n), b2 = b.clone().sub(n);
      for (const p of [a1, a2, b1, b1, a2, b2]) vertices.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

export function createButterflyParadise(count = PARADISE_BUTTERFLY_COUNT) {
  const group = new THREE.Group();
  group.name = 'Butterfly sanctuary';
  const random = seededRandom(5193);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const candidatePosition = new THREE.Vector3();
  const followTarget = new THREE.Vector3(), desiredVelocity = new THREE.Vector3();
  const flightHeading = createFlightHeading();
  let connectedCount = 0, lastFlightTime = null;
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const veinMaterial = new THREE.MeshBasicMaterial({
    color: BUTTERFLY_WHITE_LINE, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const wings = [];
  for (const side of [-1, 1]) for (const [index, shape] of [upperWing(), lowerWing()].entries()) {
    const geometry = new THREE.ShapeGeometry(shape, NPC_WING_CURVE_SEGMENTS);
    geometry.scale(side, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const veins = new THREE.InstancedMesh(wingStrokes(side, index, shape), veinMaterial, count);
    veins.name = `Heaven ${side < 0 ? 'left' : 'right'} ${index === 0 ? 'upper' : 'lower'} wing outlines and veins`;
    veins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    veins.frustumCulled = false;
    veins.renderOrder = 1;
    group.add(mesh, veins);
    wings.push({ mesh, veins, side, index });
  }
  const { bodies, outlines: bodyOutlines } = createInstancedButterflyBodies(count);
  group.add(bodies, bodyOutlines);
  const npcShadows = createHeavenButterflyShadows([...wings.map(wing => wing.mesh), bodies], count);
  group.add(npcShadows.group);
  const profiles = Array.from({ length: count }, (_, i) => {
    const near = i < 240;
    const profile = {
      x: (random() - .5) * (near ? 100 : HEAVEN_FIELD_SIZE),
      y: (random() - .25) * (near ? 28 : 90),
      z: near ? TUNNEL_EXIT_Z - 35 - random() * 140 : TUNNEL_EXIT_Z - 35 - random() * HEAVEN_FIELD_SIZE,
      phase: random() * Math.PI * 2,
      speed: .13 + random() * .17,
      orbit: 3 + random() * 9,
      scale: near ? .38 + random() * .45 : .25 + random() * .55,
      color: new THREE.Color(PALETTE[i % PALETTE.length]),
      targetColor: new THREE.Color(PALETTE[i % PALETTE.length]),
      connected: false, released: false, slot: -1, followPosition: new THREE.Vector3(), velocity: new THREE.Vector3(),
      replyAt: -Infinity,
    };
    tint.set(PALETTE[i % PALETTE.length]);
    for (const wing of wings) wing.mesh.setColorAt(i, tint);
    bodies.setColorAt(i, tint);
    return profile;
  });

  arrangeChoreography(profiles);
  function freePosition(profile, time, target) {
    flightPosition(profile, time, target);
    if (profile.released) target.y = Math.max(target.y, meadowSurfaceHeight(target.x, target.z) + 2);
    return target;
  }
  const clouds = createHeavenClouds();
  const meadowLife = createMeadowLife(clouds.uniforms);
  const meadow = new THREE.PlaneGeometry(MEADOW_SIZE, MEADOW_SIZE, 160, 160);
  meadow.rotateX(-Math.PI / 2);
  const positions = meadow.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const groundGrid = positions.array.slice();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) + TUNNEL_EXIT_Z - MEADOW_SIZE / 2 - 20;
    positions.setXYZ(i, x, meadowHeight(x, z), z);
    const mix = (.5 + Math.sin(x * .045 + z * .025) * .5) * .6;
    tint.set('#89ab76').lerp(new THREE.Color('#c6d69b'), mix);
    tint.toArray(colors, i * 3);
  }
  meadow.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  meadow.computeVertexNormals();
  const ground = new THREE.Mesh(meadow, meadowLife.material);
  ground.name = 'Endless Heaven meadow';
  ground.receiveShadow = true;
  group.add(ground);
  const canopy = createMeadowCanopy(meadow, meadowLife);
  group.add(canopy.mesh);
  const grass = createMeadowGrass(meadowLife);
  group.add(grass.mesh);
  const middleGrass = createMiddleMeadowGrass(meadowLife);
  group.add(middleGrass.mesh);
  const farGrass = createFarMeadowGrass(meadowLife);
  group.add(farGrass.mesh);

  let lastGroundX = NaN, lastGroundZ = NaN, lastOpenWorld = false;
  const fieldColorA = new THREE.Color('#89ab76'), fieldColorB = new THREE.Color('#c6d69b');
  const wrap = (value, center) => center + THREE.MathUtils.euclideanModulo(value - center + HEAVEN_FIELD_SIZE / 2, HEAVEN_FIELD_SIZE) - HEAVEN_FIELD_SIZE / 2;
  function extendMeadow(player, openWorld) {
    const cx = Math.round(player.x / 200) * 200;
    const cz = openWorld ? Math.round(player.z / 200) * 200
      : Math.min(Math.round(player.z / 200) * 200, TUNNEL_EXIT_Z - MEADOW_SIZE / 2 - 20);
    if (cx === lastGroundX && cz === lastGroundZ && openWorld === lastOpenWorld) return;
    lastGroundX = cx; lastGroundZ = cz; lastOpenWorld = openWorld;
    for (let i = 0; i < positions.count; i++) {
      const x = groundGrid[i * 3] + cx, z = groundGrid[i * 3 + 2] + cz;
      positions.setXYZ(i, x, meadowHeight(x, z), z);
      fieldColorA.set('#89ab76').lerp(fieldColorB, (.5 + Math.sin(x * .045 + z * .025) * .5) * .6);
      fieldColorA.toArray(colors, i * 3);
    }
    positions.needsUpdate = true;
    meadow.attributes.color.needsUpdate = true;
    meadow.computeVertexNormals(); meadow.computeBoundingSphere(); meadow.computeBoundingBox();
  }
  const skyUniforms = {
    ...clouds.uniforms,
    uHorizonColor: { value: new THREE.Color(HEAVEN_SKY.horizon) },
    uZenithColor: { value: new THREE.Color(HEAVEN_SKY.zenith) },
    uImage: { value: null }, uImageOpacity: { value: 0 }, uImageAspect: { value: 1 },
    uVideo: { value: null }, uVideoPrevious: { value: null }, uVideoBlend: { value: 1 }, uVideoOpacity: { value: 0 },
    uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
    uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
    uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
    uTanHalfFov: { value: Math.tan(48 * Math.PI / 360) },
    uAspect: { value: 1 }, uVideoAspect: { value: 16 / 9 },
  };
  const apparition = createSkyApparition();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vDirection; void main() { vDirection = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 vDirection;
    uniform sampler2D uVideo, uVideoPrevious;
    uniform float uVideoBlend;
    uniform sampler2D uImage;
    uniform float uImageOpacity, uImageAspect;
    uniform float uVideoOpacity, uTanHalfFov, uAspect, uVideoAspect;
    uniform vec3 uCameraRight, uCameraUp, uCameraForward;
    uniform vec3 uHorizonColor, uZenithColor;
    ${heavenCloudsGLSL}
    void main() {
      vec3 d = normalize(vDirection);
      // Colors enter in linear space; colorspace_fragment converts once to sRGB.
      vec3 color = mix(uHorizonColor, uZenithColor, smoothstep(-.08, .7, d.y));
      float sunAngle = max(0., dot(d, uSunDirection));
      float sun = pow(sunAngle, 1200.);
      color += vec3(1., .88, .68) * (sun * 1.1 + pow(sunAngle, 24.) * .09);
      color = heavenClouds(color, d);
      float forward = dot(d, uCameraForward);
      if (uVideoOpacity > 0. && forward > 0.) {
        vec2 uv = .5 + .5 * vec2(dot(d, uCameraRight) / uAspect, dot(d, uCameraUp)) / (forward * uTanHalfFov);
        vec2 cover = uAspect > uVideoAspect ? vec2(1., uVideoAspect / uAspect) : vec2(uAspect / uVideoAspect, 1.);
        uv = (uv - .5) * cover + .5;
        vec3 videoColor = pow(texture2D(uVideo, clamp(uv, 0., 1.)).rgb, vec3(2.2));
        if (uVideoBlend < 1.) {
          vec3 previousColor = pow(texture2D(uVideoPrevious, clamp(uv, 0., 1.)).rgb, vec3(2.2));
          videoColor = mix(previousColor, videoColor, uVideoBlend);
        }
        // Keep the central 36% intact, with broad 22%-wide feathering per side.
        // Blend into the sky on both sides, after aspect-ratio cropping, so
        // the mask stays attached to the video on portrait and wide screens.
        float sideSoftness = 1. - smoothstep(.18, .40, abs(uv.x - .5));
        color = mix(color, videoColor, uVideoOpacity * sideSoftness * smoothstep(-.02, .18, d.y));
      }
      if (uImageOpacity > 0. && forward > 0.) {
        vec2 imageUv = .5 + .5 * vec2(dot(d, uCameraRight) / uAspect, dot(d, uCameraUp)) / (forward * uTanHalfFov);
        // Contain rather than crop: keep the square portrait intact on any screen.
        vec2 contain = vec2(max(1., uAspect / uImageAspect), max(1., uImageAspect / uAspect));
        imageUv = (imageUv - .5) * contain / .94 + .5;
        vec2 edge = smoothstep(vec2(0.), vec2(.14), imageUv)
          * (1. - smoothstep(vec2(.86), vec2(1.), imageUv));
        vec3 imageColor = texture2D(uImage, clamp(imageUv, 0., 1.)).rgb;
        color = mix(color, imageColor, uImageOpacity * edge.x * edge.y * smoothstep(.08, .35, d.y));
      }
      gl_FragColor = vec4(color, 1.);
      #include <colorspace_fragment>
    }`,
  }));
  sky.renderOrder = -10;
  sky.name = 'Clear Heaven sky';
  group.add(sky);
  // Rolling terrain surrounds the player; no one-sided backdrop or flower meshes.

  return {
    group,
    profiles,
    get connectedCount() { return connectedCount; },
    get grassReadiness() { return meadowLife.uniforms.uMeadowLife.value; },
    adoptColor(color) {
      for (const profile of profiles) if (profile.connected) profile.targetColor.copy(color);
    },
    releaseAll(time) {
      const released = connectedCount;
      for (const profile of profiles) if (profile.connected) {
        releaseIntoOrbit(profile, time, profile.followPosition);
        profile.connected = false; profile.released = true; profile.slot = -1;
        profile.targetColor.copy(profile.color);
      }
      connectedCount = 0;
      return released;
    },
    pulse(time, position, color, charge = 0) { meadowLife.pulse(time, position, color, charge); },
    reset() { meadowLife.reset(); clouds.reset(); },
    prepareAtmosphere(renderer) { return clouds.prepare(renderer); },
    renderAtmosphere(renderer, frameMilliseconds = 16.7) {
      clouds.observeFrame(frameMilliseconds);
      clouds.render(renderer);
    },
    dispose() { clouds.dispose(); grass.mesh.customDepthMaterial.dispose(); npcShadows.dispose(); },
    get cloudQuality() { return clouds.quality; },
    get npcShadowCount() { return npcShadows.count; },
    setSkyImage(texture, aspect = 1) {
      skyUniforms.uImage.value = texture;
      skyUniforms.uImageAspect.value = aspect;
    },
    setSkyVideo(texture, opacity = .12, aspect = 16 / 9, previousTexture = texture, blend = 1) {
      skyUniforms.uVideo.value = texture;
      skyUniforms.uVideoPrevious.value = previousTexture;
      skyUniforms.uVideoBlend.value = THREE.MathUtils.clamp(blend, 0, 1);
      skyUniforms.uVideoOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1);
      skyUniforms.uVideoAspect.value = aspect;
    },
    chirp(time, position, radius, { recruit = false, slotOffset = 0 } = {}) {
      if (!Number.isFinite(radius) || radius < 0) return null;
      let closest = null, distanceSquared = Infinity, closestWasFree = false;
      const replyPosition = new THREE.Vector3();
      for (const profile of profiles) {
        if (profile.connected) candidatePosition.copy(profile.followPosition);
        else freePosition(profile, time, candidatePosition);
        const distance = candidatePosition.distanceToSquared(position);
        if (distance > radius * radius) continue;
        const wasFree = !profile.connected;
        // Prefer an independent NPC's color over a companion already wearing
        // the group's tint, even if that companion is closer to the player.
        if (!closest || (wasFree && !closestWasFree) || (wasFree === closestWasFree && distance < distanceSquared)) {
          closest = profile;
          distanceSquared = distance;
          closestWasFree = wasFree;
          replyPosition.copy(candidatePosition);
        }
        profile.replyAt = time;
        if (recruit && wasFree) {
          profile.connected = true; profile.slot = slotOffset + connectedCount++;
          profile.followPosition.copy(candidatePosition); profile.velocity.set(0, 0, 0);
        }
      }
      if (!closest) return null;
      return { position: replyPosition, color: closest.color.clone() };
    },
    update(time, cameraQuaternion, player = null, camera = null, openWorld = false, wingbeat = 0, boost = 1) {
      const dt = lastFlightTime === null ? 0 : THREE.MathUtils.clamp(time - lastFlightTime, 0, .1);
      lastFlightTime = time;
      if (player) flightHeading.update(player, dt);
      const readiness = meadowReadiness(player?.z, openWorld);
      const grassEnabled = readiness > 0;
      meadowLife.update(time, grassEnabled, player, wingbeat, readiness);
      clouds.update(time, openWorld, camera);
      if (camera) {
        sky.position.copy(camera.position);
        skyUniforms.uCameraRight.value.set(1, 0, 0).applyQuaternion(cameraQuaternion);
        skyUniforms.uCameraUp.value.set(0, 1, 0).applyQuaternion(cameraQuaternion);
        skyUniforms.uCameraForward.value.set(0, 0, -1).applyQuaternion(cameraQuaternion);
        skyUniforms.uAspect.value = camera.aspect;
        skyUniforms.uTanHalfFov.value = Math.tan(camera.fov * Math.PI / 360);
      }
      if (player) {
        extendMeadow(player, openWorld);
        grass.update(player, grassEnabled, camera, openWorld);
        middleGrass.update(player, grassEnabled, camera, openWorld);
        farGrass.update(player, grassEnabled, camera, openWorld);
        canopy.update(grassEnabled);
      }
      skyUniforms.uImageOpacity.value = apparition.update(time, openWorld,
        skyUniforms.uCameraForward.value.y, !!skyUniforms.uImage.value);
      npcShadows.begin(player, openWorld);
      profiles.forEach((p, i) => {
        if (player && !p.connected) {
          p.x = wrap(p.x, player.x);
          p.z = wrap(p.z, player.z);
          if (!openWorld && p.z + p.orbit > TUNNEL_EXIT_Z - 20) p.z -= HEAVEN_FIELD_SIZE;
        }
        const phase = time * p.speed + p.phase;
        if (p.connected && player) {
          companionTarget(player, flightHeading.direction, p.slot, time, p.phase, followTarget);
          followTarget.y = Math.max(followTarget.y, meadowSurfaceHeight(followTarget.x, followTarget.z) + 2);
          const maxSpeed = BUTTERFLY_VERTICAL_SPEED * boost;
          desiredVelocity.subVectors(followTarget, p.followPosition).multiplyScalar(1.8).clampLength(0, maxSpeed);
          p.velocity.lerp(desiredVelocity, 1 - Math.exp(-dt * 5)).clampLength(0, maxSpeed);
          p.followPosition.addScaledVector(p.velocity, dt);
          dummy.position.copy(p.followPosition);
          p.color.lerp(p.targetColor, 1 - Math.exp(-dt * 4.2));
          for (const wing of wings) wing.mesh.setColorAt(i, p.color);
          bodies.setColorAt(i, p.color);
        } else if (p.connected) dummy.position.copy(p.followPosition);
        else freePosition(p, time, dummy.position);
        const shadowSlot = npcShadows.select(dummy.position);
        const replyAge = time - p.replyAt;
        const reply = replyAge >= 0 && replyAge < 1 ? Math.sin(Math.PI * replyAge) : 0;
        for (let part = 0; part < wings.length; part++) {
          const wing = wings[part];
          dummy.quaternion.copy(cameraQuaternion);
          dummy.rotateZ(Math.sin(phase) * .25);
          dummy.rotateY(wing.side * (.15 + Math.sin(time * (5 + p.speed * 5) + p.phase) * .65 + reply * .35));
          dummy.scale.setScalar(p.scale * (1 + reply * .12));
          dummy.updateMatrix(); wing.mesh.setMatrixAt(i, dummy.matrix);
          wing.veins.setMatrixAt(i, dummy.matrix);
          npcShadows.setMatrix(part, shadowSlot, dummy.matrix);
        }
        dummy.quaternion.copy(cameraQuaternion);
        dummy.rotateZ(Math.sin(phase) * .25);
        dummy.scale.setScalar(p.scale * (1 + reply * .12));
        dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        npcShadows.setMatrix(wings.length, shadowSlot, dummy.matrix);
      });
      npcShadows.end();
      for (const wing of wings) {
        wing.mesh.instanceMatrix.needsUpdate = true;
        wing.veins.instanceMatrix.needsUpdate = true;
        if (connectedCount) wing.mesh.instanceColor.needsUpdate = true;
      }
      bodies.instanceMatrix.needsUpdate = true;
      if (connectedCount) bodies.instanceColor.needsUpdate = true;
    },
  };
}
