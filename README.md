# Smth I Wrote Today

An independent Three.js scene: a white butterfly travels through a dark, watery tunnel toward an exit wrapped in mist. Beyond it lies Heaven: a rolling meadow of animated grass, a blue sky with soft clouds, and 1,400 colorful butterflies. The player butterfly keeps the curves and veins of Belmont Girl, 90%-opaque wings, and a charged chirp animation.

The public repository contains code, tests, and documentation. Music, video, and image assets are kept out of Git. See [local media setup](./public/README.md) to run the complete audiovisual experience without redistributing third-party material.

## Run locally

With Node.js and npm installed, run `npm ci`, then `npm run dev -- --host 127.0.0.1 --port 5193`.

Build with `npm run build`. Run the tests with `node --test tests/*.test.mjs`.

Open `http://127.0.0.1:5193/`. Add `?start=underworld`, `?start=limbo`, or `?start=heaven` to choose a starting point in both development and production.

## Controls

- Drag to rotate the camera through 360°. Left/right arrow keys are an alternative.
- W / S: fly forward / backward in the camera's look direction, including its vertical pitch.
- A / D: move sideways relative to the camera. Diagonal input does not increase the maximum speed.
- Space / Alt: ascend / descend. The tunnel wall and back cap block forward movement while allowing the butterfly to slide along them.
- Touchscreens: use the lower-left Move joystick to fly and drag across the scene to look around. Move fades after five seconds of continuous flight while remaining fully responsive until release. It also fades after repeated use and a short pause, returning on a new interaction after release or after a minute idle. Tap the player butterfly to call; hold to charge inside the tunnel. In Heaven, hold and drag to choose Gather, Chirp, or White. The radial menu stays fixed during each gesture and uses the upper arc when space below is limited. White appears only when the player has taken on another color; Release appears while companions follow and requires a brief hold over its option. The last chirp choice is remembered.
- Standard gamepad / DualShock 4: left stick or D-pad to fly, right stick to look, L2 to descend, and R2 to ascend.
- Hold R3 (click the right stick) and move the left stick up/down to smoothly zoom in/out, within the same limits as the mouse wheel. While R3 is held, the left stick does not move the butterfly; flight control returns when R3 is released. The D-pad, triggers, and camera look remain available.
- Esc / Options: open or close settings for camera sensitivity, music volume, sound-effects (chirp) volume, and sky-video opacity, which appears only in Heaven. The 0–100% effects-volume setting is saved and controls both the call and its response without changing the music or visual effects. On mobile, tap the upper-right corner to reveal the gear, then tap it to toggle settings. The gear slides upward and fades after a few seconds. Tapping outside the panel also closes it. Opening settings cancels flight input and any chirp being charged; its Controls guide follows the current input device and zone.
- Mouse wheel or pinch: adjust camera distance.
- In first-person view, the player's halo and local light are turned off. They fade during zoom and return when switching back to third person inside the tunnel. Companion lights are unaffected; the player's light stays off in Heaven.
- Zooming all the way in (wheel, pinch, or R3 + stick) transitions gradually, with a softer blend near first person, and hides the butterfly when the camera reaches it. Zooming out returns to third person. Double-tapping R3 switches views with a hard cut on the second tap and restores the previous distance when returning to third person. The gesture tolerates slight unintended stick movement; holding R3 to zoom does not count as a double tap. Flight orientation and collisions are preserved in both views.
- E / Circle: invite nearby butterflies to fly with you. In Heaven, new and existing companions keep their own colors; the player can still take on the response color. Inside the tunnel, hold and release to build the call's strength, reaching its maximum after 1.2 seconds. Heaven calls do not charge. A short double tap elsewhere still makes a basic call.
- Q / Square (Heaven only): share color with nearby butterflies, leaving them free. The call keeps its response, boost, and effects, and shares the chirp cooldown.
- F / Triangle: release the group in Heaven without a permanent on-screen button. Released butterflies keep their color and position, fly independently, and can be recruited again with E / Circle.
- R / DualShock Cross (Heaven only): emit an immediate chirp and restore the player's original white color. It does not absorb another color or reset position, camera, or flock. Nearby butterflies remain free and companions keep their colors; holding the button does not repeat the call.
- In the tunnel, including Limbo before crossing the exit, E / Circle and touch calls rescue nearby butterflies and draw them into your flight. Charge-dependent range and cooldown still apply. Q / Square and R / Cross become available in Heaven.
- P: pause the scene and flight. The scene starts paused when the operating system requests reduced motion.

## How it works

`src/TunnelWorld.js` builds a cylinder with a radius of 46 and a length of 1,080, aligned to the Z axis. The player starts at Z=873; the exit is at Z=−180. Wall lighting fades from the opening, and the player and recruited companions contribute small halos and local lights. Mist lets the player cross the threshold gradually, and the tunnel fades away on arrival in Heaven. The camera and player share the cylinder's boundaries.

`src/ButterflyParadise.js` creates a meadow around the player and a swarm of 1,400 butterflies in seven colors. The grass uses multiple levels of detail, a gentle breeze, and a localized response to the player's wingbeats. The camera respects the ground. Butterflies share instanced geometry, use out-of-sync wingbeats, and follow small choreographies. In Heaven, they respond to chirps by sharing their color with the player: E / Circle recruits them without changing NPC colors, while Q / Square greets them and shares their color with the companions without recruiting. New companions reuse the same instances and shadows; recruitment creates no extra models or lights. Flight slots are shared with butterflies rescued from the tunnel. Releasing them moves their orbits to their current position rather than sending them back to their original spawn. Released rescues remain visible in Heaven and do not return to the tunnel.

The outdoor grass begins loading as the player approaches Limbo. Its volume, coverage, and color appear progressively from 60 to 14 units before the tunnel entrance. The meadow is fully ready by the time the player reaches the mist, and the grass does not restart its appearance on arrival in Heaven. While the tunnel exists, grass blades stay on the outdoor terrain; this does not change when flight controls, recruitment, or collisions switch over. Starting directly in Heaven also shows fully loaded grass from the first frame.

`src/HeavenClouds.js` renders volumetric clouds by sampling a three-dimensional density field, integrating sunlight, and projecting shadows from the same volume onto the meadow. It renders at reduced resolution, using 36–128 steps depending on ray length (24–96 if sustained slowdown is detected). Detail is filtered by distance and pixel size, without random per-pixel offsets; reconstruction smooths only the cloud layer to reduce horizon grain. Blue-sky openings remain visible, and no distance fog is added to Heaven. Cloud shadows update at about 8 Hz, and their motion follows the scene's pause clock.

`src/HeavenLighting.js` uses the same sun direction to light the ground and cast nearby shadows from grass blades, the player, and companions. The local 2,048 px shadow map follows the player and covers a visible radius of 56 units, fading between 44 and 56. Grass shadows are limited to 12 units and reproduce deformation from wind and wingbeats. The butterfly keeps its luminous material and 90%-opaque wings. Shadow rendering is suspended inside the tunnel.

Heaven's NPCs also cast wing and body shadows on the meadow when flying low. `src/HeavenButterflyShadows.js` reuses their wingbeat transforms and collects only nearby silhouettes into five instanced batches; it does not redraw the entire swarm into the shadow map. Shadows fade between 12 and 36 units above the ground and disappear beyond the local area. Selection also includes distant NPCs whose shadows enter that area because of the sun angle.

The video is composited over the clouds with softened edges and a fade at each loop, synchronized to the slowed music. An occasional image appears in the sky and fades away smoothly. These audiovisual effects require the local media listed above. To inspect clouds, shadows, pause behavior, long-distance travel, and performance separately, open `/tests/heaven-glowup-render.html` on the development server. Its test controls do not appear on the regular site.

Twelve rescuable butterflies follow small orbits throughout the tunnel. A chirp reaches between 12 and 30 units depending on how long it is charged. Butterflies it reaches turn white, begin emitting light, and follow the player. The change is gradual, and the bond remains after entering the meadow. The player and companions can receive a boost of up to ×1.6 for four seconds. The pulse can repeat every 0.2 seconds to renew the boost without stacking multipliers. A call with no response does not speed up flight.

Base speed is 5 units/s, increasing to 8 during a boost. Pausing freezes the water, mist, swarm, and chirps. During development, transitions can also be previewed with `?preview=mist` and `?preview=paradise`; public entry points use `?start=…`.

`Waterfall.js` and `PortraitPass.js` preserve components from the previous scene, but are not mounted in this experience. The portrait does not appear over the dark tunnel when the camera turns.

## Publishing and media

Installed dependencies, builds, local configuration, credentials, and `.env` files are not included. Media in `public/` stays local. The repository does not grant rights to the song, video, or reference images. No open-source license has been added; making the code public does not automatically grant a license to reuse it.
