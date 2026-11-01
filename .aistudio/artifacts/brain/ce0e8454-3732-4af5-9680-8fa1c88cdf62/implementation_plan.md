# Toy Circuit: Manzini-Ezulwini Racing — Forza & The Crew Level of Detail

An open-world physics racing simulation set in the real Manzini to Ezulwini Eswatini corridor, elevated to **Forza Horizon** and **The Crew** grade fidelity: real-time live vehicle telemetry, deep mechanical tuning (dampers, camber, gear ratios, differential lock), dynamic 24-hour day/night cycle and tropical weather, active aerodynamics, brake rotor thermals, cockpit instrument view, speed camera traps, drift zones, festival checkpoint arches, and cinematic photo mode.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The plan is upgraded to incorporate **Forza Horizon** and **The Crew** level depth across visuals, telemetry, vehicle dynamics, festival event structures, and world atmosphere while maintaining 100% client-side, zero-API-key execution.

- **Confirmed Decision 1: Forza-Grade Telemetry & Cockpit View**:
  - Live Forza Telemetry HUD (toggleable with `T` or Controller D-Pad): Real-time lateral/longitudinal G-meter, 4-wheel telemetry (tire temperature in °C, vertical load in Newtons, tire slip ratio %, slip angle °, suspension travel in cm/%, and F/R drive torque split).
  - First-person cockpit camera with functional analog tachometer & speedometer dials, digital gear display, steering wheel synchronized with player inputs, and animated driver hands.
- **Confirmed Decision 2: Deep Mechanical Tuning Suite (Forza Workshop)**:
  - Full customizable tuning parameters:
    - **Tires**: Front & Rear PSI (affects contact patch stiffness & rolling resistance).
    - **Gearing**: Final drive ratio plus individual 1st through 6th gear step ratios.
    - **Alignment**: Camber angle (-3.5° to 0.0°), Toe angle, Caster.
    - **Anti-Roll Bars (ARB)**: Front and Rear stiffness (fine-tunes oversteer vs understeer).
    - **Springs & Ride Height**: Ride height (ground clearance), spring rate (N/mm).
    - **Damping**: Bump stiffness (compression absorption) and Rebound stiffness.
    - **Aero**: Front splitter and rear wing downforce adjustment (kgf).
    - **Brakes**: Front/Rear brake bias % and master line pressure.
    - **Differential**: Acceleration lockup % and Deceleration coast lockup %.
- **Confirmed Decision 3: Dynamic Atmosphere & Weather (The Crew / Forza Day-Night Cycle)**:
  - Continuous 24-hour time of day: Dawn golden hour, blazing African midday sun, dramatic sunset silhouette behind the Mdzimba ridge, dusk, and starry night with sodium-vapor streetlights illuminating the MR3 highway.
  - Dynamic Weather System: Clear, Overcast, and Tropical Rainstorm with wet tarmac PBR reflections, water puddles causing hydroplaning drag, tire spray rooster tails, and windshield rain droplet streaks.
- **Confirmed Decision 4: Forza Horizon World Activities & Visual Detailing**:
  - **Speed Traps**: Radar camera gantries along MR3 with speed flash and record popups.
  - **Drift Zones**: Marked winding road sections through Ezulwini valley with real-time drift angle & speed score multipliers.
  - **Danger Sign Jumps**: Elevated ramp jumps with distance trajectory tracking.
  - **Active Aero & Thermal FX**: Animated active rear wing that lifts into an airbrake during hard braking; glowing red brake rotors under sustained high-speed braking; exhaust pops, backfires, and flame bursts on deceleration.
  - **Cinematic Photo Mode**: Freeze-frame free-orbit camera, focal length (FOV), shutter speed, exposure, and color grading filters (Vibrant, Eswatini Sunset, Monochrome, 35mm Film).
  - **Local Traffic**: Ambient vehicles adhering to Eswatini left-hand driving rules, including iconic Eswatini minibus taxis (combis), utility bakkies, and freight trucks.

---

## 1. Overview & Core Concept

- **What It Does**: An expansive, open-world driving and racing simulator faithfully recreating the 18+ km Eswatini corridor connecting Manzini, Matsapha, Malkerns, Lobamba, Mantenga, Ezulwini, and the Malagwane ascent toward Mbabane. Blends the accessible pick-up-and-play joy of *The Crew* with the handling nuance, mechanical telemetry, and visual polish of *Forza Horizon*.
- **Target Audience**: Players who love realistic automotive physics, tactical drifting, deep garage engineering, controller haptics, and exploring real-world open terrains.
- **Key Value**: Delivers console-caliber racing depth, true-to-life telemetry, dynamic weather, and tactile rumble feedback entirely in the browser without plugins, servers, or external API keys.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Horizon-Style Festival Free Roam**:
   - Drive anywhere across the open corridor without artificial walls: cut through Matsapha industrial yards, cruise the MR3 highway at 250 km/h, or powerslide through Malkerns farm trails.
   - Pass through roadside speed camera traps to trigger high-speed radar flashes and see speed scoreboards.
   - Enter neon-lit race gates to launch curated events:
     - *Manzini Street Sprint* (tight urban grid corners).
     - *MR3 Highway Cannonball* (high-speed traffic weaving).
     - *Ezulwini Valley Hillclimb* (curving elevation sweeps).
     - *Malkerns Agricultural Rally* (mixed gravel/dirt slides).
     - *Malagwane Downhill Touge* (intense mountain descent).

2. **Cockpit & Cinematic Camera Rig**:
   - Cycle 5 distinct perspectives with Square button / `C` key:
     1. **Dynamic Chase Near**: Tight follow with speed-sensitive FOV widening.
     2. **Dynamic Chase Far**: Broad cinematic view showcasing active aero and tire smoke.
     3. **Cockpit Interior**: Working steering wheel, functional analog speedometer/tachometer gauges, and rearview mirror.
     4. **Hood / Bumper**: Ultra-low, high-velocity road presence.
     5. **Cinematic Helicopter / Drone**: Smooth overhead broadcast view.

3. **Forza Live Telemetry Overlay**:
   - Toggleable telemetry view (`T` key or Controller D-Pad Up):
     - **Friction Circle (G-G Diagram)**: Shows instant lateral and longitudinal G-forces with peak hold circle.
     - **Tire Heat & Pressure**: 4 thermal color-coded tires (Blue cold, Green optimal 90°C, Red overheated 125°C) with real-time pressure in PSI.
     - **Suspension Travel**: Real-time displacement bars showing dive, squat, and body roll in millimeters.
     - **Traction & Slip**: Percentage slip ratio (wheelspin) and slip angle (drift angle in degrees).
     - **Power & Torque**: Real-time dyno output (kW, Nm, and current RPM).

4. **In-Depth Garage Tuning Workshop**:
   - Tabbed engineering workshop:
     - *Overview & Dyno*: Power curve graph, top speed estimate, 0–100 km/h acceleration time, skidpad lateral G rating.
     - *Tuning Sliders*: Real-time calculation of suspension natural frequencies, spring stiffness, brake bias percentage, and final drive ratio.
     - *Cosmetic & Aero*: Body paint colors (Metallic, Pearlescent, Matte, Carbon), wheel rim finishes, brake caliper colors, window tint, and aero wings.

5. **Cinematic Photo Mode**:
   - Press `P` or Controller D-Pad Down at any moment to pause physics and enter Photo Mode.
   - Free camera movement with collision detection against ground.
   - Controls:
     - Aperture / Depth of Field focus distance.
     - Focal length / Zoom (18mm wide-angle to 200mm telephoto).
     - Exposure compensation and Contrast sliders.
     - Color profiles: Standard, Horizon Vibrant, Golden Sunset, Noir.
     - Instant snapshot export (download crisp PNG screenshot without HUD).

### Visual Identity & Atmosphere

- **Aesthetic Direction**: *Forza Horizon* vibrancy meets the organic beauty of Eswatini's scenic geography. Rich sun-drenched landscapes, sweeping valley vistas, glistening wet tarmac with screen-space puddle reflections, and sharp metallic vehicle surfaces.
- **Lighting & Post-Processing Pipeline**:
  - Directional Sun with PCF Soft Shadows dynamically cast across vehicle body lines.
  - Dynamic sky dome with Rayleigh/Mie atmospheric scattering (sunrise, noon, golden sunset, starry night).
  - PBR clearcoat materials with procedural studio reflections.
  - Screen effects: Motion blur on wheel spokes, heat distortion near exhaust tips, speed radial blur lines at > 180 km/h, and water droplet streaks during rain.
- **Color Palette**:
  - Asphalt & Roadways: Deep tarmac black (`#121316`), weathered highway grey (`#2C2F36`), reflective white/yellow road stripes.
  - Eswatini Landscape: Malagwane mountain granite (`#4B5563`), Ezulwini valley emerald (`#15803D`), Matsapha red dirt (`#B45309`), cane field amber-green (`#84CC16`).
  - Racing Accents: Horizon festival yellow (`#FACC15`), neon cyan (`#06B6D4`), tachometer redline (`#EF4444`).

---

## 3. Key Product Decisions & Trade-Offs

- **Vehicle Dynamics Model (Pacejka 'Magic Formula' + Raycast Suspension)**:
  - *Chosen Approach*: Implement a full Pacejka non-linear tire friction model balancing longitudinal traction (acceleration/braking) and lateral cornering force based on slip angle and normal load.
  - *Why*: Delivers authentic *Forza*-style weight transfer, where trail-braking loads the front tires to cure understeer, and aggressive throttle over-powers the rear contact patch to initiate smooth, catchable drifts.
- **Thermal & Visual Vehicle Effects**:
  - *Chosen Approach*: Track brake rotor temperature (°C) per wheel based on kinetic energy dissipation, driving emissive orange/red rotor glow when temperature exceeds 450°C. Track engine exhaust temperature and throttle lift-off to trigger backfire sound pops and flame bursts.
  - *Why*: Elevates the visual drama to AAA racing game standards without impacting frame rates.
- **Dynamic 24h Lighting & Weather Engine**:
  - *Chosen Approach*: Single unified shader environment calculating sky colors, sun direction, ambient light intensity, and wetness factor (0 = bone dry, 1 = saturated rain). Wetness modulates material roughness (down to 0.05 for mirror puddles) and tire grip coefficients.
  - *Why*: Creates dramatic environmental variety across the long corridor run without needing separate pre-baked skybox textures.
- **Procedural Traffic & Activity Nodes**:
  - *Chosen Approach*: Lightweight AI traffic vehicles running on waypoint lane splines with proximity sensors, alongside roadside speed traps and drift zone boundaries triggered by spatial bounding volumes.
  - *Why*: Fills the open corridor with bustling life and organic *Forza*-style gameplay without heavy CPU overhead.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Angular UI & Game Shell                            │
│  (Zoneless Render Loop, State Signals, Fullscreen HUD, Horizon Overlay)     │
└──────────────┬───────────────────────────────┬──────────────────────────────┘
               │                               │
               ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────────┐
│     Input & Haptics Engine    │ │          Dynamic Audio Engine             │
│ ┌───────────────────────────┐ │ │ ┌───────────────────────────────────────┐ │
│ │ DS4 Gamepad & Touch Input │ │ │ │ Polyphonic Web Audio Engine Synth     │ │
│ │ • Analog Triggers & Stick │ │ │ │ • 4 Harmonic RPM Oscillators          │ │
│ │ • D-Pad Telemetry/Photo   │ │ │ │ • Turbo Spool & Blow-Off Flutter      │ │
│ └─────────────┬─────────────┘ │ │ │ • Exhaust Deceleration Crackles & Pops│ │
│               ▼               │ │ │ • Tire Skid & Surface Rumble Noise    │ │
│ ┌───────────────────────────┐ │ │ │ • Speed Trap Radar Beep & Lap Chimes  │ │
│ │ Forza-Style Haptic Mixer  │ │ │ └───────────────────────────────────────┘ │
│ │ • RPM Engine Vibration    │ │ └───────────────────────────────────────────┘
│ │ • ABS Trigger Stutter     │ │
│ │ • Drift Angle High-Freq   │ │
│ │ • Road Kerb Impact Pulses │ │
│ └───────────────────────────┘ │
└───────────────┬───────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Advanced Vehicle Physics & Tuning Core                    │
│ • Fixed 60 Hz Timestep with Sub-Step Accumulator                            │
│ • 4-Wheel Raycast Suspension with Spring/Damper & Camber Geometry           │
│ • Pacejka Lateral/Longitudinal Combined Slip Grip Equations                 │
│ • Full Mechanical Tuning: Gears, ARB, Springs, Dampers, Differential Lock   │
│ • Thermal Simulation: Brake Rotor Heat, Engine Coolant, Tire Surface Temp   │
│ • Active Aero: Rear Wing Deployment & Airbrake Braking Angle                │
│ • Exhaust Backfire & Pop-and-Bang Flame Trigger Logic                       │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Three.js Open-World Render Pipeline                     │
│ • Dynamic 24h Sun/Sky Dome & Tropical Rain Weather Engine                   │
│ • Procedural High-Detail Vehicles (Cockpit, Glass, Calipers, Active Aero)   │
│ • Manzini to Ezulwini Corridor: Dual Carriageway MR3, Mzimene River Bridge, │
│   Matsapha Warehouses, Malkerns Fields, Lobamba Landmarks, Malagwane Pass   │
│ • 12-Class PBR Ground Textures with Dynamic Wetness & Puddle Reflections    │
│ • Particle Systems: Tire Smoke, Rain Streaks, Exhaust Flames, Water Spray   │
│ • Speed Traps, Drift Zone Holographic Neon Arches & Radar Flash VFX         │
│ • Cinematic Photo Mode: 360° Free Camera, FOV, DOF, and Color Grading       │
│ • Live Forza Telemetry HUD (G-G Diagram, Slip Ratios, Tire Thermals)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Modules & Components

1. **`VehiclePhysicsEngine`**:
   - `VehicleState`: Position, orientation, velocity, angular velocity.
   - `SuspensionWheel`: Raycast distance, spring force, damper rebound/bump, camber angle, road surface tag.
   - `TireModel`: Pacejka equation calculating $F_x$ (traction/braking) and $F_y$ (cornering force) with friction circle clamping.
   - `Drivetrain`: Engine RPM (800–8500), torque curve lookup, 6-speed transmission, open/limited-slip differential model.
   - `ThermalModel`: Brake rotor temperature, tire surface temperature, exhaust gas temperature.
2. **`TuningService`**:
   - Manages custom setup presets (Stock, Drift Spec, High-Speed Highway, Off-Road Rally).
   - Real-time adjustment of tire pressures, gear ratios, camber, anti-roll bars, spring rates, ride heights, dampers, aero downforce, brake bias, and differential lock percentages.
3. **`EnvironmentWeatherService`**:
   - 24-hour sun time slider (0.0 to 24.0 hours) with realistic sun position, sky color transition, and street lighting activation.
   - Weather modes: Clear Sunshine, Overcast Sunset, Tropical Rainstorm.
   - Dynamic wetness factor controlling road specular sheen, tire rooster tails, and puddle hydroplaning.
4. **`ForzaTelemetryService`**:
   - Computes lateral/longitudinal G-forces, suspension travel percentages, wheel rotational speeds, tire slip angles, and dyno output.
   - Feeds the live telemetry HUD panel and G-G friction circle.
5. **`HorizonFestivalService`**:
   - Manages world speed traps (measures velocity through radar gates, flashes screen, records personal top speed).
   - Manages drift zones (accumulates drift points based on continuous slip angle, vehicle speed, and line proximity).
   - Manages danger sign ramp jumps (tracks launch speed, air time, and distance landed).
6. **`PhotoModeService`**:
   - Free camera orbit around car with keyboard/gamepad panning, altitude adjustment, FOV zoom, depth-of-field, color grading filters, and full-resolution screenshot export.
7. **`TrafficSimulator`**:
   - Spawns ambient vehicles (sedans, trucks, combis) traveling in left-hand lanes along MR3 and district roads with collision awareness.
8. **`EswatiniMapService`**:
   - Interactive zoomable vector map with district labels (Manzini, Matsapha, Malkerns, Lobamba, Ezulwini, Mbabane), POIs, live car tracking, and GPS route guidance.
9. **`PipelineToolsService`**:
   - In-app inspector for the offline data pipeline (`osm_export.sh`, `world_prep.py`, `blender_build_terrain.py`), displaying DEM profiles and 12-class ground coverage statistics.

---

## 5. Phased Implementation Roadmap

1. **Phase 1: Advanced Vehicle Dynamics & Forza Telemetry Engine**:
   - Raycast suspension with Pacejka friction, weight transfer, and 6-speed drivetrain.
   - Brake disc thermal simulation (glowing rotors), active aero spoiler, and exhaust flame pops.
   - Complete live telemetry service (G-G friction circle, tire thermals, slip angles).
2. **Phase 2: Comprehensive Garage Tuning Workshop**:
   - Tuning UI with sliders for tire PSI, gear ratios, alignment camber/toe, anti-roll bars, springs, dampers, aero downforce, brake bias, and differential lock.
   - Real-time dyno chart and performance statistics recalculation.
3. **Phase 3: 24h Day-Night Cycle, Tropical Rain & PBR Environment**:
   - Dynamic sun/sky system with lighting transitions from dawn to starry night.
   - Tropical rainstorm weather with wet road PBR puddles, reflections, and tire spray particles.
   - Eswatini corridor world (Manzini, Matsapha, Malkerns, Lobamba, Ezulwini, Malagwane) with 12-class ground system and Mzimene bridge.
4. **Phase 4: DualShock 4 Haptic Mixer & Polyphonic Web Audio Engine**:
   - Web Gamepad dual-rumble mixer with engine RPM hum, ABS trigger pulses, drift vibration, and collision jolts.
   - Web Audio polyphonic synthesizer with turbo flutter, exhaust backfire pops, tire skid squeals, and wind roar.
5. **Phase 5: Horizon Festival Events & Ambient Traffic**:
   - Radar speed traps with camera flash and speed records.
   - Drift zones with live multiplier scoring.
   - Ambient traffic vehicles (sedans, trucks, and Eswatini combis) with left-hand drive navigation.
6. **Phase 6: Cockpit View, Cinematic Photo Mode & Interactive Map**:
   - Cockpit interior camera with working analog/digital gauges and steering wheel.
   - Freeze-frame Photo Mode with free camera, FOV zoom, DOF aperture, filters, and PNG export.
   - Zoomable vector map with GPS waypoints, fast travel, and minimap HUD.
   - Pipeline tools tab for reviewing DEM/OSM compiler scripts.
7. **Phase 7: Verification, Mobile Optimization & Polish**:
   - Verify 60 FPS performance, touch controls, audio unlocking, and zero-error compilation.
