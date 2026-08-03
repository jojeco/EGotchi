# EGotchi — Next Increments

- **AsyncStorage persistence** — save `currentFace` to AsyncStorage on each change and restore it on app launch so the Gotchi's mood survives app restarts.
- **Mood stat display** — show a labelled mood bar or emoji label beneath the face (e.g. "Mood: Happy ★★★★☆") so the current happiness level is readable at a glance without inferring it from the face alone.
- **Offline fallback image** — bundle a static placeholder face asset so the Face component renders something meaningful when image assets fail to load (e.g. on first install before assets cache).
- **Feeding/interaction variety** — add a second action (e.g. "Feed") that increments mood by a different amount, giving the player more ways to interact and making the gameplay loop less repetitive.
