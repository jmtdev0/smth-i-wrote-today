import * as THREE from 'three';

export const BUTTERFLY_WHITE_FILL = '#ffffff';
export const BUTTERFLY_WHITE_LINE = '#dedede';
export const BUTTERFLY_WHITE_BODY = '#ffffff';

const WING_CURVE_SEGMENTS = 72;
const WING_LOWER_LAYER_DEPTH = 0.015;
const WING_LINE_LIFT = 0.004;

const WHITE_COLORS = Object.freeze({
  fill: new THREE.Color(BUTTERFLY_WHITE_FILL),
  line: new THREE.Color(BUTTERFLY_WHITE_LINE),
  body: new THREE.Color(BUTTERFLY_WHITE_BODY),
});

function cloneMaterials(group) {
  const clones = new Map();
  group.traverse(object => {
    if (!object.material) return;
    const clone = material => {
      if (!clones.has(material)) clones.set(material, material.clone());
      return clones.get(material);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material);
  });
}

function collectVisualEntries(group) {
  const entries = [];
  const seen = new Set();
  group.traverse(object => {
    const role = object.userData?.visualRole;
    if (!role || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      entries.push({
        role,
        material,
        initialColor: material.color?.clone(),
        initialEmissive: material.emissive?.clone(),
        initialEmissiveIntensity: material.emissiveIntensity ?? 0,
        initialOpacity: material.opacity ?? 1,
        initialToneMapped: material.toneMapped,
      });
    }
  });
  return entries;
}

function capsuleContourPoints(radius, length, depth, segments = 32) {
  const halfLength = length * .5;
  const points = [];
  for (let index = 0; index <= segments; index++) {
    const angle = Math.PI * index / segments;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      halfLength + Math.sin(angle) * radius,
      depth,
    ));
  }
  for (let index = 0; index <= segments; index++) {
    const angle = Math.PI + Math.PI * index / segments;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      -halfLength + Math.sin(angle) * radius,
      depth,
    ));
  }
  return points;
}

function circularContourPoints(radius, depth, segments = 64) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = Math.PI * 2 * index / segments;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, depth);
  });
}

function addFrontAndBackContours(part, pointsAtDepth, material) {
  for (const [side, label] of [[1, 'front'], [-1, 'back']]) {
    const points = pointsAtDepth(side * WING_LINE_LIFT);
    const contour = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
    contour.name = `${part.name} ${label} contour`;
    contour.userData.visualRole = 'line';
    contour.renderOrder = 1;
    part.add(contour);
  }
}

function createButterflyController(group, wingGroups, initialWhiteness = 0, alwaysWhite = false, animationParts = {}) {
  const { body = null, head = null, headPivot = null, chargeCore = null } = animationParts;
  const visualEntries = collectVisualEntries(group);
  let whiteness = 0;
  let targetChirpCharge = 0;
  let chirpCharge = 0;
  let lastUpdateTime = null;
  let releaseStart = -Infinity;
  let releaseStrength = 0;
  let hasAdoptedColor = false;
  let wingbeatStrength = 0;
  const adoptedTint = new THREE.Color('#ffffff');
  const targetTint = new THREE.Color('#ffffff');

  const setChirpCharge = value => {
    targetChirpCharge = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
  };

  const releaseChirp = (time, charge = 0) => {
    targetChirpCharge = 0;
    releaseStart = Number.isFinite(time) ? time : 0;
    releaseStrength = 0.22 + 0.78 * THREE.MathUtils.clamp(Number.isFinite(charge) ? charge : 0, 0, 1);
  };

  const setWhiteness = value => {
    whiteness = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    for (const entry of visualEntries) {
      const { material, role } = entry;
      if (entry.initialColor && material.color) {
        if (alwaysWhite) material.color.set(role === 'line' ? '#dedede' : '#ffffff');
        else material.color.copy(entry.initialColor).lerp(WHITE_COLORS[role], whiteness);
      }
      if (entry.initialEmissive && material.emissive) {
        material.emissive.copy(entry.initialEmissive).lerp(WHITE_COLORS[role], whiteness);
        const targetIntensity = role === 'fill' ? .58 : role === 'body' ? .68 : entry.initialEmissiveIntensity;
        material.emissiveIntensity = THREE.MathUtils.lerp(
          entry.initialEmissiveIntensity,
          targetIntensity,
          whiteness,
        );
      }
      if (!alwaysWhite) {
        if (role === 'fill') material.opacity = THREE.MathUtils.lerp(entry.initialOpacity, .9, whiteness);
        if (role === 'line') material.opacity = THREE.MathUtils.lerp(entry.initialOpacity, 1, whiteness);
        if (whiteness >= .999) material.toneMapped = false;
        else material.toneMapped = entry.initialToneMapped;
      }
    }
  };

  const controller = {
    group,
    get whiteness() { return whiteness; },
    get wingbeatStrength() { return wingbeatStrength; },
    setWhiteness,
    // Apply after setWhiteness, so tint never compounds between frames.
    setTint(color) {
      for (const { material, role } of visualEntries) {
        if (role !== 'line' && material.color) material.color.multiply(color);
      }
    },
    adoptColor(color) {
      hasAdoptedColor = true;
      targetTint.copy(color);
    },
    resetTint() {
      hasAdoptedColor = false;
      adoptedTint.set('#ffffff'); targetTint.set('#ffffff');
      setWhiteness(whiteness);
    },
    // Applied after setWhiteness each frame; illumination never accumulates.
    setIllumination(level, glow = 0, glowColor = null) {
      for (const { material } of visualEntries) {
        if (material.color) material.color.multiplyScalar(level);
        if (material.emissive) {
          if (glowColor) material.emissive.copy(glowColor);
          else material.emissive.set('#ffffff');
          material.emissiveIntensity = glow;
        }
      }
    },
    setChirpCharge,
    releaseChirp,
    update(time, moving) {
      const dt = lastUpdateTime === null ? 0 : THREE.MathUtils.clamp(time - lastUpdateTime, 0, .05);
      lastUpdateTime = time;
      if (hasAdoptedColor) {
        adoptedTint.lerp(targetTint, 1 - Math.exp(-dt * 4.2));
        setWhiteness(whiteness);
        controller.setTint(adoptedTint);
      }
      chirpCharge = THREE.MathUtils.damp(
        chirpCharge,
        targetChirpCharge,
        targetChirpCharge > chirpCharge ? 10 : 7,
        dt,
      );
      const releaseAge = time - releaseStart;
      const release = releaseAge >= 0 && releaseAge < .42
        ? Math.exp(-releaseAge * 8) * releaseStrength
        : 0;
      const recoil = releaseAge >= 0 && releaseAge < .24
        ? Math.sin(Math.PI * releaseAge / .24) * .13 * releaseStrength
        : 0;
      const squeeze = THREE.MathUtils.clamp(Math.max(chirpCharge, release * .62), 0, 1);
      const flapPhase = time * (moving ? 10 : 5);
      const flap = 0.16 + Math.sin(flapPhase) * (moving ? 0.52 : 0.24);
      // Expose the downstroke from this same animation clock, not an unrelated
      // grass oscillation. Hovering only stirs the grass lightly; folded wings
      // push a little less air during a chirp.
      wingbeatStrength = Math.pow(Math.max(0, Math.cos(flapPhase)), 2)
        * (moving ? 1 : .25) * (1 - squeeze * .3);
      for (const { wings, side } of wingGroups) {
        wings.scale.x = side * (1 - squeeze * .24 + recoil);
        wings.rotation.y = side * (flap + squeeze * .35 - recoil * .18);
        wings.rotation.z = side * (Math.cos(time * 2.1) * 0.035 + squeeze * .055);
      }
      if (body) body.scale.set(1 - squeeze * .08, 1 - squeeze * .16, 1 - squeeze * .08);
      const headNod = squeeze * .12;
      if (headPivot) headPivot.rotation.x = headNod;
      if (head) {
        head.scale.setScalar(1 - squeeze * .05);
        head.position.y = .18 - squeeze * .055;
      }
      if (chargeCore) {
        const glow = THREE.MathUtils.clamp(chirpCharge * .38 + release * .42, 0, .68);
        chargeCore.visible = glow > .012;
        chargeCore.material.opacity = glow;
        chargeCore.scale.setScalar(.7 + chirpCharge * .55 + release * .45);
      }
    },
    clone() {
      const clonedGroup = group.clone(true);
      cloneMaterials(clonedGroup);
      const clonedWingGroups = wingGroups.map(({ wings, side }) => ({
        wings: clonedGroup.getObjectByName(wings.name),
        side,
      }));
      return createButterflyController(clonedGroup, clonedWingGroups, whiteness, alwaysWhite, {
        body: body && clonedGroup.getObjectByName(body.name),
        head: head && clonedGroup.getObjectByName(head.name),
        headPivot: headPivot && clonedGroup.getObjectByName(headPivot.name),
        chargeCore: chargeCore && clonedGroup.getObjectByName(chargeCore.name),
      });
    },
  };

  setWhiteness(initialWhiteness);
  return controller;
}

// The original Belmont Girl silhouette: same Bezier wings, five veins,
// body proportions and antennae, isolated from that project's scene/UI state.
export function createButterfly({ whiteness = 0, alwaysWhite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Belmont Girl butterfly';
  const wingGroups = [];
  // A near-opaque fill with depth writes resolves the overlapping upper/lower
  // lobes and keeps the drawing aligned as the camera turns.
  const fill = alwaysWhite
    ? new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: true, toneMapped: false,
    })
    : new THREE.MeshPhysicalMaterial({
      color: '#d8d8d8', emissive: '#ffffff', emissiveIntensity: 0.18,
      transparent: true, opacity: 0.78, roughness: 0.18,
      // Like the player, translucent companions must still occlude the water
      // behind them. The transparent tube is sorted by its centre, not by each
      // wall fragment, so it can otherwise overwrite the fill at some angles.
      side: THREE.DoubleSide, depthWrite: true,
    });
  const line = new THREE.LineBasicMaterial({
    color: alwaysWhite ? '#dedede' : '#b6b6b6',
    transparent: true, opacity: alwaysWhite ? 1 : 0.78,
    depthWrite: false, toneMapped: alwaysWhite ? false : true,
  });
  for (const side of [-1, 1]) {
    const wings = new THREE.Group();
    wings.name = side < 0 ? 'left wings' : 'right wings';
    wings.scale.x = side;
    const upper = new THREE.Shape();
    upper.moveTo(0.05, 0.08);
    upper.bezierCurveTo(0.18, 0.92, 0.72, 1.72, 1.5, 1.62);
    upper.bezierCurveTo(2.08, 1.54, 2.08, 0.75, 1.67, 0.22);
    upper.bezierCurveTo(1.25, -0.28, 0.5, -0.18, 0.05, 0.08);
    const lower = new THREE.Shape();
    lower.moveTo(0.06, 0.02);
    lower.bezierCurveTo(0.5, -0.14, 1.35, -0.22, 1.55, -0.78);
    lower.bezierCurveTo(1.78, -1.4, 1.18, -1.73, 0.68, -1.44);
    lower.bezierCurveTo(0.22, -1.16, 0.04, -0.5, 0.06, 0.02);
    for (const [index, shape] of [upper, lower].entries()) {
      const layerDepth = index === 0 ? 0 : WING_LOWER_LAYER_DEPTH;
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, WING_CURVE_SEGMENTS), fill);
      wing.userData.visualRole = 'fill';
      wing.position.z = layerDepth;
      const points = shape.getPoints(WING_CURVE_SEGMENTS)
        .map(p => new THREE.Vector3(p.x, p.y, layerDepth + WING_LINE_LIFT));
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), line);
      outline.userData.visualRole = 'line';
      outline.renderOrder = 1;
      wings.add(wing, outline);
    }
    const veins = [
      [[0.08, 0.08], [0.55, 0.72], [1.5, 1.54]],
      [[0.08, 0.08], [0.92, 0.48], [1.82, 0.58]],
      [[0.08, 0.08], [0.7, 0.12], [1.62, 0.18]],
      [[0.08, 0], [0.72, -0.45], [1.5, -0.78]],
      [[0.08, -0.04], [0.45, -0.88], [0.72, -1.4]],
    ];
    for (const [index, path] of veins.entries()) {
      const layerDepth = index < 3 ? 0 : WING_LOWER_LAYER_DEPTH;
      const curve = new THREE.CatmullRomCurve3(path.map(([x, y]) => (
        new THREE.Vector3(x, y, layerDepth + WING_LINE_LIFT)
      )));
      const vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)), line);
      vein.userData.visualRole = 'line';
      vein.renderOrder = 1;
      wings.add(vein);
    }
    wingGroups.push({ wings, side });
    group.add(wings);
  }
  const bodyMaterial = alwaysWhite
    ? new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    : new THREE.MeshPhysicalMaterial({
      color: '#eeeeee', emissive: '#ffffff', emissiveIntensity: 0.25,
      roughness: 0.25, clearcoat: 0.8,
    });
  const { body, head, headPivot } = createButterflyAnatomy(bodyMaterial, line, alwaysWhite);
  group.add(body, headPivot);
  let chargeCore = null;
  if (alwaysWhite) {
    chargeCore = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 14), new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    chargeCore.name = 'butterfly chirp core';
    chargeCore.position.set(0, .1, .45);
    chargeCore.visible = false;
    chargeCore.renderOrder = 3;
    group.add(chargeCore);
  }
  return createButterflyController(group, wingGroups, whiteness, alwaysWhite, { body, head, headPivot, chargeCore });
}

// Shared by the player and the instanced Heaven swarm: proportions and paths
// come from one source, including the front/back outlines and antennae.
export function createButterflyAnatomy(bodyMaterial, line, outlined = true) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.115, .94, 8, 18), bodyMaterial);
  body.name = 'butterfly body';
  body.userData.visualRole = 'body';
  body.position.set(0, -.03, .16);
  const headPivot = new THREE.Group();
  headPivot.name = 'butterfly head pivot';
  headPivot.position.set(0, .54, .16);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 14), bodyMaterial);
  head.name = 'butterfly head';
  head.userData.visualRole = 'body';
  head.position.set(0, .18, 0);
  headPivot.add(head);
  if (outlined) {
    addFrontAndBackContours(body, depth => capsuleContourPoints(.115, .94, depth), line);
    addFrontAndBackContours(head, depth => circularContourPoints(.21, depth), line);
  }
  for (const side of [-1, 1]) {
    const antenna = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(side * 0.07, .32, 0),
      new THREE.Vector3(side * 0.28, .64, .02),
      new THREE.Vector3(side * 0.43, .71, 0),
    );
    const antennaLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(antenna.getPoints(20)), line);
    antennaLine.userData.visualRole = 'line';
    headPivot.add(antennaLine);
  }
  return { body, head, headPivot };
}
