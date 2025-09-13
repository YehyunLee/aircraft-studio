import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function Simulation() {
  const containerRef = useRef();
  const [isARSupported, setIsARSupported] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [error, setError] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // AR session refs
  const rendererRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const sessionRef = useRef();
  const aircraftRef = useRef();

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

        const pose = frame.getViewerPose(refSpace);
        if (pose) {
          const view = pose.views[0];
          const viewport = session.renderState.baseLayer.getViewport(view);
          renderer.setSize(viewport.width, viewport.height);
          
          camera.matrix.fromArray(view.transform.matrix);
          camera.projectionMatrix.fromArray(view.projectionMatrix);
          camera.updateMatrixWorld(true);

          renderer.render(scene, camera);
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
      </div>

      <style jsx>{`
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}