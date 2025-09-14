## Inspiration
Most 3D design tools are desktop-first and heavy. I wanted a phone-first workflow to sketch an idea, iterate quickly with AI, view it in AR, and then play with it—without a workstation or VR setup.

## What it does
Aircraft Studio is a mobile-focused studio for prototyping and testing aircraft:
- Create/select an aircraft in the Hangar
- Use text prompts to guide design decisions
- Generate concept images fast (Fireworks Flux 1)
- Convert images to lightweight 3D (`.glb`) for quick previews (Spar 3D)
- Review and enter an AR simulation to fly, shoot, and clear waves
- Submit runs to a global leaderboard backed by MongoDB
- Share a QR code for quick mobile access

Current prototype focuses on the home page, Hangar flow, and a responsive AR-style kinematic simulation loop.

## How I built it
- Frontend: Next.js (mobile-first UI)
- Auth: Auth0 (optional; guest mode supported)
- Data: MongoDB Atlas for global leaderboard
- Client storage: IndexedDB for local model blobs (`aircraft-studio/models`)
- AI integrations:
  - Groq for engineering prompt assistance, name and stats extraction
  - Fireworks Flux 1 for image generation
  - Spar 3D for image-to-3D conversion
- AR approach: WebXR-style camera + anchored model preview; kinematic motion loop optimized for phones

## Sponsor tracks
- Groq: Prompt-engineering endpoint powers aircraft stats and naming in `src/pages/api/prompt-engineering.js`.
- Windsurf: Built and iterated entirely in an AI‑native IDE workflow to accelerate feature delivery. Worked as a solo, and 70~80% of the code came from vibe coding.
- MongoDB Atlas: Backs the global leaderboard with server-side queries (`src/pages/leaderboard.js`, `src/lib/mongodb.js`).
- Auth0: Optional Google login enables authenticated run submissions; guest play remains supported.

## Technical highlights
- Mobile-first UX: touch-first controls, small UI footprint, quick iteration
- Kinematic flight model: responsive motion without full aero sim
  - Smoothed velocity targets, clamped rates, joystick-driven yaw/pitch/roll
- Lightweight effects: audio cues and hit markers to keep FPS high on phones
- Telemetry scaffolding: documented event shapes for sessions, frames, collisions, and gameplay—designed for batched posting and on-device sampling
- Enhanced prompt with Groq, text to image with Flux 1, and image to 3D with Spar 3D.

## Challenges
- Balancing realism vs. responsiveness for phone AR
- Setting up the physical engine for the AR mode, making the jet move, rotation, attack, enemy jets, applying stats, etc.
- Making the pipeline “fast enough to iterate”: prompt → image → `.glb` → preview → play
- Keeping the stack simple while leaving room for AI/3D integrations

## Accomplishments I’m proud of
- A clean, phone-first flow that gets from idea to playable prototype quickly
- A leaderboard that works with or without login (submission requires auth)
- Clear telemetry schema for future tuning and analytics
- A pragmatic AR loop that performs well on mid-range devices

## What I learned
- How far you can get with kinematics before needing full aero
- Practicalities of local caching (IndexedDB) for heavy model blobs
- The tradeoffs of optional auth in a game-like flow

## What’s next
- Physics: optional gravity, basic lift and drag, simple stall modelling
- Collisions: convex hulls or per-part hitboxes
- AI: tighter integration with Groq + Flux 1 for “design and iterate” loops
- 3D: more robust Spar 3D conversion and materials pipeline
- Multiplayer: shared anchors for basic dogfights
- Deeper analytics: flight envelopes, trim curves, auto-tuning from telemetry

## Try it locally
Requirements
- Node.js 18+
- macOS/Chrome recommended for camera permissions

1) Clone and install:
```bash
git clone https://github.com/YehyunLee/aircraft-studio.git
cd aircraft-studio
npm install
```

2) Add environment variables in `.env.local` (see `README.md` for details):
- `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`
- `MONGODB_URI`, `MONGODB_DB`, `NEXT_PUBLIC_BASE_URL`, etc.

You can run as a guest without Auth0, but leaderboard submission requires login. MongoDB is needed for leaderboard to function.

3) Start the dev server with HTTPS (needed for camera/AR):
```bash
npx next dev --experimental-https
```

## Built with
- `Next.js`
- `Auth0`
- `MongoDB`
- `IndexedDB`
- `Groq`
- `Fireworks Flux 1`
- `Spar 3D`
- `WebXR`
