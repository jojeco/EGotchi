# Next up for EGotchi

- [x] `useEffect`'s `setTimeout` in `App.js` had no cleanup and could stack multiple pending
  timers on fast re-renders. Fixed: switched to a single `setInterval` under an empty
  dependency array, with `clearInterval` cleanup and the decay guard moved into the
  functional `setCurrentFace(f => ...)` updater.
- The face images in `Components/Face.js` are hotlinked to
  `citweb.lethbridgecollege.ab.ca` — a school server that could go offline or block hotlinking
  at any time. Bundle the 5 face states as local assets under `assets/` instead.
- Only one button exists ("Click me Please" -> `getHappy`), but the README describes
  feed/play mechanics. Add a couple of distinct actions (e.g. Feed vs Play) that both call
  into the happiness logic, to start matching the README's description.
- No persistence — mood resets to the default (2) on every reload. Consider
  `AsyncStorage` to save `currentFace` across sessions.
