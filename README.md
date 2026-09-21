# EGotchi

Virtual pet browser game built with React Native. Raise and care for a digital pet — feed it, play with it, and keep it happy. Character stats evolve based on how well you care for it.

## Tech Stack

- **React Native** (Expo) — cross-platform mobile
- **React hooks** — state-driven pet lifecycle

## Gameplay

The pet has three stats from 0 to 100: **fullness**, **energy** and **fun**. Each one drains over time, and the pet's face is picked from the average of the three.

| Action | Fullness | Energy | Fun | Cooldown |
| ------ | -------- | ------ | --- | -------- |
| Feed   | +25      | -2     | +2  | 20s      |
| Play   | -8       | -12    | +25 | 15s      |
| Rest   | -5       | +35    | -5  | 45s      |

Buttons are disabled (and show the seconds left) while an action is cooling down.

Decay is timestamp-based, so time that passes while the app is closed is applied on the next load. Offline decay is capped at 12 hours so a pet is never permanently wiped out by a long absence.

## Persistence

The persistence layer is built and unit tested: `game/petState.js` serializes and deserializes the pet (versioned, falls back to a fresh pet on bad data), and `game/storage.js` provides `loadPet`/`savePet` on top of an injectable storage adapter (memory, localStorage, or an AsyncStorage-like module).

Durable persistence currently works on **Expo web only**, where `App.js` uses `localStorage`. On native platforms the app falls back to an in-memory store, so the pet is **not** saved across app restarts there until a real storage backend is wired in.

## Running

```bash
npm install
npx expo start
```

## Tests

The game logic lives in dependency-free CommonJS modules under `game/`, so the tests run with plain Node (no Expo install needed):

```bash
npm test
```
