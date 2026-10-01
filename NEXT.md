# Next up for EGotchi

- [x] `useEffect`'s `setTimeout` in `App.js` had no cleanup and could stack multiple pending
  timers on fast re-renders. Fixed: switched to a single `setInterval` under an empty
  dependency array, with `clearInterval` cleanup and the decay guard moved into the
  functional `setCurrentFace(f => ...)` updater.
- [x] `getHappy` in `App.js` used a stale-closure `if (currentFace < 4)` guard with a
  hardcoded face count, and the placeholder `<Text>This is an app</Text>` didn't reflect
  app state. Fixed: the upper bound now lives inside the functional
  `setCurrentFace(f => ...)` updater and is derived from `FACE_COUNT` (exported from
  `Components/Face.js`), and the placeholder text is now a mood label driven by
  `FACE_LABELS[currentFace]`.
- The face images in `Components/Face.js` are hotlinked to
  `citweb.lethbridgecollege.ab.ca` — a school server that could go offline or block hotlinking
  at any time. Bundle the 5 face states as local assets under `assets/` instead.
- [x] Only one button existed ("Pet" -> `getHappy`), but the README describes feed/play
  mechanics. Done: the game is now a three-stat model (fullness / energy / fun) with distinct
  Feed, Play and Rest actions, per-action cooldowns and timestamp-based decay, all in pure
  CommonJS modules under `game/` that are unit-tested with `npm test`.
- Persistence is only half done. The persistence *layer* is built and tested
  (`serialize` / `deserialize` / `loadPet` / `savePet` with an injectable storage adapter, plus
  timestamp-based offline decay capped by `MAX_OFFLINE_MS`), and `createLocalStorageAdapter`
  gives real persistence on Expo web. Native builds still use the in-memory store, so the pet
  resets on every app restart there. Wire a real backend
  (`@react-native-async-storage/async-storage` via `createAsyncStorageAdapter`; needs a
  dependency addition, so flag to a human first).
- [x] Evolution stages driven by long-run average care, layered on `getMoodIndex`. Done:
  `game/petState.js` ages the pet through Egg -> Baby -> Child -> Teen -> Adult based on `ageMs`
  (cumulative time seen by `applyDecay`, so it respects the `MAX_OFFLINE_MS` cap the same as
  decay/sickness do), picks one of three adult forms (Radiant/Steady/Scruffy) from the long-run
  care average exactly once at the Teen->Adult transition, and never regresses a stage once
  reached. `Components/StageBadge.js` shows the current stage/form and time-to-next-stage in
  `App.js`, with a brief "Evolved!" banner on the tick/action that crosses a boundary.
- [x] A sickness/neglect state when any stat sits at 0 across several ticks. Done: `game/petState.js`
  tracks `zeroSince`/`sick` (with an exact offline zero-crossing timestamp, not just "now"), the
  pet goes Sick after 2 minutes at 0 and stays Sick until every stat is back up to 40, and a new
  `Components/SickBanner.js` shows it in `App.js`.
- Add a small component/integration test (or at least a bundle check) for `App.js`; today
  only the pure `game/` modules are covered.
