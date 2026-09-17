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
- Only one button exists ("Pet" -> `getHappy`), but the README describes
  feed/play mechanics. Add a couple of distinct actions (e.g. Feed vs Play) that both call
  into the happiness logic, to start matching the README's description.
- No persistence — mood resets to the default (2) on every reload. Consider
  `AsyncStorage` to save `currentFace` across sessions.
