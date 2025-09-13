import { Suspense, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
// Removed VR/XR imports to avoid runtime subscription issues in browsers without WebXR
import { useRouter } from "next/router";
import Head from "next/head";

// Loading component
function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center space-y-4">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-white text-sm">Loading 3D model...</div>
      </div>
    </Html>
  );
}

// Error boundary component
function ErrorFallback({ error }) {
  return (
    <Html center>
      <div className="text-center p-4 bg-red-500/20 rounded-lg border border-red-500/40">
        <div className="text-red-300 text-sm mb-2">Failed to load 3D model</div>
        <div className="text-red-400 text-xs">{error?.message || "Unknown error"}</div>
      </div>
    </Html>
  );
}

// Enhanced Joystick component with better mobile support
function Joystick({ onMove }) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const joystickRef = useRef();
  const startPos = useRef({ x: 0, y: 0 });

  const handleStart = (e) => {
    setIsDragging(true);
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Normalize pointer coordinates for mouse and touch events
    if (e && e.touches && e.touches[0]) {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e && typeof e.clientX === 'number') {
      startPos.current = { x: e.clientX, y: e.clientY };
    }

    handleMove(e);
  };

  const handleMove = (e) => {
    if (!isDragging) return;

    // Some callers pass a TouchEvent, some pass a MouseEvent, and earlier code passed touches[0].
    // Prevent default only if the event supports it.
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let clientX, clientY;
    if (e && e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e && typeof e.clientX === 'number') {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      // Nothing we can do
      return;
    }

    let x = (clientX - centerX) / (rect.width / 2);
    let y = (centerY - clientY) / (rect.height / 2);

    // Clamp to circle
    const distance = Math.sqrt(x * x + y * y);
    if (distance > 1) {
      x /= distance;
      y /= distance;
    }

    setPosition({ x, y });
    onMove(x, y);
  };

  const handleEnd = () => {
    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={joystickRef}
      className="fixed bottom-8 right-8 w-24 h-24 bg-white/20 rounded-full border-2 border-white/40 touch-none select-none z-50"
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => {
        // pass the full TouchEvent to the handler so it can read touches[0]
        e.preventDefault?.();
        handleStart(e);
      }}
      onTouchMove={(e) => {
        e.preventDefault?.();
        handleMove(e);
      }}
      onTouchEnd={handleEnd}
    >
      <div
        className="absolute w-8 h-8 bg-cyan-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-transform shadow-lg"
        style={{
          left: `${50 + position.x * 30}%`,
          top: `${50 - position.y * 30}%`,
        }}
      />
      {/* Direction indicators */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white/40 text-xs font-bold">↑</div>
      </div>
    </div>
  );
}

// Enhanced 3D Model component with error handling
function Model({ url }) {
  const [error, setError] = useState(null);
  const modelRef = useRef();

  try {
    const { scene, error: gltfError } = useGLTF(url);

    useEffect(() => {
      if (gltfError) {
        setError(gltfError);
      }
    }, [gltfError]);

    useFrame((state, delta) => {
      if (modelRef.current && !error) {
        // Optional: Add some rotation for non-AR mode
        // modelRef.current.rotation.y += delta * 0.2;
      }
    });

    if (error) {
      return <ErrorFallback error={error} />;
    }

    return <primitive ref={modelRef} object={scene} scale={1} />;
  } catch (err) {
    return <ErrorFallback error={err} />;
  }
}

// Camera controller for simulated AR movement with smoother controls
function ARCameraController({ moveVector }) {
  const { camera } = useThree();
  const velocity = useRef({ x: 0, y: 0, z: 0 });

  useFrame((state, delta) => {
    if (moveVector.x !== 0 || moveVector.y !== 0) {
      const speed = 0.15;
      const damping = 0.9;

      // Smooth movement with momentum
      velocity.current.x += moveVector.x * speed * delta;
      velocity.current.z += moveVector.y * speed * delta;

      velocity.current.x *= damping;
      velocity.current.z *= damping;

      camera.position.x += velocity.current.x;
      camera.position.z += velocity.current.z;
    } else {
      // Apply damping when no input
      velocity.current.x *= 0.8;
      velocity.current.z *= 0.8;

      camera.position.x += velocity.current.x;
      camera.position.z += velocity.current.z;
    }
  });

  return null;
}

// Main Scene component with better lighting
function SimulationScene({ modelUrl, isSimulatedAR, moveVector }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />

      {modelUrl && (
        <Suspense fallback={<LoadingFallback />}>
          <Model url={modelUrl} />
        </Suspense>
      )}

      {!isSimulatedAR && <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />}
      {isSimulatedAR && <ARCameraController moveVector={moveVector} />}

      {/* Enhanced ground plane for AR reference */}
      {isSimulatedAR && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshBasicMaterial
            color="#1a1a2e"
            transparent
            opacity={0.4}
            wireframe={false}
          />
        </mesh>
      )}

      {/* Grid helper for better spatial reference */}
      {isSimulatedAR && (
        <gridHelper
          args={[20, 20, "#ffffff", "#ffffff"]}
          position={[0, -0.99, 0]}
          opacity={0.1}
          transparent
        />
      )}
    </>
  );
}

export default function Simulation() {
  const router = useRouter();
  const { src, title } = router.query;
  const [isSimulatedAR, setIsSimulatedAR] = useState(false);
  const [moveVector, setMoveVector] = useState({ x: 0, y: 0 });
  const [webXRSupported, setWebXRSupported] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // Check WebXR support (kept for info but we won't subscribe to XR sessions)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-ar').then(supported => {
        setWebXRSupported(supported);
      }).catch(() => {
        setWebXRSupported(false);
      });
    }
  }, []);

  const handleMove = (x, y) => {
    setMoveVector({ x, y });
  };

  const enterSimulation = () => {
    // Instead of entering real AR (which causes runtime subscribe errors on some devices/browsers),
    // toggle a simulated AR camera mode which doesn't rely on WebXR sessions.
    setIsSimulatedAR(true);
  };

  const exitSimulation = () => {
    setIsSimulatedAR(false);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans">
      <Head>
        <title>{title ? `${title} – Simulation` : "Simulation"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <header className="p-4 flex items-center justify-between z-10 relative">
        <button
          onClick={() => router.back()}
          className="text-sm text-white/70 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-sm font-medium truncate max-w-[60%] text-center">
          {title || "Simulation"}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-sm text-white/60 hover:text-white px-2"
            title="Help"
          >
            ?
          </button>
          {!isSimulatedAR ? (
            <button
              onClick={enterSimulation}
              disabled={!webXRSupported && false}
              className={`text-sm px-3 py-1 rounded-lg font-medium transition-colors ${
                webXRSupported
                  ? 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                  : 'bg-cyan-500/10 text-cyan-200'
              }`}
            >
              Start Simulation
            </button>
          ) : (
            <button
              onClick={exitSimulation}
              className="text-sm text-red-300 hover:text-red-200 px-3 py-1 bg-red-500/20 rounded-lg"
            >
              Exit Simulation
            </button>
          )}
        </div>
      </header>

      {/* Instructions overlay */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-6">
          <div className="bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] rounded-2xl p-6 border border-white/10 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Simulation Instructions</h3>
            <div className="space-y-3 text-sm text-white/80">
              <div>
                <strong className="text-cyan-300">Desktop:</strong> Use mouse to orbit, zoom, and pan around the model
              </div>
              <div>
                <strong className="text-cyan-300">Mobile:</strong> Touch and drag to rotate, pinch to zoom
              </div>
              <div>
                <strong className="text-cyan-300">Simulation Mode:</strong> Use the joystick to move around in 3D space
              </div>
              <div>
                <strong className="text-cyan-300">Requirements:</strong> Modern browser. Real AR is not required for simulation.
              </div>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="mt-4 w-full px-4 py-2 bg-cyan-500/20 text-cyan-200 rounded-lg hover:bg-cyan-500/30"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      <main className="relative">
        {!src ? (
          <div className="p-6 text-center text-white/70">
            No model provided. Append ?src=/models/your.glb
          </div>
        ) : (
          <div className="w-full h-screen">
            <Canvas
              camera={{ position: [0, 0, 5], fov: 75 }}
              shadows={true}
              gl={{
                alpha: true,
                antialias: true
              }}
              onCreated={({ gl }) => {
                gl.setClearColor('#000000', 0);
                // guard access to shadowMap if three's gl implementation provides it
                if (gl.shadowMap) {
                  gl.shadowMap.enabled = true;
                  gl.shadowMap.type = gl.PCFSoftShadowMap;
                }
              }}
            >
              <SimulationScene modelUrl={src} isSimulatedAR={isSimulatedAR} moveVector={moveVector} />
            </Canvas>

            {/* Joystick for simulation movement */}
            {isSimulatedAR && <Joystick onMove={handleMove} />}

            {/* Simulation status indicator */}
            {isSimulatedAR && (
              <div className="absolute top-4 right-4 bg-green-500/20 text-green-300 px-3 py-1 rounded-lg text-sm border border-green-500/40">
                Simulation Active
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
