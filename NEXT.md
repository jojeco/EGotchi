# Next up for EGotchi

- `useEffect`'s `setTimeout` in `App.js` has no cleanup (`clearTimeout`) — on fast re-renders
  this can stack multiple pending timers. Switch to `setInterval` in a single effect with an
  empty dependency array (using the functional `setCurrentFace(f => ...)` updater, which is
  already the pattern used here), or add a cleanup return to the existing effect.
- The face images in `Components/Face.js` are hotlinked to
  `citweb.lethbridgecollege.ab.ca` — a school server that could go offline or block hotlinking
  at any time. Bundle the 5 face states as local assets under `assets/` instead.
- Only one button exists ("Click me Please" -> `getHappy`), but the README describes
  feed/play mechanics. Add a couple of distinct actions (e.g. Feed vs Play) that both call
  into the happiness logic, to start matching the README's description.
- No persistence — mood resets to the default (2) on every reload. Consider
  `AsyncStorage` to save `currentFace` across sessions.
