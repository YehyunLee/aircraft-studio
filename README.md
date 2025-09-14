# Aircraft Studio

Design, engineer, and simulate aircraft — mobile-first.

Overview
--------
Aircraft Studio is a mobile-focused studio for designing and testing aircraft. The app helps users create or select aircraft, iterate quickly with AI-assisted image generation, and convert concept images into 3D models for review and AR simulation.

Key user flows
--------------
- Create or select an existing aircraft.
- Create using text prompts with Groq to assist engineering decisions.
- Generate concept imagery rapidly with Fireworks Flux 1 and iterate visually.
- Convert images to 3D (`.glb`) using Spar 3D for previews and quick play.
- Review, refine, and finalize designs.
- Enter AR simulation to pilot, move, and shoot in friendly matches. Record stats and view leaderboards after runs.
- Provide a QR code for quick mobile access.

Technologies (planned/current)
------------------------------
- Groq — AI text support for engineering prompts
- Fireworks Flux 1 — fast image generation
- Spar 3D — image-to-3D (`.glb`) conversion
- Next.js — frontend framework (this repository)

Design & UX
-----------
- Mobile-first: UI and interactions are optimized for phones and touch.
- Studio vibe: clean, tech-forward visuals and quick iteration paths.

Current focus
-------------
- Building a mobile-first home page and a Hangar experience for creating/selecting aircraft. See `src/pages/index.js` and `src/pages/aircraft.js`.

Authentication (Auth0)
----------------------
This app uses Auth0 for optional sign-in. Visit `/login` to either continue as a guest (no account) or sign in with Google. After signing in, you'll land back on the home page; the header shows your name (if available) and a Logout link.

Environment variables (see `.env.local.example`):

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_SECRET` (generate with `openssl rand -hex 32`)
- `APP_BASE_URL` (e.g., `http://localhost:3000`)

Ensure the Google connection is enabled in your Auth0 tenant and named `google-oauth2` (default). The bottom nav now includes a Leaderboard tab.

Database (MongoDB)
------------------
We use MongoDB Atlas (or a local MongoDB) for the global leaderboard.

Environment variables (add to `.env.local`):

- `MONGODB_URI` — e.g. `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
- `MONGODB_DB` — database name, e.g. `aircraft-studio`
- `NEXT_PUBLIC_BASE_URL` — for SSR fetching, e.g. `https://localhost:3000`

Install dependency:

```bash
npm install mongodb
```

Collections created as needed:

- `leaderboard` — stores per-run documents with fields: `user`, `score`, `clearTime`, `enemiesDestroyed`, `shotsFired`, `hits`, `accuracy`, `model`, `createdAt`.

Leaderboard
-----------
- Route: `/leaderboard`
- Global: Uses MongoDB-backed API to fetch top scores across all users.
- Submit: Simulation page posts to `/api/leaderboard/submit` after a wave is cleared. Requires Auth0 login.
- View: Server-side fetch from `/api/leaderboard/top` to render the board.

Notes
-----
This README will continue to evolve as AI integrations, image tooling, and 3D conversion features are added. For now, the project focuses on the home page and hangar UX.

Physics model (current behavior)
--------------------------------
The current AR experience uses a kinematic motion model focused on responsiveness and mobile performance. Specifically:

- No gravity is simulated at this time. Vertical velocity is damped toward zero rather than accelerated downward.
- Forward, lateral, and vertical motion are driven by simple velocity targets with smoothing and clamping.
- Joystick input directly influences yaw/pitch/roll and slightly adjusts the forward speed for a flyable feel.
- There is no lift/drag/thrust integration yet; movement is not an aerodynamic simulation.
- Collisions are not physically resolved; gameplay elements (shots, hits, explosions) are handled with lightweight checks and visuals.

This is an intentional baseline to keep the AR loop smooth on phones. The roadmap includes optional gravity, basic lift, and more physical behaviors behind a performance-friendly model.

AR simulation (how it works)
-----------------------------
The AR flow is designed to be intuitive and performant on phones:

- Load a `.glb` aircraft: We import your generated 3D model and set up basic materials and colliders.
- Detect a surface: Using the device AR APIs (e.g., ARKit/ARCore via WebXR), we detect planes (like floors or tables).
- Anchor and scale: We place an anchor where you tap, align the aircraft to the plane, and scale it to a sensible size.
- Lighting estimation: We adapt materials and shadows to match the real-world lighting for better realism.
- Controls to flight: Touch/virtual joysticks map to throttle and surfaces; device orientation can optionally assist aiming/steering.
- Simulation loop: Each frame we read device pose/anchors, update kinematic motion (no gravity), and render the result in the camera feed.
- Effects: Simple audio, particles, and hit markers keep feedback responsive without heavy GPU cost.

What we track (telemetry & state)
---------------------------------
To power replays, tuning, and leaderboards, we track high-level, non-sensitive data during sessions:

- Session
  - Device pose stability and frame rate (to monitor AR quality)
  - Plane/anchor updates (for debugging placement drift)
- Aircraft state
  - Position, velocity, acceleration
  - Orientation and angular rates
  - Control inputs (throttle, elevator, aileron, rudder)
  - Health/energy, ammo, fuel/battery (if enabled)
- Environment
  - No gravity currently (planned as an option); wind is also planned but not implemented
  - Collisions and contacts (simplified for gameplay cues)
  - Lighting estimates (coarse)
- Gameplay
  - Score, hits, time alive, objectives
  - Match ID, aircraft ID/version

Data schema (rough)
-------------------
Below are lightweight, implementation-agnostic shapes. These are intended for on-device logging and optional upload.

- SessionStart
  ```json
  {
    "type": "session_start",
    "timestamp": 1699999999999,
    "sessionId": "sess_01H...",
    "userId": null,
    "device": { "platform": "ios|android|web", "model": "iPhone14,2", "os": "17.5" },
    "app": { "version": "0.1.0" },
    "aircraft": { "id": "acft_abc123", "version": "v1", "name": "Falcon-X" },
    "ar": { "api": "webxr|arkit|arcore", "worldAlignment": "gravity", "scale": 1.0 }
  }
  ```

- FrameSample (sampled at 5–20 Hz)
  ```json
  {
    "type": "frame_sample",
    "timestamp": 1700000000123,
    "sessionId": "sess_01H...",
    "fps": 58,
    "anchors": { "planeCount": 2, "updated": 1 },
    "poseQuality": { "tracking": "normal|limited", "jitter": 0.003 },
    "aircraft": {
      "pos": { "x": 1.2, "y": 0.8, "z": -3.4 },
      "vel": { "x": 4.1, "y": 0.0, "z": -0.3 },
      "acc": { "x": 0.2, "y": 0.0, "z": -0.1 },
      "oriQuat": { "x": 0.0, "y": 0.707, "z": 0.0, "w": 0.707 },
      "angVel": { "x": 0.0, "y": 0.1, "z": 0.0 },
      "controls": { "throttle": 0.7, "aileron": -0.15, "elevator": 0.1, "rudder": 0.0 },
      "health": 100, "fuel": 0.82
    },
    "env": { "gravity": 9.81, "wind": { "x": 0.0, "y": 0.0, "z": 0.5 } }
  }
  ```

- Collision
  ```json
  {
    "type": "collision",
    "timestamp": 1700000000456,
    "sessionId": "sess_01H...",
    "with": "environment|projectile|aircraft",
    "impulse": 120.5,
    "hitbox": "fuselage|wing_l|wing_r|tail",
    "position": { "x": 1.0, "y": 0.7, "z": -3.0 }
  }
  ```

- GameplayEvent
  ```json
  {
    "type": "gameplay_event",
    "timestamp": 1700000000789,
    "sessionId": "sess_01H...",
    "event": "hit|score|objective|respawn",
    "detail": { "target": "bot_12", "damage": 15, "scoreDelta": 10 }
  }
  ```

- SessionEnd
  ```json
  {
    "type": "session_end",
    "timestamp": 1700000010000,
    "sessionId": "sess_01H...",
    "durationMs": 250000,
    "summary": { "kills": 2, "hits": 14, "timeAliveMs": 220000, "avgFps": 55 }
  }
  ```

Example payloads
----------------
- Minimal sample for a single short run:
  ```json
  [
    { "type": "session_start", "timestamp": 1700000000000, "sessionId": "sess_X", "aircraft": { "id": "acft_a", "version": "v1" }, "device": { "platform": "web" }, "ar": { "api": "webxr" } },
    { "type": "frame_sample", "timestamp": 1700000000100, "sessionId": "sess_X", "fps": 60, "aircraft": { "pos": {"x":0,"y":1,"z":0}, "vel": {"x":0.1,"y":0,"z":0}, "oriQuat": {"x":0,"y":0,"z":0,"w":1}, "controls": {"throttle":0.4,"aileron":0,"elevator":0,"rudder":0} }, "env": {"gravity":9.81} },
    { "type": "gameplay_event", "timestamp": 1700000000500, "sessionId": "sess_X", "event": "score", "detail": { "scoreDelta": 5 } },
    { "type": "session_end", "timestamp": 1700000005000, "sessionId": "sess_X", "durationMs": 5000, "summary": { "kills": 0, "hits": 1, "timeAliveMs": 4800, "avgFps": 58 } }
  ]
  ```

Storage/transport notes
-----------------------
- Local caching: We currently use IndexedDB only for model blobs via `src/lib/idbModels.js` (DB `aircraft-studio`, store `models`). Telemetry storage is not yet implemented; a dedicated store like `telemetry` can be added later.
- Transport: Batched POST of arrays (e.g., 50–200 events) with backoff. Compress when possible.
- Sampling: Frame samples at lower rate on low battery or thermal pressure.

Notes on privacy and performance
--------------------------------
- We avoid collecting personally identifiable information (PII) in telemetry. If a future feature requires it, we will make it opt-in and clearly documented.
- On-device processing is preferred for physics and AR alignment to minimize latency.
- Data sampling rates are capped to protect battery life on mobile.

Roadmap improvements
--------------------
- Richer aero: per-wing/per-control-surface coefficients, stall modeling, and compressibility at higher speeds.
- Better collisions: simple convex hulls or per-part hitboxes.
- Networked AR: shared anchors for multiplayer dogfights.
- Deeper analytics: flight envelopes, trim curves, and auto-tuning suggestions from telemetry.


### Command to run locally

```bash
npx next dev --experimental-https
```

### Platform & Infrastructure
https://app.fireworks.ai/
https://platform.stability.ai/
https://cloud.mongodb.com/
https://launchar.app/
https://app.netlify.com/

Windsulf
Groq
Auth0
MongoDB

Flux 1
Spar 3D