import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getModelObjectURL } from '../lib/idbModels';

export default function Simulation() {
  // HYPERPARAM: toggle enemy spawning (true = spawn enemies automatically)
  const HYPERPARAM_SPAWN_ENEMIES = true;

  // Refs for enemy instances and GLTF cache
  const enemiesRef = useRef([]); // array of { object: THREE.Object3D, controller: { update, dispose }, radius }
  const gltfCache = useRef({});

  const containerRef = useRef();
  const router = useRouter();
  const { src: srcParam, title: titleParam, modelId: modelIdParam, instantWebxr } = router.query || {};
  const [isARSupported, setIsARSupported] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [overlayUsesBody, setOverlayUsesBody] = useState(false); // if true, make page bg transparent
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [error, setError] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [enemiesRemaining, setEnemiesRemaining] = useState(0);
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
  const isFiringRef = useRef(false); // hold-to-fire flag
  const AIM_SPREAD_DEG = 10.0; // random aim cone half-angle in degrees

  // Audio refs
  const audioListenerRef = useRef();
  const propellerSoundRef = useRef();
  const shootingSoundRef = useRef();
  const explosionSoundRef = useRef(); // non-positional explosion sound

  // Explosion refs
  const explosionsRef = useRef([]); // array of { mesh, start, life }

  // Enemy id counter for hit tracking
  const enemyIdCounterRef = useRef(1);
  const enemiesAliveRef = useRef(0);
  const enemiesSpawnedRef = useRef(false);

  // Session stats & leaderboard flow
  const sessionStartRef = useRef(null);
  const statsRef = useRef({ shotsFired: 0, hits: 0, enemiesDestroyed: 0 });
  const leaderboardPendingRef = useRef(false);
  // Live HUD stats and highlighting state
  const [statsSnapshot, setStatsSnapshot] = useState({
    score: 0,
    shotsFired: 0,
    hits: 0,
    enemiesDestroyed: 0,
    accuracy: 0,
    time: 0,
  });
  const [lastUpdatedStat, setLastUpdatedStat] = useState(null); // 'shotsFired' | 'hits' | 'enemiesDestroyed' | 'time' | 'score'
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [enemiesZeroPulse, setEnemiesZeroPulse] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState(null); // { score, clearTime, enemiesDestroyed, shotsFired, hits }

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
    // If Launch SDK is present, handle iOS flow: redirect to launch viewer for WebXR
    const onVLaunchInit = (event) => {
      try {
        if (event?.detail?.launchRequired && event?.detail?.launchUrl) {
          // Re-enter this page within the Launch viewer to enable WebXR on iOS
          window.location.href = event.detail.launchUrl;
        }
      } catch {}
    };
    window.addEventListener('vlaunch-initialized', onVLaunchInit);

    // Check WebXR support
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
        setIsARSupported(supported);
      });
    }

    // Load available models from multiple sources
    const models = [];
    let preselectedFromLink = null;
    // If modelId is provided, resolve to an object URL and preselect
    const addPreselectedFromParams = async () => {
      if (typeof modelIdParam === 'string' && modelIdParam.length > 0) {
        try {
          const resolved = await getModelObjectURL(modelIdParam);
          if (resolved) {
            // Try to enrich with thumbnail/name from generationHistory
            let thumbFromHistory = null;
            let nameFromHistory = null;
            try {
              const genHist = JSON.parse(localStorage.getItem('generationHistory') || '[]');
              const match = genHist.find((it) => it && it.modelId && String(it.modelId) === String(modelIdParam));
              if (match) {
                thumbFromHistory = match.imageUrl || null;
                nameFromHistory = match.name || null;
              }
            } catch (_) {}

            const nameFromLink = (typeof titleParam === 'string' && titleParam.length > 0) ? titleParam : (nameFromHistory || 'Selected Aircraft');
            models.unshift({ id: `id-${modelIdParam}`, name: nameFromLink, modelPath: resolved, source: 'id', modelId: modelIdParam, thumb: thumbFromHistory });
            preselectedFromLink = resolved;
            urlCleanup.push(resolved);
          }
        } catch {}
      } else if (typeof srcParam === 'string' && srcParam.length > 0) {
        const nameFromLink = (typeof titleParam === 'string' && titleParam.length > 0) ? titleParam : 'Selected Aircraft';
        models.unshift({ id: 'link', name: nameFromLink, modelPath: srcParam, source: 'link' });
        preselectedFromLink = srcParam;
      }
    };
    
    // From aircraft/hangar page (jets)
    const jets = JSON.parse(localStorage.getItem('jets') || '[]');
    jets.forEach(jet => {
      models.push({
        id: jet.id,
        name: jet.name || 'Untitled',
        modelPath: `/models/aircraft-${jet.id}.glb`,
        source: 'hangar',
        thumb: jet.thumbnail || jet.imageUrl || null,
      });
    });
    
    // From home page generation history
    const homeHistory = JSON.parse(localStorage.getItem('generationHistory') || '[]');
    // Resolve any that have a persistent modelId from IndexedDB; otherwise use modelUrl
    // We'll collect promises to resolve object URLs
    const urlCleanup = [];
  const resolvePromises = homeHistory.map(async (item, index) => {
      if (item.modelId) {
        try {
          const url = await getModelObjectURL(item.modelId);
          if (url) {
            urlCleanup.push(url);
            models.push({
              id: item.slugId || `home-${index}`,
              name: item.name || item.enhancedPrompt || item.originalPrompt || (item.prompt ? `Generated: ${item.prompt.slice(0, 30)}...` : `Generated Model ${index + 1}`),
              modelPath: url,
              source: 'home',
              thumb: item.imageUrl || null,
              modelId: item.modelId,
            });
            return;
          }
        } catch {}
      }
      if (item.modelUrl) {
        models.push({
          id: item.slugId || `home-${index}`,
          name: item.name || item.enhancedPrompt || item.originalPrompt || (item.prompt ? `Generated: ${item.prompt.slice(0, 30)}...` : `Generated Model ${index + 1}`),
          modelPath: item.modelUrl,
          source: 'home',
          thumb: item.imageUrl || null,
          modelId: item.modelId || undefined,
        });
      }
    });
    
    Promise.allSettled([addPreselectedFromParams(), ...resolvePromises]).then(() => {
      setAvailableModels(models);
      if (preselectedFromLink) {
        setSelectedModel(preselectedFromLink);
      } else if (models.length > 0) {
        setSelectedModel(models[0].modelPath);
      }
      // If coming back from Launch viewer with instantWebxr flag, auto-start AR
      if (typeof instantWebxr === 'string' && instantWebxr.toLowerCase() === 'true') {
        // Defer a tick to allow UI and renderer to mount
        setTimeout(() => {
          initAR();
        }, 50);
      }
    });

    // Cleanup created object URLs on unmount
    return () => {
      window.removeEventListener('vlaunch-initialized', onVLaunchInit);
      urlCleanup.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const initAR = async () => {
    if (!navigator.xr || !isARSupported) {
      setError('WebXR AR not supported on this device');
      return;
    }

    try {
      // Ensure audio context is alive before wiring listener/sounds
      try { await ensureAudioContextRunning(); } catch (_) {}
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

      // Add audio listener
      const audioListener = new THREE.AudioListener();
      camera.add(audioListener);
      audioListenerRef.current = audioListener;

      // Load propeller sound
      const propellerSound = new THREE.Audio(audioListener);
      const audioLoader = new THREE.AudioLoader();
      audioLoader.load('/jet_engine_9s_sound_effect.mp3', (buffer) => {
        propellerSound.setBuffer(buffer);
        propellerSound.setLoop(true);
        // Slightly louder propeller/engine hum
        propellerSound.setVolume(0.8);
        propellerSound.play();
      });
      propellerSoundRef.current = propellerSound;

      // Load shooting sound
      const shootingSound = new THREE.Audio(audioListener);
      audioLoader.load('/shooting_1s_sound_effect.mp3', (buffer) => {
        shootingSound.setBuffer(buffer);
        shootingSound.setLoop(false);
        shootingSound.setVolume(0.8);
      });
      shootingSoundRef.current = shootingSound;

      // Load explosion sound (fixed, not distance-based)
      const explosionSound = new THREE.Audio(audioListener);
      audioLoader.load('/explosion.mp3', (buffer) => {
        explosionSound.setBuffer(buffer);
        explosionSound.setLoop(false);
        // Increase explosion volume a bit
        explosionSound.setVolume(3.0);
      });
      explosionSoundRef.current = explosionSound;


      // Add lighting
      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      light.position.set(0.5, 1, 0.25);
      scene.add(light);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 10, 0);
      scene.add(directionalLight);

      // Request AR session
      // iOS (Safari + Launch viewers) prefers document.body as dom-overlay root.
      // Android Chrome works best with a specific element root to avoid page backgrounds covering the camera feed.
      const isIOS = (() => {
        try {
          const ua = navigator.userAgent || '';
          const isApple = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
          return !!isApple;
        } catch { return false; }
      })();
      const elementRoot = document.getElementById('ar-ui-container');
      const chosenRoot = isIOS ? document.body : (elementRoot || document.body);
      const sessionInit = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: chosenRoot },
      };
      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      
      sessionRef.current = session;

      await renderer.xr.setSession(session);

      // Warn if dom-overlay isn't actually enabled so we can still position UI
      try {
        const hasDomOverlay = session.domOverlayState && session.domOverlayState.type;
        if (!hasDomOverlay) {
          console.warn('WebXR dom-overlay not active; using fixed overlay container for UI on top of canvas.');
        }
        // Ensure overlay container exists and is visible
        const overlayEl = document.getElementById('ar-ui-container');
        if (overlayEl) {
          overlayEl.style.display = '';
        }
        // Record whether we used body as overlay root so we can make page background transparent
        setOverlayUsesBody(chosenRoot === document.body);
      } catch (_) {}

      // Handle session end (avoid calling end() again inside handler)
      const onSessionEnd = () => {
        try { exitAR(true); } catch (_) {}
        try { session.removeEventListener('end', onSessionEnd); } catch (_) {}
      };
      session.addEventListener('end', onSessionEnd);

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
            const baseForward = -0.88; // slightly faster base forward cruise
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
            velocity.current.z = THREE.MathUtils.clamp(velocity.current.z, -1.7, -0.25);

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

          // Enemy firing scheduler (randomized cadence)
          try {
            const nowSec = (performance.now() || Date.now()) / 1000;
            const enemies = enemiesRef.current || [];
            for (let i = 0; i < enemies.length; ++i) {
              const entry = enemies[i];
              if (!entry || !entry.object) continue;
              if (!entry.nextFireAt) {
                entry.nextFireAt = nowSec + 0.6 + Math.random() * 1.5; // initial stagger
              }
              if (nowSec >= entry.nextFireAt) {
                // Fire and schedule next
                try { fireEnemyShot(entry); } catch (_) {}
                const nextInterval = 0.9 + Math.random() * 1.1; // 0.9s - 2.0s
                entry.nextFireAt = nowSec + nextInterval;
              }
            }
          } catch (e) {
            // ignore enemy firing errors
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

              // Collision: player shots damage enemies
              try {
                if (s.owner === 'player' && s.mesh && s.dir && s.length) {
                  const a = s.mesh.position;
                  const dir = s.dir; // normalized
                  const b = tmpVec4.current.copy(dir).multiplyScalar(s.length).add(a);
                  const enemies = enemiesRef.current || [];
                  for (let ei = enemies.length - 1; ei >= 0; --ei) {
                    const entry = enemies[ei];
                    if (!entry || !entry.object || entry.dead) continue;
                    // ensure we don't multi-hit same enemy with same shot
                    if (s.hitEnemies && s.hitEnemies.has(entry.id)) continue;
                    const p = entry.object.position;
                    // distance from point to segment AB
                    const ab = tmpVec.current.copy(b).sub(a);
                    const ap = tmpVec2.current.copy(p).sub(a);
                    const abLen2 = Math.max(1e-6, ab.lengthSq());
                    const tSeg = THREE.MathUtils.clamp(ap.dot(ab) / abLen2, 0, 1);
                    const closest = tmpVec3.current.copy(a).addScaledVector(ab, tSeg);
                    const dist = p.distanceTo(closest);
                    const hitRadius = (entry.radius || 0.6) + (s.beamWidth || 0.04) * 0.6; // generous hit radius
                    if (dist <= hitRadius) {
                      // register hit
                      if (!s.hitEnemies) s.hitEnemies = new Set();
                      s.hitEnemies.add(entry.id);
                      // stats: hits
                      try {
                        statsRef.current.hits = (statsRef.current.hits || 0) + 1;
                        setLastUpdatedStat('hits');
                        setLastUpdatedAt(Date.now());
                      } catch (_) {}
                      entry.hp = (entry.hp ?? 10) - 1;
                      if (entry.hp <= 0) {
                        // explode and remove enemy
                        try {
                          explodeEnemy(entry);
                        } catch (_) {}
                        // remove from array
                        const idx = enemies.indexOf(entry);
                        if (idx >= 0) enemies.splice(idx, 1);
                        // stats: enemies destroyed
                        try {
                          statsRef.current.enemiesDestroyed = (statsRef.current.enemiesDestroyed || 0) + 1;
                          setLastUpdatedStat('enemiesDestroyed');
                          setLastUpdatedAt(Date.now());
                        } catch (_) {}
                      }
                      // Optionally, consume the shot on hit (so it doesn't keep hitting others). Comment out to allow piercing.
                      // if (s.mesh && s.mesh.parent) s.mesh.parent.remove(s.mesh);
                      // if (s.mesh && s.mesh.geometry) s.mesh.geometry.dispose();
                      // if (s.material) s.material.dispose();
                      // shots.splice(i, 1);
                      // continue; // move on to next shot
                    }
                  }
                }
              } catch (_) {}

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

          // Detect end-of-wave: all enemies destroyed
          try {
            if (!leaderboardPendingRef.current && enemiesSpawnedRef.current) {
              if ((enemiesAliveRef.current || 0) === 0) {
                leaderboardPendingRef.current = true;
                finalizeSessionAndShowLeaderboard();
              }
            }
          } catch (_) {}

          // Update explosions (expand and fade)
          try {
            const nowSec = (performance.now() || Date.now()) / 1000;
            const explosions = explosionsRef.current || [];
            for (let i = explosions.length - 1; i >= 0; --i) {
              const e = explosions[i];
              const t = (nowSec - e.start) / e.life;
              if (e.mesh && e.mesh.material) {
                const tt = THREE.MathUtils.clamp(t, 0, 1);
                const scale = THREE.MathUtils.lerp(0.3, 2.2, tt);
                e.mesh.scale.setScalar(scale);
                e.mesh.material.opacity = 0.95 * (1.0 - tt);
              }
              if (t >= 1.0) {
                try {
                  if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
                  if (e.mesh && e.mesh.geometry) e.mesh.geometry.dispose();
                  if (e.mesh && e.mesh.material) e.mesh.material.dispose();
                } catch (_) {}
                explosions.splice(i, 1);
              }
            }
          } catch (_) {}

          // Handle hold-to-fire auto firing gated by cooldown
          try {
            if (isFiringRef.current) {
              const nowSec = (performance.now() || Date.now()) / 1000;
              if (nowSec - (lastShotTimeRef.current || 0) >= SHOT_COOLDOWN) {
                fireShot();
              }
            }
          } catch (e) {}

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
      // Initialize session stats
      try {
        sessionStartRef.current = (performance.now() || Date.now()) / 1000;
        statsRef.current = { shotsFired: 0, hits: 0, enemiesDestroyed: 0 };
        leaderboardPendingRef.current = false;
        enemiesAliveRef.current = 0;
        enemiesSpawnedRef.current = false;
        setShowLeaderboard(false);
        setEnemiesRemaining(0);
      } catch (_) {}
    } catch (err) {
      console.error('AR initialization failed:', err);
      setError('Failed to start AR session: ' + err.message);
    }
  };

  // Stop all currently playing or looped audio and optionally suspend the Web Audio context (helps iOS)
  const stopAllAudio = (suspendContext = false) => {
    try {
      // Stop engine/propeller hum
      if (propellerSoundRef.current) {
        try { propellerSoundRef.current.setLoop(false); } catch (_) {}
        try { if (propellerSoundRef.current.isPlaying) propellerSoundRef.current.stop(); } catch (_) {}
        try { propellerSoundRef.current.setBuffer(null); } catch (_) {}
      }
      // Stop player shooting sound
      if (shootingSoundRef.current) {
        try { if (shootingSoundRef.current.isPlaying) shootingSoundRef.current.stop(); } catch (_) {}
        try { shootingSoundRef.current.setBuffer(null); } catch (_) {}
      }
      // Stop explosion sound
      if (explosionSoundRef.current) {
        try { if (explosionSoundRef.current.isPlaying) explosionSoundRef.current.stop(); } catch (_) {}
        try { explosionSoundRef.current.setBuffer(null); } catch (_) {}
      }
      // Stop any enemy positional audio
      try {
        const enemies = enemiesRef.current || [];
        for (const e of enemies) {
          try { if (e && e.shootAudio && e.shootAudio.isPlaying) e.shootAudio.stop(); } catch (_) {}
        }
      } catch (_) {}
      // Detach audio listener from camera to break audio graph
      try {
        if (audioListenerRef.current && cameraRef.current) {
          try { cameraRef.current.remove(audioListenerRef.current); } catch (_) {}
        }
      } catch (_) {}
      // Suspend audio context on iOS so nothing keeps playing in background
      if (suspendContext) {
        try {
          const ctx = THREE.AudioContext && THREE.AudioContext.getContext ? THREE.AudioContext.getContext() : null;
          if (ctx && typeof ctx.suspend === 'function' && ctx.state !== 'closed') {
            ctx.suspend().catch(() => {});
          }
        } catch (_) {}
      }
    } catch (_) {}
  };

  // Ensure shared Web Audio context is running (resume if suspended) so sounds can play on subsequent runs
  const ensureAudioContextRunning = async () => {
    try {
      const ctx = THREE.AudioContext && THREE.AudioContext.getContext ? THREE.AudioContext.getContext() : null;
      if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
    } catch (_) {}
  };

  // iOS visual viewport compensation for Variant/embedded zoom: inversely scale overlay container
  useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const vv = window.visualViewport;
      const getEl = () => document.getElementById('ar-ui-container');
      const apply = () => {
        const el = getEl();
        if (!el) return;
        if (isIOS && vv && isARActive) {
          const s = vv.scale || 1;
          const inv = 1 / s;
          el.style.transformOrigin = 'top left';
          el.style.transform = `scale(${inv})`;
          el.style.left = vv.offsetLeft + 'px';
          el.style.top = vv.offsetTop + 'px';
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          el.style.width = vv.width + 'px';
          el.style.height = vv.height + 'px';
        } else {
          el.style.transform = '';
          el.style.transformOrigin = '';
          el.style.left = '';
          el.style.top = '';
          el.style.right = '';
          el.style.bottom = '';
          el.style.width = '';
          el.style.height = '';
        }
      };
      apply();
      if (vv) {
        vv.addEventListener('resize', apply);
        vv.addEventListener('scroll', apply);
      }
      window.addEventListener('orientationchange', apply);
      return () => {
        try {
          if (vv) {
            vv.removeEventListener('resize', apply);
            vv.removeEventListener('scroll', apply);
          }
          window.removeEventListener('orientationchange', apply);
        } catch (_) {}
      };
    } catch (_) {}
  }, [isARActive]);

  // Periodically compute live score and stats for HUD while AR is active
  useEffect(() => {
    if (!isARActive) return;
    const id = setInterval(() => {
      try {
        const now = (performance.now() || Date.now()) / 1000;
        const start = sessionStartRef.current || now;
        const t = Math.max(0, now - start);
        const s = statsRef.current || { shotsFired: 0, hits: 0, enemiesDestroyed: 0 };
        const accuracy = s.shotsFired > 0 ? s.hits / s.shotsFired : 0;
        const score = Math.max(0, Math.round(1000 + (s.enemiesDestroyed || 0) * 100 + (s.hits || 0) * 25 - (s.shotsFired || 0) * 5 - Math.floor(t * 10)));
        setStatsSnapshot({
          score,
          shotsFired: s.shotsFired || 0,
          hits: s.hits || 0,
          enemiesDestroyed: s.enemiesDestroyed || 0,
          accuracy,
          time: t,
        });
        // Optionally highlight score/time when they change significantly
        // Highlight score when it increases
        if (score !== statsSnapshot.score) {
          setLastUpdatedStat('score');
          setLastUpdatedAt(Date.now());
        }
        // Briefly mark time updates every ~2s
        if (Math.floor(t) % 2 === 0 && Math.floor(t) !== Math.floor(statsSnapshot.time)) {
          setLastUpdatedStat('time');
          setLastUpdatedAt(Date.now());
        }
      } catch (_) {}
    }, 250);
    return () => clearInterval(id);
  }, [isARActive]);

  // Pulse when enemiesRemaining reaches zero
  useEffect(() => {
    if (enemiesRemaining === 0 && isARActive) {
      setEnemiesZeroPulse(true);
      const t = setTimeout(() => setEnemiesZeroPulse(false), 1200);
      return () => clearTimeout(t);
    }
  }, [enemiesRemaining, isARActive]);

  // Handle Enter AR button: on iOS outside of Launch viewer, use SDK to relaunch
  const handleEnterAR = async () => {
    try {
      setError('');
      // Ensure any previous XR session is properly closed before starting a new one
      try {
        const current = (rendererRef.current && rendererRef.current.xr && rendererRef.current.xr.getSession) ? rendererRef.current.xr.getSession() : null;
        if (current && !current.ended) {
          await current.end().catch(() => {});
        }
      } catch (_) {}
      // Make sure AudioContext is resumed on user gesture before starting
      await ensureAudioContextRunning();
      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
      // If on iOS and WebXR is not yet supported (i.e., we're outside the Launch viewer), use the SDK redirect
      if (isIOS && !isARSupported && window.VLaunch && typeof window.VLaunch.getLaunchUrl === 'function') {
        const url = new URL(window.location.href);
        url.searchParams.set('instantWebxr', 'true');
        const launchUrl = window.VLaunch.getLaunchUrl(url.toString());
        window.location.href = launchUrl;
        return;
      }
      // Re-check support at click time (context can change after Launch viewer)
      if (navigator.xr && navigator.xr.isSessionSupported) {
        try { setIsARSupported(await navigator.xr.isSessionSupported('immersive-ar')); } catch (_) {}
      }
    } catch {}
    // Otherwise, try starting WebXR directly
    initAR();
  };

  // Spawn a shader-based 2D beam from the player's aircraft
  const fireShot = () => {
    try {
      // Attempt to resume audio in case context was suspended
      try { ensureAudioContextRunning(); } catch (_) {}
      const scene = sceneRef.current;
      const aircraft = aircraftRef.current;
      const renderer = rendererRef.current;
      if (!scene || !aircraft || !renderer) return;

      const now = (performance.now() || Date.now()) / 1000;
      if (now - (lastShotTimeRef.current || 0) < SHOT_COOLDOWN) return;
      lastShotTimeRef.current = now;

  // stats: shots fired
  try {
    statsRef.current.shotsFired = (statsRef.current.shotsFired || 0) + 1;
    setLastUpdatedStat('shotsFired');
    setLastUpdatedAt(Date.now());
  } catch (_) {}

      // Play shooting sound
      if (shootingSoundRef.current && shootingSoundRef.current.buffer) {
        if (shootingSoundRef.current.isPlaying) {
          shootingSoundRef.current.stop();
        }
        shootingSoundRef.current.play();
      }

      // Base orientation vectors
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(aircraft.quaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion).normalize();

      // Beam and muzzle parameters
  const maxBeamLength = 2.1; // meters (slightly shorter)
      const beamWidth = 0.035; // meters
  const startOffset = 0.6; // forward from nose (closer to jet)
      const slightUp = 0.06; // raise beam slightly

      // Compute muzzle position in local space for accuracy, then convert to world
      const muzzleLocal = new THREE.Vector3(0, slightUp, startOffset);
      const startPos = muzzleLocal.clone();
      aircraft.localToWorld(startPos);

      // Auto-aim: find nearest enemy to the muzzle
      let dir = new THREE.Vector3().copy(fwd);
      let beamLength = maxBeamLength;
      try {
        const enemies = enemiesRef.current || [];
        let nearest = null;
        let nearestDist = Infinity;
        for (let i = 0; i < enemies.length; i++) {
          const obj = enemies[i] && enemies[i].object;
          if (!obj) continue;
          const d = obj.position.distanceTo(startPos);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = obj;
          }
        }
        if (nearest) {
          dir.copy(nearest.position).sub(startPos);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            // Clamp the beam to the target distance but keep a small minimum so it is visible
            const minBeamLength = 0.7;
            beamLength = Math.max(minBeamLength, Math.min(maxBeamLength, nearestDist));
            // Apply a small random angular spread so aim is not perfectly precise
            const spread = THREE.MathUtils.degToRad(AIM_SPREAD_DEG);
            const r = Math.sqrt(Math.random()); // concentrate samples toward center
            const theta = Math.random() * Math.PI * 2.0;
            const offsetMag = Math.tan(spread) * r;
            const dx = offsetMag * Math.cos(theta);
            const dy = offsetMag * Math.sin(theta);
            // Build orthonormal basis around dir
            const tempUp = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(dir, tempUp);
            if (right.lengthSq() < 1e-6) {
              tempUp.set(1, 0, 0);
              right.crossVectors(dir, tempUp);
            }
            right.normalize();
            const upPerp = new THREE.Vector3().crossVectors(right, dir).normalize();
            const aimed = new THREE.Vector3().copy(dir)
              .addScaledVector(right, dx)
              .addScaledVector(upPerp, dy)
              .normalize();
            dir.copy(aimed);
          } else {
            dir.copy(fwd);
          }
        }
      } catch (e) {
        // fallback to forward if anything goes wrong
        dir.copy(fwd);
      }

  const geo = new THREE.PlaneGeometry(beamWidth, beamLength, 1, 1);
  // Move geometry so local origin is at the base (muzzle), not the center
  geo.translate(0, beamLength * 0.5, 0);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uLife: { value: 0.0 },
          uTime: { value: now },
          // player's beam: green tint
          uColor: { value: new THREE.Color(0.2, 1.0, 0.3) },
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
      // Align plane +Y with aim direction
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.quaternion.copy(q);
  // Place base exactly at the muzzle
  mesh.position.copy(startPos);
      mesh.frustumCulled = false;
      mesh.renderOrder = 999;
      scene.add(mesh);

  // store velocity for motion along aim direction
  const vel = new THREE.Vector3().copy(dir).multiplyScalar(SHOT_SPEED);
      shotsRef.current.push({ mesh, start: now, life: SHOT_LIFETIME, material: mat, velocity: vel, owner: 'player', dir: dir.clone(), length: beamLength, beamWidth });
    } catch (e) {
      // ignore
    }
  };

  // Spawn a red beam from an enemy toward the player's aircraft (with positional audio)
  const fireEnemyShot = (entry) => {
    const scene = sceneRef.current;
    const enemy = entry && entry.object;
    const player = aircraftRef.current;
    if (!scene || !enemy || !player) return;

    try {
      const now = (performance.now() || Date.now()) / 1000;

      // Play enemy positional shooting sound if available
      try {
        if (entry.shootAudio) {
          // If buffer not yet assigned but we have it from player's shooting sound, set it now
          if (!entry.shootAudio.buffer && shootingSoundRef.current && shootingSoundRef.current.buffer) {
            entry.shootAudio.setBuffer(shootingSoundRef.current.buffer);
          }
          if (entry.shootAudio.buffer) {
            if (entry.shootAudio.isPlaying) entry.shootAudio.stop();
            entry.shootAudio.setVolume(0.9);
            entry.shootAudio.play();
          }
        }
      } catch (_) {}

      // Compute muzzle in enemy local space -> world
      const slightUp = 0.05;
      const startOffset = 0.55;
      const muzzleLocal = new THREE.Vector3(0, slightUp, startOffset);
      const startPos = muzzleLocal.clone();
      enemy.localToWorld(startPos);

      // Aim direction toward player with small random spread
      const dir = new THREE.Vector3().subVectors(player.position, startPos);
      const distToPlayer = Math.max(0.001, dir.length());
      dir.normalize();
      try {
        const spread = THREE.MathUtils.degToRad(AIM_SPREAD_DEG * 0.8); // a bit tighter than player
        const r = Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2.0;
        const offsetMag = Math.tan(spread) * r;
        const dx = offsetMag * Math.cos(theta);
        const dy = offsetMag * Math.sin(theta);
        const tempUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, tempUp);
        if (right.lengthSq() < 1e-6) {
          tempUp.set(1, 0, 0);
          right.crossVectors(dir, tempUp);
        }
        right.normalize();
        const upPerp = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, dx).addScaledVector(upPerp, dy).normalize();
      } catch (_) {}

      // Beam geometry and material (red)
      const maxBeamLength = 1.9;
      const beamLength = Math.max(0.6, Math.min(maxBeamLength, distToPlayer));
      const beamWidth = 0.034;
      const geo = new THREE.PlaneGeometry(beamWidth, beamLength, 1, 1);
      geo.translate(0, beamLength * 0.5, 0);

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uLife: { value: 0.0 },
          uTime: { value: now },
          uColor: { value: new THREE.Color(1.0, 0.22, 0.22) },
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
            float across = abs(vUv.x - 0.5) * 2.0;
            float along = vUv.y;
            float core = smoothstep(1.0, 0.0, across);
            core *= core;
            float tip = smoothstep(0.75, 1.0, along) * smoothstep(1.0, 0.75, along);
            float lifeFade = smoothstep(1.0, 0.0, uLife);
            float alpha = clamp(core * 0.9 + tip * 0.6, 0.0, 1.0) * lifeFade;
            vec3 col = uColor * (1.0 + tip * 0.5);
            float baseFade = smoothstep(0.08, 0.0, along);
            alpha *= (1.0 - baseFade * 0.6);
            if (alpha <= 0.001) discard;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.quaternion.copy(q);
      mesh.position.copy(startPos);
      mesh.frustumCulled = false;
      mesh.renderOrder = 999;
      scene.add(mesh);

      const vel = new THREE.Vector3().copy(dir).multiplyScalar(SHOT_SPEED * 0.95);
      shotsRef.current.push({ mesh, start: now, life: SHOT_LIFETIME, material: mat, velocity: vel, owner: 'enemy', dir: dir.clone(), length: beamLength, beamWidth });
    } catch (_) {
      // ignore
    }
  };

  // Create a simple expanding/fading explosion at a world position and play fixed explosion audio
  const explodeEnemy = (entry) => {
    const scene = sceneRef.current;
    const obj = entry && entry.object;
    if (!scene || !obj) return;

    // Play explosion sound (fixed, non-positional)
    try {
      if (explosionSoundRef.current && explosionSoundRef.current.buffer) {
        if (explosionSoundRef.current.isPlaying) explosionSoundRef.current.stop();
        explosionSoundRef.current.play();
      }
    } catch (_) {}

    // Create explosion mesh
    const pos = obj.position.clone();
    const geo = new THREE.SphereGeometry(0.25, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    scene.add(mesh);
    const now = (performance.now() || Date.now()) / 1000;
    explosionsRef.current.push({ mesh, start: now, life: 0.6 });

    // Remove enemy object from scene
    try {
      if (entry.shootAudio && entry.shootAudio.isPlaying) entry.shootAudio.stop();
    } catch (_) {}
    try {
      if (entry.controller && typeof entry.controller.dispose === 'function') entry.controller.dispose();
      if (obj.parent) obj.parent.remove(obj);
    } catch (_) {}
    entry.dead = true;
    try { 
      enemiesAliveRef.current = Math.max(0, (enemiesAliveRef.current || 0) - 1);
      setEnemiesRemaining(enemiesAliveRef.current);
    } catch (_) {}
  };

  // Finalize session: submit to global leaderboard API and also update localStorage; then show modal
  const finalizeSessionAndShowLeaderboard = async () => {
    const endSec = (performance.now() || Date.now()) / 1000;
    const startSec = sessionStartRef.current || endSec;
    const clearTime = Math.max(0, endSec - startSec);
    const stats = statsRef.current || { shotsFired: 0, hits: 0, enemiesDestroyed: 0 };

    try {
      const key = 'aircraftLeaderboard';
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      const modelKey = selectedModel || 'unknown-model';
      const name = (availableModels.find(m => m.modelPath === selectedModel)?.name) || modelKey;
      const rec = data[modelKey] || {
        modelPath: modelKey,
        name,
        bestTime: null,
        totalClears: 0,
        totalEnemiesDestroyed: 0,
        totalShots: 0,
        totalHits: 0,
      };
      rec.bestTime = rec.bestTime == null ? clearTime : Math.min(rec.bestTime, clearTime);
      rec.totalClears += 1;
      rec.totalEnemiesDestroyed += (stats.enemiesDestroyed || 0);
      rec.totalShots += (stats.shotsFired || 0);
      rec.totalHits += (stats.hits || 0);
      data[modelKey] = rec;
      localStorage.setItem(key, JSON.stringify(data));

      // Submit to global leaderboard (Auth required). Ignore failures.
      try {
        const modelEntry = availableModels.find(m => m.modelPath === selectedModel) || null;
        await fetch('/api/leaderboard/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: Math.max(0, Math.round(1000 + (stats.enemiesDestroyed || 0) * 100 + (stats.hits || 0) * 25 - (stats.shotsFired || 0) * 5 - Math.floor(clearTime * 10))),
            clearTime,
            enemiesDestroyed: stats.enemiesDestroyed || 0,
            shotsFired: stats.shotsFired || 0,
            hits: stats.hits || 0,
            modelName: modelEntry?.name || null,
            modelId: modelEntry?.modelId || null,
            modelPath: selectedModel || null,
          }),
        });
      } catch (e) {
        console.warn('Failed to submit global leaderboard:', e);
      }

      // Fetch global leaderboard to show
      try {
        const resp = await fetch('/api/leaderboard/top?limit=20&sort=score');
        const json = await resp.json();
        if (json && json.ok && Array.isArray(json.entries)) {
          setLeaderboardData(json.entries.map((it, idx) => ({
            id: idx,
            name: it?.user?.name || 'Anonymous',
            score: it?.score || 0,
            clearTime: it?.clearTime ?? null,
            enemiesDestroyed: it?.enemiesDestroyed || 0,
            shotsFired: it?.shotsFired || 0,
            hits: it?.hits || 0,
          })));
        }
      } catch (e) {
        // ignore fetch errors
      }
    } catch (_) {}

    // Show leaderboard overlay while still in AR; user will choose to close (and then we'll exit)
    // Quiet the scene audio once wave is complete (especially for iOS)
    try { stopAllAudio(false); } catch (_) {}
    try {
      const s = statsRef.current || { shotsFired: 0, hits: 0, enemiesDestroyed: 0 };
      const scoreNow = Math.max(0, Math.round(1000 + (s.enemiesDestroyed || 0) * 100 + (s.hits || 0) * 25 - (s.shotsFired || 0) * 5 - Math.floor(clearTime * 10)));
      setLastRunSummary({
        score: scoreNow,
        clearTime,
        enemiesDestroyed: s.enemiesDestroyed || 0,
        shotsFired: s.shotsFired || 0,
        hits: s.hits || 0,
      });
    } catch (_) {}
    setShowLeaderboard(true);
  };

  // Close leaderboard then exit AR session
  const closeLeaderboardAndExit = () => {
    try { setShowLeaderboard(false); } catch (_) {}
    try { exitAR(); } catch (_) {}
    try { router.push('/leaderboard'); } catch (_) {}
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
          aircraft.scale.setScalar(0.46); // Slightly larger player jet
          aircraft.position.set(0, -0.5, -2); // 2 meters in front, slightly below eye level
          
          // Attach positional audio for shooting
          if (shootingSoundRef.current) {
            aircraft.add(shootingSoundRef.current);
          }

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

                // Build opponents list by excluding selected by modelPath/modelId
                const selectedEntry = models.find(m => m.modelPath === selectedModel);
                const selectedId = selectedEntry && selectedEntry.modelId ? String(selectedEntry.modelId) : undefined;
                const filtered = models.filter(m => {
                  if (m.modelPath === selectedModel) return false;
                  if (selectedId && m.modelId && String(m.modelId) === selectedId) return false;
                  return true;
                });
                // Dedupe by modelId/url
                const seen = new Set();
                const deduped = [];
                for (const m of filtered) {
                  const key = m.modelId ? `id:${m.modelId}` : `url:${m.modelPath}`;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  deduped.push(m);
                }
                if (deduped.length === 0) {
                  // No valid opponents found → fallback to duplicating the selected model 4 times
                  const count = 4;
                  spawnList = Array.from({ length: count }, () => ({ modelPath: selectedModel }));
                } else {
                  spawnList = deduped.map(m => ({ modelPath: m.modelPath }));
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
                    enemyObj.scale.setScalar(0.42); // Slightly larger enemy jets
                  } else {
                    // Placeholder visible sphere so we can debug spawn positions even if glTF fails
                    const placeholderGeo = new THREE.SphereGeometry(0.42, 12, 8); // Slightly larger placeholder
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

                  // Attach positional audio for enemy shooting with distance-based attenuation
                  let enemyShootAudio = null;
                  try {
                    if (audioListenerRef.current) {
                      enemyShootAudio = new THREE.PositionalAudio(audioListenerRef.current);
                      // If the shooting buffer is already loaded, set it now; else we'll set it on first fire
                      if (shootingSoundRef.current && shootingSoundRef.current.buffer) {
                        enemyShootAudio.setBuffer(shootingSoundRef.current.buffer);
                      }
                      enemyShootAudio.setRefDistance(1.2);
                      enemyShootAudio.setRolloffFactor(1.8);
                      if (enemyShootAudio.setDistanceModel) enemyShootAudio.setDistanceModel('exponential');
                      enemyObj.add(enemyShootAudio);
                    }
                  } catch (_) {}

                  // Simple controller attached directly to the object
                  const controller = (() => {
                    // Simple wandering controller with avoidance
                    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.05, -0.62 - Math.random() * 0.72);
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
                          const desiredSpeed = THREE.MathUtils.clamp(0.6 + dist * 0.085, 0.45, 2.5);
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
                      velocity.z = THREE.MathUtils.clamp(velocity.z, -3.4, -0.12);

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

                  const nowSec = (performance.now() || Date.now()) / 1000;
                  enemiesRef.current.push({ object: enemyObj, controller, radius: 0.6, shootAudio: enemyShootAudio, nextFireAt: nowSec + 0.6 + Math.random() * 1.5, hp: 10, id: enemyIdCounterRef.current++ });
                  try { 
                    enemiesAliveRef.current = (enemiesAliveRef.current || 0) + 1; 
                    enemiesSpawnedRef.current = true; 
                    setEnemiesRemaining(enemiesAliveRef.current);
                  } catch (_) {}
                }
                try { setEnemiesRemaining(enemiesAliveRef.current || 0); } catch (_) {}
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

  const exitAR = (skipEnd = false) => {
    if (sessionRef.current && !skipEnd) {
      // End session first (if not already ended)
      try { if (!sessionRef.current.ended) sessionRef.current.end(); } catch (err) { console.error("Failed to end session:", err); }
    }
    // Proactively stop all sounds and suspend audio context on iOS
    try { stopAllAudio(true); } catch (_) {}
    
    if (rendererRef.current) {
      rendererRef.current.setAnimationLoop(null);
      if (containerRef.current && rendererRef.current.domElement.parentNode) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

  sessionRef.current = null;
  sceneRef.current = null;
  cameraRef.current = null;
    aircraftRef.current = null;
    // Cleanup enemies
    try {
      const enemies = enemiesRef.current || [];
      for (const e of enemies) {
        try {
          if (e.shootAudio && e.shootAudio.isPlaying) e.shootAudio.stop();
        } catch (_) {}
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
    try { setOverlayUsesBody(false); } catch (_) {}
    setIsLoadingModel(false);
    setError('');
    try { setEnemiesRemaining(0); } catch (_) {}
    // Clear audio refs so next session re-creates fresh instances and buffers
    try {
      propellerSoundRef.current = null;
      shootingSoundRef.current = null;
      explosionSoundRef.current = null;
    } catch (_) {}
  };

  // On navigation away, tab hide, or pagehide (iOS), ensure audio is stopped
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        try { stopAllAudio(true); } catch (_) {}
      }
    };
    const onPageHide = () => {
      try { stopAllAudio(true); } catch (_) {}
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    // Also stop on Next.js route changes
    const handleRouteStart = () => { try { stopAllAudio(true); } catch (_) {} };
    try { router.events?.on('routeChangeStart', handleRouteStart); } catch (_) {}
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      try { router.events?.off('routeChangeStart', handleRouteStart); } catch (_) {}
    };
  }, []);

  // Exit AR and return to home page (used by the Exit button)
  const exitARAndGoHome = () => {
    try { exitAR(); } catch (_) {}
    try { router.push('/aircraft'); } catch (_) {}
  };

  return (
  <div className="min-h-dvh text-white bg-[#05060a] relative" style={{ background: (isARActive && overlayUsesBody) ? 'transparent' : undefined }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
      </Head>
      {/* grid background (hidden when AR uses body overlay) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]"
        style={{ display: (isARActive && overlayUsesBody) ? 'none' : undefined }}
      />
      <div ref={containerRef} className="w-full h-dvh absolute top-0 left-0" />
      
      {!isARActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
          <div className="glass rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-semibold">AR Simulation</h1>
              <button
                onClick={() => router.push('/aircraft')}
                className="px-3 py-2 rounded-xl bg-white/10 text-white/90 border border-white/15 hover:bg-white/15 transition text-sm"
              >
                Back
              </button>
            </div>
            
            {!isARSupported ? (
              <div>
                <p className="text-red-400 mb-4">WebXR AR not supported on this device</p>
                <p className="text-sm text-white/70">Use Chrome on Android or Safari on iOS with AR support</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedModel ? (
                  <>
                    {/* Opponents Preview */}
                    <div className="text-left mb-2">
                      <div className="text-sm text-white/70">Opponents</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      {(() => {
                        const sel = selectedModel;
                        const models = availableModels || [];
                        const selectedEntry = models.find(m => m.modelPath === sel) || models[0];
                        const selectedId = selectedEntry && selectedEntry.modelId ? String(selectedEntry.modelId) : undefined;
                        // Exclude selected by modelPath or matching modelId (if present)
                        const filtered = (models || []).filter(m => {
                          if (m.modelPath === sel) return false;
                          if (selectedId && m.modelId && String(m.modelId) === selectedId) return false;
                          return true;
                        });
                        // Dedupe by modelId or modelPath to avoid duplicates
                        const seen = new Set();
                        const deduped = [];
                        for (const m of filtered) {
                          const key = m.modelId ? `id:${m.modelId}` : `url:${m.modelPath}`;
                          if (seen.has(key)) continue;
                          seen.add(key);
                          deduped.push(m);
                        }
                        let enemies = deduped.length > 0 ? deduped : (selectedEntry ? [selectedEntry] : []);
                        // If mirroring selected and no thumb, try to find an alt entry of same model with a thumb
                        if (enemies.length === 1 && enemies[0] === selectedEntry && (!selectedEntry.thumb)) {
                          const alt = models.find(m => (selectedId && m.modelId && String(m.modelId) === selectedId) || m.modelPath === sel);
                          if (alt && alt.thumb) {
                            enemies = [alt];
                          }
                        }
                        return enemies.slice(0, 6).map((m, idx) => (
                          <div key={m.id || idx} className="glass rounded-xl p-3 flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                              {m.thumb ? (
                                <img src={m.thumb} alt={m.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">No image</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{m.name}</div>
                              <div className="text-[11px] text-white/50 truncate">{m.source === 'home' ? 'Generated' : (m.source === 'hangar' ? 'Hangar' : 'Link')}</div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <button
                      onClick={handleEnterAR}
                      className="w-full py-3 px-6 rounded-xl bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/15 transition"
                    >
                      Enter AR
                    </button>
                    <p className="text-xs text-white/60">
                      Aircraft will appear in front of you in AR space
                    </p>
                  </>
                ) : (
                  availableModels.length > 0 ? (
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
                        onClick={handleEnterAR}
                        className="w-full py-3 px-6 rounded-xl bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/15 transition"
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
                  )
                )}
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-3 bg-red-500/15 border border-red-500/35 rounded-xl">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
      
  <div id="ar-ui-container" style={{ pointerEvents: showLeaderboard ? 'auto' : undefined }}>
        {/* HUD off-screen indicator */}
        <div ref={hudRef} id="hud-indicator" className="hud-indicator" style={{display: 'none'}}>
          <div className="hud-arrow">▸</div>
          <div className="hud-distance">0m</div>
        </div>
        {isARActive && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <button
              onClick={exitARAndGoHome}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white font-medium backdrop-blur hover:bg-white/15 transition"
            >
              Exit AR
            </button>
            <div className="flex items-center gap-2">
              <div
                className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-md bg-black/50 border border-white/15 backdrop-blur text-white/90 ${enemiesZeroPulse ? 'pulse-outline' : ''}`}
                title="Enemies remaining"
              >
                Enemies left: <span className={`${enemiesRemaining === 0 ? 'text-emerald-300' : enemiesRemaining <= 3 ? 'text-yellow-300' : 'text-red-300'}`}>{enemiesRemaining}</span>
              </div>
              <div
                className={`px-3 py-2 rounded-xl text-sm font-semibold shadow-md bg-black/50 border border-white/15 backdrop-blur text-white/90 ${lastUpdatedStat === 'time' && Date.now() - lastUpdatedAt < 900 ? 'highlight' : ''}`}
                title="Elapsed time"
              >
                Time: {statsSnapshot.time.toFixed(1)}s
              </div>
            </div>
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
              onPointerDown={() => { try { ensureAudioContextRunning(); } catch (_) {}; isFiringRef.current = true; fireShot(); }}
              onPointerUp={() => { isFiringRef.current = false; }}
              onPointerCancel={() => { isFiringRef.current = false; }}
              onPointerLeave={() => { isFiringRef.current = false; }}
              onTouchStart={(e) => { e.preventDefault(); try { ensureAudioContextRunning(); } catch (_) {}; isFiringRef.current = true; fireShot(); }}
              onTouchEnd={(e) => { e.preventDefault(); isFiringRef.current = false; }}
            >
              Fire
            </button>
          </div>
        )}

        {showLeaderboard && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
            <div className="glass rounded-2xl p-6 w-full max-w-md text-left">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Global Leaderboard</h2>
                <button className="px-3 py-1 bg-white/10 rounded-lg" onClick={closeLeaderboardAndExit}>Close</button>
              </div>
              {lastRunSummary && (
                <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/80">Your run</div>
                    <div className="text-cyan-300 font-semibold">{lastRunSummary.score} pts</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/70">
                    <div>Time: <span className="text-white/90">{lastRunSummary.clearTime.toFixed ? lastRunSummary.clearTime.toFixed(2) : lastRunSummary.clearTime}s</span></div>
                    <div>Enemies: <span className="text-white/90">{lastRunSummary.enemiesDestroyed}</span></div>
                    <div>Hits/Shots: <span className="text-white/90">{lastRunSummary.hits}/{lastRunSummary.shotsFired}</span></div>
                  </div>
                </div>
              )}
              <p className="text-sm text-white/60 mb-3">Top scores from recent runs. Sign in to post yours.</p>
              <div className="space-y-2 max-h-[50vh] overflow-auto scrollable" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
                {leaderboardData.length === 0 && (
                  <div className="text-white/60 text-sm">No records yet.</div>
                )}
                {leaderboardData.map((rec, idx) => (
                  <div key={rec.id || idx} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                    <div className="text-sm">
                      <div className="font-medium">{rec.name || 'Anonymous'}</div>
                      {rec.clearTime != null && (
                        <div className="text-white/60 text-xs">Time: {rec.clearTime.toFixed ? rec.clearTime.toFixed(2) : rec.clearTime}s</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-cyan-300 font-semibold">{rec.score ?? 0} pts</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        /* Ensure AR UI overlay container fills screen and stays above WebXR canvas */
        #ar-ui-container {
          position: fixed;
          inset: 0;
          z-index: 40; /* below modals, above renderer */
          pointer-events: none; /* let children opt-in */
        }
        #ar-ui-container * {
          -webkit-tap-highlight-color: transparent; /* iOS tap highlight */
        }
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .joystick-btn {
          position: absolute;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.6rem;
          color: white;
          user-select: none;
          touch-action: manipulation; /* iOS: allow quick taps without delay */
          cursor: pointer;
          z-index: 50;
          pointer-events: auto; /* re-enable on interactive controls */
        }
        .joystick-btn:active {
          background: rgba(255, 255, 255, 0.22);
        }
        .shoot-btn {
          width: 70px;
          height: 70px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: white;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(6px);
          cursor: pointer;
          user-select: none;
          touch-action: manipulation;
          z-index: 55;
          pointer-events: auto;
        }
        .shoot-btn:active {
          transform: scale(0.98);
          background: rgba(255, 255, 255, 0.22);
        }
        .highlight {
          box-shadow: 0 0 0 2px rgba(56,189,248,0.5);
          background: rgba(56,189,248,0.1);
          transition: box-shadow 0.2s ease, background 0.2s ease;
        }
        .pulse-outline {
          animation: pulseOutline 1.2s ease-out 1;
        }
        @keyframes pulseOutline {
          0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); }
          100% { box-shadow: 0 0 0 18px rgba(74,222,128,0); }
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
        /* Ensure top bar and buttons in AR can receive input */
        #ar-ui-container button {
          pointer-events: auto;
        }
        #joystick-container {
          pointer-events: none; /* container transparent */
        }
      `}</style>
    </div>
  );
}