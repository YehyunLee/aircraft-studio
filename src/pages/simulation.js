import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function Simulation() {
  // HYPERPARAM: toggle enemy spawning (true = spawn enemies automatically)
  const HYPERPARAM_SPAWN_ENEMIES = true;

  // Refs for enemy instances and GLTF cache
  const enemiesRef = useRef([]); // array of { object: THREE.Object3D, controller: { update, dispose }, radius }
  const gltfCache = useRef({});

  const containerRef = useRef();
  const [isARSupported, setIsARSupported] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [error, setError] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [input, setInput] = useState({
    forward: 0,
    right: 0,
  });
  // inputRef used by the XR render loop so it always sees latest user input
  const inputRef = useRef({ forward: 0, right: 0 });

  // Helper to update both React state and the inputRef used in the loop
  const updateInput = (partial) => {
    setInput((i) => {
      const next = { ...i, ...partial };
      inputRef.current = next;
      return next;
    });
  };
  const velocity = useRef(new THREE.Vector3());
  const lastFrameTime = useRef(null);
  // Shooting refs
  const shotsRef = useRef([]); // array of { mesh, start, life, material }
  const SHOT_LIFETIME = 0.7; // seconds
  const lastShotTimeRef = useRef(0);
  const SHOT_COOLDOWN = 0.18; // seconds between shots
  const SHOT_SPEED = 8.0; // meters per second

  // AR session refs
  const rendererRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const sessionRef = useRef();
  const aircraftRef = useRef();
  // HUD refs for off-screen indicator
  const hudRef = useRef();
  // temporary vectors for projection math
  const tmpVec = useRef(new THREE.Vector3());
  const tmpVec2 = useRef(new THREE.Vector3());
  const tmpVec3 = useRef(new THREE.Vector3());
  const tmpVec4 = useRef(new THREE.Vector3());

  useEffect(() => {
    // Check WebXR support
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
        setIsARSupported(supported);
      });
    }

    // Load available models from multiple sources
    const models = [];
    
    // From aircraft/hangar page (jets)
    const jets = JSON.parse(localStorage.getItem('jets') || '[]');
    jets.forEach(jet => {
      models.push({
        id: jet.id,
        name: jet.name || 'Untitled',
        modelPath: `/models/aircraft-${jet.id}.glb`,
        source: 'hangar'
      });
    });
    
    // From home page generation history
    const homeHistory = JSON.parse(localStorage.getItem('generationHistory') || '[]');
    homeHistory.forEach((item, index) => {
      if (item.modelUrl) {
        models.push({
          id: `home-${index}`,
          name: item.prompt ? `Generated: ${item.prompt.slice(0, 30)}...` : `Generated Model ${index + 1}`,
          modelPath: item.modelUrl,
          source: 'home'
        });
      }
    });
    
    setAvailableModels(models);
    
    if (models.length > 0) {
      setSelectedModel(models[0].modelPath);
    }
  }, []);

  const initAR = async () => {
    if (!navigator.xr || !isARSupported) {
      setError('WebXR AR not supported on this device');
      return;
    }

    try {
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true 
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      
      rendererRef.current = renderer;

      // Create scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Create camera
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
      cameraRef.current = camera;

      // Add lighting
      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      light.position.set(0.5, 1, 0.25);
      scene.add(light);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 10, 0);
      scene.add(directionalLight);

      // Request AR session
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: document.getElementById('ar-ui-container') },
      });
      
      sessionRef.current = session;

      await renderer.xr.setSession(session);

      // Handle session end
      session.addEventListener('end', () => {
        exitAR();
      });

      const refSpace = await session.requestReferenceSpace('local-floor');

      // Append to container
      containerRef.current.appendChild(renderer.domElement);

      // Start XR-driven render loop
      renderer.setAnimationLoop((timestamp, frame) => {
        if (!frame) return;
        // compute delta from timestamp for smoother frame-rate-independent motion
        const now = timestamp || performance.now();
        let delta = 0.016;
        if (lastFrameTime.current != null) {
          delta = Math.min(0.05, (now - lastFrameTime.current) / 1000);
        }
        lastFrameTime.current = now;
        const pose = frame.getViewerPose(refSpace);
        if (pose) {
          const view = pose.views[0];
          const viewport = session.renderState.baseLayer.getViewport(view);
          renderer.setSize(viewport.width, viewport.height);
          
          camera.matrix.fromArray(view.transform.matrix);
          camera.projectionMatrix.fromArray(view.projectionMatrix);
          camera.updateMatrixWorld(true);

          // Update aircraft movement
          if (aircraftRef.current) {
            const aircraft = aircraftRef.current;
            // delta is computed above from actual frame timestamps

            // --- Forward speed: use a small negative z (convention: negative z == forward)
            // Start from current forward velocity and smoothly approach a base cruise speed.
            const baseForward = -0.75; // tuned to be slower than previous value
            // Smoothly lerp toward base forward speed so changes are not instant
            velocity.current.z = THREE.MathUtils.lerp(velocity.current.z || 0, baseForward, 0.08);

            // Joystick input adjustments
            // Use inputRef so the animation loop sees the latest input from event handlers
            const curInput = inputRef.current || { forward: 0, right: 0 };
            // Up/down on the joystick will slightly change forward speed (push forward => faster)
            if (curInput.forward) {
              // curInput.forward is 1 (up) or -1 (down). Positive should increase forward speed (more negative)
              velocity.current.z += -curInput.forward * 0.6 * delta; // small change per frame
            }

            // Lateral velocity for small strafing / inertial feeling
            velocity.current.x = THREE.MathUtils.lerp(velocity.current.x || 0, (curInput.right || 0) * 0.6, 0.12);
            // vertical velocity is mostly controlled by pitch; keep it small
            velocity.current.y = THREE.MathUtils.lerp(velocity.current.y || 0, 0, 0.12);

            // Clamp lateral/vertical speed so movement doesn't blow up
            velocity.current.x = THREE.MathUtils.clamp(velocity.current.x, -0.9, 0.9);
            velocity.current.y = THREE.MathUtils.clamp(velocity.current.y, -0.6, 0.6);
            velocity.current.z = THREE.MathUtils.clamp(velocity.current.z, -1.5, -0.3);

            // --- Rotation: use joystick input directly to pivot (yaw) and bank (roll)
            // This makes a left/right joystick tap cause an immediate pivot into the turn
            const maxYawRate = 2.0; // radians per second (tuned up for responsiveness)
            const yaw = (curInput.right || 0) * -maxYawRate * delta; // negative sign for expected handedness
            const bank = (curInput.right || 0) * -0.45; // target roll angle in radians
            // Derive target pitch from forward joystick input: up/down should pivot the jet
            // Positive forward (up control) => nose up. Tuned multiplier for visible pitch.
            const pitch = (curInput.forward || 0) * 0.45;

            // Apply yaw incrementally
            if (Math.abs(yaw) > 1e-6) {
              const qYaw = new THREE.Quaternion();
              qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
              // Pre-multiply so yaw applies in world Y, then slerp to smooth sudden changes
              aircraft.quaternion.multiply(qYaw);
            }

            // Apply a small, smooth roll/pitch by constructing a local euler and slerping
            const targetEuler = new THREE.Euler(pitch, 0, bank, 'XYZ');
            const targetQ = new THREE.Quaternion().setFromEuler(targetEuler);

            // Combine current orientation's yaw with target local pitch/roll
            // Extract current yaw from aircraft quaternion
            const currentYaw = new THREE.Euler().setFromQuaternion(aircraft.quaternion, 'YXZ').y;
            const combinedEuler = new THREE.Euler(pitch, currentYaw, bank, 'YXZ');
            const combinedQ = new THREE.Quaternion().setFromEuler(combinedEuler);

            // Smoothly slerp toward combined orientation so the bank/pitch transition looks natural
            aircraft.quaternion.slerp(combinedQ, 0.12);

            // --- Movement: move along aircraft's local forward (convention here: local +Z is forward)
            const forward = new THREE.Vector3(0, 0, 1);
            forward.applyQuaternion(aircraft.quaternion);
            forward.multiplyScalar(velocity.current.z * delta);
            aircraft.position.add(forward);

            // Apply small sideways (strafing) and vertical movement for feel
            const sideways = new THREE.Vector3(1, 0, 0);
            sideways.applyQuaternion(aircraft.quaternion);
            sideways.multiplyScalar(velocity.current.x * delta);
            aircraft.position.add(sideways);

            const up = new THREE.Vector3(0, 1, 0);
            up.applyQuaternion(aircraft.quaternion);
            up.multiplyScalar(velocity.current.y * delta);
            aircraft.position.add(up);

            // Slight damping to avoid runaway values
            velocity.current.x *= 0.96;
            velocity.current.y *= 0.96;
            velocity.current.z = THREE.MathUtils.lerp(velocity.current.z, baseForward, 0.02);
          }

          // Update enemies (simple controllers)
          try {
            const enemies = enemiesRef.current || [];
            for (let i = 0; i < enemies.length; ++i) {
              const e = enemies[i];
              if (e && e.controller && typeof e.controller.update === 'function') {
                e.controller.update(delta, i, enemies);
              }
            }
          } catch (e) {
            // swallow errors to avoid breaking render loop
          }

          // Update active shots
          try {
            const nowSec = (performance.now() || Date.now()) / 1000;
            const shots = shotsRef.current || [];
            for (let i = shots.length - 1; i >= 0; --i) {
              const s = shots[i];
              const t = (nowSec - s.start) / s.life;
              // move beam forward along its velocity
              if (s.velocity && s.mesh) {
                s.mesh.position.addScaledVector(s.velocity, delta);
              }
              if (s.material && s.material.uniforms) {
                s.material.uniforms.uLife.value = THREE.MathUtils.clamp(t, 0, 1);
                s.material.uniforms.uTime.value = nowSec;
              }
              if (t >= 1.0) {
                try {
                  if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh);
                  if (s.mesh && s.mesh.geometry) s.mesh.geometry.dispose();
                  if (s.material) s.material.dispose();
                } catch (err) {}
                shots.splice(i, 1);
              }
            }
          } catch (err) {
            // ignore shot update errors
          }

          renderer.render(scene, camera);

          // Update HUD indicator for aircraft off-screen
          try {
            const hudEl = hudRef.current;
            const aircraft = aircraftRef.current;
            if (hudEl && aircraft) {
              // aircraft world position
              tmpVec.current.copy(aircraft.position);
              // Project to camera NDC space
              tmpVec.current.project(camera);

              const ndcX = tmpVec.current.x; // -1..1
              const ndcY = tmpVec.current.y; // -1..1
              const ndcZ = tmpVec.current.z; // negative if behind

              const screenW = renderer.domElement.clientWidth || window.innerWidth;
              const screenH = renderer.domElement.clientHeight || window.innerHeight;

              // If the aircraft is within NDC cube (-1..1) and in front (z < 1)
              const onScreen = ndcZ < 1 && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;

              if (onScreen) {
                hudEl.style.display = 'none';
              } else {
                hudEl.style.display = 'flex';

                // Clamp NDC to slightly inside the edges so the indicator remains visible
                const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
                const edgeX = clamp(ndcX, -0.98, 0.98);
                const edgeY = clamp(ndcY, -0.98, 0.98);

                // Convert to screen coords (0..width / 0..height)
                let screenX = (edgeX * 0.5 + 0.5) * screenW;
                let screenY = ((-edgeY) * 0.5 + 0.5) * screenH;

                // If behind camera (ndcZ > 1 or original unprojected point was behind), flip indicator to opposite side
                if (ndcZ > 1) {
                  // Flip to indicate behind - mirror position
                  screenX = screenW - screenX;
                  screenY = screenH - screenY;
                }

                // Compute angle from center to point for rotation
                const centerX = screenW / 2;
                const centerY = screenH / 2;
                const dx = screenX - centerX;
                const dy = screenY - centerY;
                const angle = Math.atan2(dy, dx); // radians

                // Position HUD element near edge with some padding
                const pad = 18; // px padding from edge
                // Move the indicator slightly inwards from exact screenX/screenY to avoid overlapping chrome
                const clampToEdge = (x, min, max) => Math.max(min + pad, Math.min(max - pad, x));
                const left = clampToEdge(screenX, 0, screenW);
                const top = clampToEdge(screenY, 0, screenH);

                hudEl.style.left = `${left}px`;
                hudEl.style.top = `${top}px`;
                hudEl.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;

                // Distance label
                const distanceMeters = Math.max(0, camera.position.distanceTo(aircraft.position));
                const label = hudEl.querySelector('.hud-distance');
                if (label) label.textContent = `${distanceMeters.toFixed(1)}m`;
              }
            }
          } catch (e) {
            // silently ignore HUD errors so AR loop isn't disrupted
            // console.error('HUD update error', e);
          }
        }
      });
      
      setIsARActive(true);
      setError('');
      
      // Load aircraft AFTER AR is active
      if (selectedModel) {
        placeAircraft();
      }
    } catch (err) {
      console.error('AR initialization failed:', err);
      setError('Failed to start AR session: ' + err.message);
    }
  };

  // Spawn a shader-based 2D beam from the player's aircraft
  const fireShot = () => {
    try {
      const scene = sceneRef.current;
      const aircraft = aircraftRef.current;
      const renderer = rendererRef.current;
      if (!scene || !aircraft || !renderer) return;

      const now = (performance.now() || Date.now()) / 1000;
      if (now - (lastShotTimeRef.current || 0) < SHOT_COOLDOWN) return;
      lastShotTimeRef.current = now;

      // Direction vectors from aircraft orientation
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(aircraft.quaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion).normalize();

      const beamLength = 2.6; // meters
      const beamWidth = 0.035; // meters
      const startOffset = 0.9; // forward from nose
      const slightUp = 0.06; // raise beam slightly

      const startPos = new THREE.Vector3().copy(aircraft.position)
        .addScaledVector(fwd, startOffset)
        .addScaledVector(up, slightUp);

      const geo = new THREE.PlaneGeometry(beamWidth, beamLength, 1, 1);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uLife: { value: 0.0 },
          uTime: { value: now },
          uColor: { value: new THREE.Color(0.35, 0.9, 1.0) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uLife;
          uniform float uTime;
          uniform vec3 uColor;
          void main() {
            float across = abs(vUv.x - 0.5) * 2.0; // 0 center, 1 edges
            float along = vUv.y; // 0 base, 1 tip
            float core = smoothstep(1.0, 0.0, across);
            core *= core;
            float tip = smoothstep(0.75, 1.0, along) * smoothstep(1.0, 0.75, along);
            float lifeFade = smoothstep(1.0, 0.0, uLife);
            float alpha = clamp(core * 0.9 + tip * 0.6, 0.0, 1.0) * lifeFade;
            vec3 col = uColor * (1.0 + tip * 0.6);
            float baseFade = smoothstep(0.08, 0.0, along);
            alpha *= (1.0 - baseFade * 0.6);
            if (alpha <= 0.001) discard;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });

      const mesh = new THREE.Mesh(geo, mat);
      // Align plane +Y with forward
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd);
      mesh.quaternion.copy(q);
      // Shift so base starts at muzzle
      mesh.position.copy(startPos).addScaledVector(fwd, beamLength * 0.5);
      mesh.frustumCulled = false;
      mesh.renderOrder = 999;
      scene.add(mesh);

      // store forward velocity for motion
      const vel = new THREE.Vector3().copy(fwd).multiplyScalar(SHOT_SPEED);
      shotsRef.current.push({ mesh, start: now, life: SHOT_LIFETIME, material: mat, velocity: vel });
    } catch (e) {
      // ignore
    }
  };

  const placeAircraft = async () => {
    if (!selectedModel || aircraftRef.current || !sceneRef.current) return;

    setIsLoadingModel(true);

    try {
      const loader = new GLTFLoader();
      
      loader.load(
        selectedModel, 
        (gltf) => {
          const aircraft = gltf.scene;
          
          // Position aircraft close to player spawn
          aircraft.scale.setScalar(0.2); // Adjusted scale
          aircraft.position.set(0, -0.5, -2); // 2 meters in front, slightly below eye level
          
          sceneRef.current.add(aircraft);
          aircraftRef.current = aircraft;
          setIsLoadingModel(false);
          
          console.log('Aircraft loaded and placed in AR scene');

          // Spawn enemies immediately after placing aircraft if enabled
          if (HYPERPARAM_SPAWN_ENEMIES) {
            console.log('HYPERPARAM_SPAWN_ENEMIES is true — preparing to spawn enemies');
            enemiesRef.current = []; // reset any previous
            // Determine which models to spawn as enemies.
            // Rule: spawn as many enemy jets as there are generated jets minus one (player).
            // availableModels contains all jets; selectedModel is player's. We'll spawn one per other model.
            (async () => {
              try {
                // If there's only one model in availableModels, we duplicate it N times (default 4)
                // If availableModels is empty due to async state, try reading from localStorage as a fallback
                let models = availableModels && availableModels.length ? availableModels : [];
                if (models.length === 0) {
                  try {
                    const jets = JSON.parse(localStorage.getItem('jets') || '[]');
                    const homeHistory = JSON.parse(localStorage.getItem('generationHistory') || '[]');
                    models = [];
                    jets.forEach(jet => models.push({ id: jet.id, modelPath: `/models/aircraft-${jet.id}.glb`, source: 'hangar' }));
                    homeHistory.forEach((item, idx) => { if (item.modelUrl) models.push({ id: `home-${idx}`, modelPath: item.modelUrl, source: 'home' }); });
                  } catch (e) {
                    console.warn('Failed to read fallback models from localStorage', e);
                    models = [];
                  }
                }
                let spawnList = [];

                if (models.length <= 1) {
                  // Duplicate the selected model 4 times
                  const count = Math.max(3, Math.min(6, models.length ? 4 : 4));
                  for (let i = 0; i < count; ++i) spawnList.push({ modelPath: selectedModel });
                } else {
                  // Spawn all others except selectedModel
                  spawnList = models.filter(m => m.modelPath !== selectedModel).map(m => ({ modelPath: m.modelPath }));
                }

                // Load and spawn each model
                const loader = new GLTFLoader();

                console.log('Spawning enemy count:', spawnList.length, 'spawnList:', spawnList);
                for (let i = 0; i < spawnList.length; ++i) {
                  const entry = spawnList[i];
                  const url = entry.modelPath || selectedModel;

                  // Load or reuse cached gltf
                  let gltf = gltfCache.current[url];
                  let loadedFromCache = false;
                  if (!gltf) {
                    try {
                      gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
                      gltfCache.current[url] = gltf;
                      console.log('Enemy GLTF loaded:', url);
                    } catch (loadErr) {
                      console.error('Enemy GLTF failed to load:', url, loadErr);
                      gltf = null;
                    }
                  } else {
                    loadedFromCache = true;
                    console.log('Reusing cached enemy GLTF:', url);
                  }

                  // Clone scene so each enemy is independent. If load failed, we'll spawn a placeholder mesh instead.
                  let enemyObj;
                  if (gltf && gltf.scene) {
                    enemyObj = gltf.scene.clone(true);
                    enemyObj.scale.setScalar(0.18);
                  } else {
                    // Placeholder visible sphere so we can debug spawn positions even if glTF fails
                    const placeholderGeo = new THREE.SphereGeometry(0.18, 12, 8);
                    const placeholderMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                    enemyObj = new THREE.Mesh(placeholderGeo, placeholderMat);
                    console.warn('Using placeholder for enemy at URL:', url);
                  }

                  // Position enemies in a ring around the player start
                  const angle = (i / Math.max(1, spawnList.length)) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
                  const radius = 1.5 + Math.random() * 2.0; // between 1.5m and 3.5m
                  const yOffset = (Math.random() * 0.6) - 0.3;
                  enemyObj.position.set(Math.sin(angle) * radius, yOffset, Math.cos(angle) * radius - 2);

                  // Random yaw
                  enemyObj.quaternion.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));

                  // Add the enemy object to the scene and a visible marker for debugging
                  sceneRef.current.add(enemyObj);
                  // Make a small bright marker to ensure visibility even if model materials are dark
                  try {
                    // Create a small red triangular marker (cone with 3 radial segments) that points down
                    const coneGeo = new THREE.ConeGeometry(0.07, 0.12, 3);
                    const coneMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
                    const enemyMarker = new THREE.Mesh(coneGeo, coneMat);
                    // Point the cone downwards so the flat triangle faces the camera when above the jet
                    enemyMarker.rotation.x = Math.PI; // flip so apex points down
                    enemyMarker.position.set(0, 0.22, 0);
                    enemyMarker.renderOrder = 9999;
                    enemyMarker.frustumCulled = false;
                    enemyMarker.userData.isEnemyMarker = true;
                    // Add as child so it follows the enemy's transform
                    if (enemyObj.add) enemyObj.add(enemyMarker);
                  } catch (markerErr) {
                    // ignore marker errors
                  }

                  // Simple controller attached directly to the object
                  const controller = (() => {
                    // Simple wandering controller with avoidance
                    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.04, -0.5 - Math.random() * 0.6);
                    const forward = new THREE.Vector3();
                    const tmp = new THREE.Vector3();
                    const radius = 0.6;

                    function update(dt, idx, allEnemies) {
                      // Pursuit steering toward player's aircraft with some wander + avoidance
                      const jitter = 0.4;

                      // If we have a player aircraft, steer toward it
                      if (aircraftRef && aircraftRef.current) {
                        // desired velocity toward player
                        tmp.subVectors(aircraftRef.current.position, enemyObj.position);
                        const dist = tmp.length();
                        if (dist > 0.001) {
                          tmp.normalize();
                          // desired speed scales slightly with distance
                          const desiredSpeed = THREE.MathUtils.clamp(0.6 + dist * 0.08, 0.4, 2.2);
                          tmp.multiplyScalar(desiredSpeed);

                          // steering = desired - current velocity
                          tmp.subVectors(tmp, velocity);
                          // apply steering force (scaled by dt)
                          velocity.addScaledVector(tmp, 2.5 * dt);
                        }

                        // small random jitter so pursuit looks natural
                        velocity.x += (Math.random() - 0.5) * jitter * dt;
                        velocity.y += (Math.random() - 0.5) * (jitter * 0.6) * dt;
                      } else {
                        // fallback wander when no player present
                        velocity.x += (Math.random() - 0.5) * jitter * dt;
                        velocity.y += (Math.random() - 0.5) * (jitter * 0.4) * dt;
                        velocity.z += (Math.random() - 0.5) * (jitter * 0.2) * dt;
                      }

                      // Limit speeds
                      velocity.x = THREE.MathUtils.clamp(velocity.x, -1.6, 1.6);
                      velocity.y = THREE.MathUtils.clamp(velocity.y, -1.0, 1.0);
                      velocity.z = THREE.MathUtils.clamp(velocity.z, -3.0, -0.15);

                      // Simple collision avoidance: repel from nearby enemies
                      for (let j = 0; j < allEnemies.length; ++j) {
                        if (j === idx) continue;
                        const other = allEnemies[j];
                        if (!other || !other.object) continue;
                        tmp.subVectors(enemyObj.position, other.object.position);
                        const d = tmp.length();
                        if (d > 0 && d < 1.0) {
                          tmp.normalize();
                          // push away proportional to overlap
                          const push = (1.0 - d) * 2.0;
                          velocity.addScaledVector(tmp, push * dt * 2.0);
                        }
                      }

                      // Integrate
                      enemyObj.position.addScaledVector(velocity, dt);

                      // Slowly orient to velocity direction (or toward player if close)
                      forward.copy(velocity);
                      // If velocity is tiny and we have a player, face the player instead
                      if (forward.lengthSq() < 1e-6 && aircraftRef && aircraftRef.current) {
                        forward.subVectors(aircraftRef.current.position, enemyObj.position);
                      }
                      forward.y = 0; // ignore pitch for yaw alignment
                      if (forward.lengthSq() > 1e-6) {
                        forward.normalize();
                        const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
                        enemyObj.quaternion.slerp(targetQ, 0.12);
                      }

                      // Keep within a rough boundary around player start to avoid flying away
                      const maxDist = 18.0;
                      if (enemyObj.position.length() > maxDist) {
                        enemyObj.position.multiplyScalar(0.75);
                      }
                    }

                    function dispose() {
                      // no-op for now
                    }

                    return { update, dispose, radius };
                  })();

                  enemiesRef.current.push({ object: enemyObj, controller, radius: 0.6 });
                }
              } catch (err) {
                console.warn('Failed to spawn enemy jets:', err);
              }
            })();
          }
        }, 
        (progress) => {
          console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
          console.error('Error loading aircraft model:', error);
          setError('Failed to load aircraft model: ' + error.message);
          setIsLoadingModel(false);
        }
      );
    } catch (err) {
      console.error('Error placing aircraft:', err);
      setError('Failed to place aircraft: ' + err.message);
      setIsLoadingModel(false);
    }
  };

  const exitAR = () => {
    if (sessionRef.current) {
      sessionRef.current.end().catch(err => console.error("Failed to end session:", err));
    }
    
    if (rendererRef.current) {
      rendererRef.current.setAnimationLoop(null);
      if (containerRef.current && rendererRef.current.domElement.parentNode) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    sessionRef.current = null;
    aircraftRef.current = null;
    // Cleanup enemies
    try {
      const enemies = enemiesRef.current || [];
      for (const e of enemies) {
        if (e.controller && typeof e.controller.dispose === 'function') e.controller.dispose();
        if (e.object && e.object.parent) e.object.parent.remove(e.object);
      }
    } catch (err) {
      // ignore
    }
    enemiesRef.current = [];
    // Cleanup remaining shots
    try {
      const shots = shotsRef.current || [];
      for (const s of shots) {
        try {
          if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh);
          if (s.mesh && s.mesh.geometry) s.mesh.geometry.dispose();
          if (s.material) s.material.dispose();
        } catch (e) {}
      }
    } catch (e) {}
    shotsRef.current = [];
    setIsARActive(false);
    setIsLoadingModel(false);
    setError('');
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white">
      <div ref={containerRef} className="w-full h-dvh absolute top-0 left-0" />
      
      {!isARActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
          <div className="glass rounded-2xl p-6 w-full max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4">AR Simulation</h1>
            
            {!isARSupported ? (
              <div>
                <p className="text-red-400 mb-4">WebXR AR not supported on this device</p>
                <p className="text-sm text-white/70">Use Chrome on Android or Safari on iOS with AR support</p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableModels.length > 0 ? (
                  <>
                    <div>
                      <label className="block text-sm text-white/70 mb-2">Select Aircraft:</label>
                      <select 
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full p-3 rounded-xl bg-white/10 border border-white/20 text-white"
                      >
                        {availableModels.map((model) => (
                          <option key={model.id} value={model.modelPath} className="bg-gray-800">
                            {model.name} {model.source === 'home' ? '(Generated)' : '(Hangar)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <button
                      onClick={initAR}
                      className="w-full py-3 px-6 bg-cyan-500 hover:bg-cyan-600 rounded-xl font-semibold text-black transition-colors"
                    >
                      Enter AR
                    </button>
                    
                    <p className="text-xs text-white/60">
                      Aircraft will appear in front of you in AR space
                    </p>
                  </>
                ) : (
                  <div>
                    <p className="text-white/70 mb-4">No aircraft available</p>
                    <p className="text-sm text-white/60 mb-2">
                      Create aircraft from:
                    </p>
                    <ul className="text-xs text-white/50 text-left list-disc list-inside space-y-1">
                      <li>Home page: Generate 3D models from images</li>
                      <li>Hangar page: Create and manage aircraft projects</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div id="ar-ui-container">
        {/* HUD off-screen indicator */}
        <div ref={hudRef} id="hud-indicator" className="hud-indicator" style={{display: 'none'}}>
          <div className="hud-arrow">▸</div>
          <div className="hud-distance">0m</div>
        </div>
        {isARActive && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <button
              onClick={exitAR}
              className="px-4 py-2 bg-red-500/80 backdrop-blur rounded-xl text-white font-medium"
            >
              Exit AR
            </button>
            
            {isLoadingModel && (
              <div className="px-4 py-2 bg-black/60 backdrop-blur rounded-xl text-white text-sm flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Loading aircraft...
              </div>
            )}
            
            {!isLoadingModel && aircraftRef.current && (
              <div className="px-4 py-2 bg-green-500/60 backdrop-blur rounded-xl text-white text-sm">
                Aircraft loaded
              </div>
            )}
          </div>
        )}
        
        {isARActive && (
          <div id="joystick-container" className="absolute bottom-6 left-4 w-52 h-40">
            <div id="up-control" className="joystick-btn top-0 left-1/2 -translate-x-1/2 w-14 h-14"
              onTouchStart={() => updateInput({ forward: 1 })}
              onTouchEnd={() => updateInput({ forward: 0 })}
              onPointerDown={() => updateInput({ forward: 1 })}
              onPointerUp={() => updateInput({ forward: 0 })}
            >▲</div>
            <div id="down-control" className="joystick-btn bottom-0 left-1/2 -translate-x-1/2 w-14 h-14"
              onTouchStart={() => updateInput({ forward: -1 })}
              onTouchEnd={() => updateInput({ forward: 0 })}
              onPointerDown={() => updateInput({ forward: -1 })}
              onPointerUp={() => updateInput({ forward: 0 })}
            >▼</div>
            <div id="left-control" className="joystick-btn top-1/2 -translate-y-1/2 left-0 w-14 h-14"
              onTouchStart={() => updateInput({ right: -1 })}
              onTouchEnd={() => updateInput({ right: 0 })}
              onPointerDown={() => updateInput({ right: -1 })}
              onPointerUp={() => updateInput({ right: 0 })}
            >◀</div>
            <div id="right-control" className="joystick-btn top-1/2 -translate-y-1/2 right-0 w-14 h-14"
              onTouchStart={() => updateInput({ right: 1 })}
              onTouchEnd={() => updateInput({ right: 0 })}
              onPointerDown={() => updateInput({ right: 1 })}
              onPointerUp={() => updateInput({ right: 0 })}
            >▶</div>
          </div>
        )}

        {isARActive && (
          <div className="absolute bottom-6 right-5">
            <button
              id="shoot-btn"
              className="shoot-btn"
              onPointerDown={fireShot}
              onTouchStart={(e) => { e.preventDefault(); fireShot(); }}
            >
              Fire
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .joystick-btn {
          position: absolute;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.6rem;
          color: white;
          user-select: none;
          touch-action: none; /* ensure pointer/touch events fire immediately */
          cursor: pointer;
          z-index: 50;
        }
        .joystick-btn:active {
          background: rgba(255, 255, 255, 0.4);
        }
        .shoot-btn {
          width: 70px;
          height: 70px;
          border-radius: 9999px;
          background: rgba(59, 130, 246, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: white;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          box-shadow: 0 4px 18px rgba(59, 130, 246, 0.45);
          backdrop-filter: blur(6px);
          cursor: pointer;
          user-select: none;
          touch-action: none;
          z-index: 55;
        }
        .shoot-btn:active {
          transform: scale(0.98);
          background: rgba(59, 130, 246, 1);
        }
        /* HUD indicator */
        .hud-indicator {
          position: fixed;
          z-index: 60;
          width: 56px;
          height: 56px;
          background: rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.12);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-direction: column;
          border-radius: 12px;
          pointer-events: none; /* don't block interactions */
          transform-origin: 50% 50%;
          transition: left 0.08s linear, top 0.08s linear, transform 0.12s linear, opacity 0.12s;
        }
        .hud-arrow {
          font-size: 20px;
          line-height: 1;
          transform: translateX(-2px);
        }
        .hud-distance {
          font-size: 11px;
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}