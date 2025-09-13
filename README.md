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

Notes
-----
This README will continue to evolve as AI integrations, image tooling, and 3D conversion features are added. For now, the project focuses on the home page and hangar UX.