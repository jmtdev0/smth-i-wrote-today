import * as THREE from 'three';
import { CHIRP_RADIUS } from './resonance.js';

// A small fixed pool of rings: no trail, particles or growing allocations.
export function createResonanceEffects(player, flock, heavenFlock = null) {
  const group = new THREE.Group();
  group.name = 'Butterfly calls';
  const geometry = new THREE.RingGeometry(.97, 1, 96);
  const ring = () => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const pulses = Array.from({ length: flock.agents.length + 3 }, () => ({
    mesh: ring(), start: -Infinity, radius: 1, duration: .95,
  }));
  const halos = [player, ...flock.agents.map(agent => agent.butterfly)]
    .map((butterfly, index) => {
      const mesh = ring();
      mesh.name = `Resonance halo ${index}`;
      return { butterfly, mesh };
    });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  flash.visible = false;
  flash.renderOrder = 2;
  group.add(flash);
  const flashLight = new THREE.PointLight(0xffffff, 0, 12, 2);
  group.add(flashLight);
  let cursor = 0, audioContext = null, disposed = false, flashStart = -Infinity, flashCharge = 0;
  let effectsVolume = 1, masterGain = null;
  const FLASH_DURATION = .72;

  function emit(position, time, radius, duration, color = 0xffffff) {
    const pulse = pulses[cursor++ % pulses.length];
    pulse.start = time; pulse.radius = radius; pulse.duration = duration;
    pulse.mesh.position.copy(position);
    pulse.mesh.material.color.set(color);
  }

  function sound(answered, charge) {
    // Create/resume only in a real input gesture; audio failure is non-blocking.
    const AudioContext = typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || disposed || effectsVolume === 0) return;
    try {
      audioContext ??= new AudioContext();
      const context = audioContext;
      if (!masterGain) {
        masterGain = context.createGain();
        masterGain.gain.setValueAtTime(effectsVolume, context.currentTime);
        masterGain.connect(context.destination);
      }
      void context.resume().then(() => {
        if (disposed || context.state !== 'running' || effectsVolume === 0) return;
        const voices = answered ? [523.25, 783.99] : [523.25];
        voices.forEach((frequency, index) => {
          const start = context.currentTime + index * .12;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, start);
          oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.025, start + .45);
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(.018 + .018 * charge, start + .05);
          gain.gain.exponentialRampToValueAtTime(.0001, start + .7);
          oscillator.connect(gain).connect(masterGain);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(start); oscillator.stop(start + .75);
        });
      }).catch(() => {});
    } catch { /* Keep the visual call available without audio support. */ }
  }

  return {
    group,
    setVolume(value) {
      const number = Number(value);
      effectsVolume = Number.isFinite(number) ? THREE.MathUtils.clamp(number, 0, 1) : 1;
      if (!masterGain || disposed) return;
      // A separate bus adjusts both the call and its answer, including voices
      // already playing, without affecting music or the visual pulse.
      const now = audioContext.currentTime, current = masterGain.gain.value;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(current, now);
      masterGain.gain.linearRampToValueAtTime(effectsVolume, now + .02);
    },
    call(position, time, receivers, radius = CHIRP_RADIUS, charge = 0, heavenAnswer = null) {
      emit(position, time, radius, .95 + .2 * charge);
      for (const agent of receivers) emit(agent.butterfly.group.position, time + .12, 1.7 + .3 * charge, .75);
      if (heavenAnswer) emit(heavenAnswer.position, time + .12, 2.2, 1.2, heavenAnswer.color);
      flashStart = time;
      flashCharge = charge;
      flash.position.copy(position);
      flashLight.position.copy(position);
      sound(receivers.length > 0 || heavenAnswer !== null, charge);
    },
    update(time, cameraQuaternion) {
      for (const pulse of pulses) {
        const age = (time - pulse.start) / pulse.duration;
        pulse.mesh.visible = age >= 0 && age < 1;
        if (!pulse.mesh.visible) continue;
        pulse.mesh.quaternion.copy(cameraQuaternion);
        pulse.mesh.scale.setScalar(.25 + (pulse.radius - .25) * (1 - (1 - age) ** 2));
        pulse.mesh.material.opacity = Math.sin(Math.PI * age) * .27;
      }
      const flashAge = (time - flashStart) / FLASH_DURATION;
      const flashVisible = flashAge >= 0 && flashAge < 1;
      flash.visible = flashVisible;
      // An inactive light has zero intensity, not a different shader layout.
      if (flashVisible) {
        const attack = THREE.MathUtils.clamp(flashAge / .1, 0, 1);
        const release = THREE.MathUtils.clamp(1 - Math.max(0, flashAge - .08) / .64, 0, 1);
        const envelope = attack * release ** 1.6;
        flash.scale.setScalar(.28 + (3.2 + .5 * flashCharge) * (1 - Math.exp(-flashAge * 7)));
        flash.material.opacity = envelope * (.44 + .14 * flashCharge);
        flashLight.intensity = envelope * (3.5 + flashCharge);
      } else {
        flash.material.opacity = 0;
        flashLight.intensity = 0;
      }
      halos.forEach(({ butterfly, mesh }, index) => {
        const agent = flock.agents[index - 1];
        const strength = index ? agent.charge.strength(time) : flock.glow(time);
        const bonded = index ? agent.connected : flock.connectedCount + (heavenFlock?.connectedCount ?? 0) > 0;
        // Follow the four-second chirp envelope; companionship and lantern
        // light persist, but the circular indicator fades away with the call.
        mesh.material.opacity = bonded ? strength * .29 : 0;
        mesh.visible = bonded && strength > .001;
        if (!mesh.visible) return;
        mesh.position.copy(butterfly.group.position);
        mesh.quaternion.copy(cameraQuaternion);
        mesh.scale.setScalar(butterfly.group.scale.x * (2.55 + .18 * Math.sin(time * 2)));
      });
    },
    reset() {
      for (const pulse of pulses) { pulse.start = -Infinity; pulse.mesh.visible = false; }
      for (const halo of halos) {
        halo.mesh.visible = false;
        halo.mesh.material.opacity = 0;
      }
      flashStart = -Infinity;
      flashCharge = 0;
      flash.visible = false;
      flash.material.opacity = 0;
      flashLight.intensity = 0;
    },
    dispose() {
      disposed = true;
      masterGain?.disconnect();
      if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
      // Mesh resources are collected by main's existing shared-resource disposer.
    },
  };
}
