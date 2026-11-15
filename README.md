# Yachtty

A sailing game for learning to sail a small dinghy: steer with the tiller,
trim the mainsheet, and find out what the wind lets you do.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. To play on an iPad on the same Wi-Fi, run
`npm run dev -- --host` and open the Network address it prints.

## Levels

1. **Meet the boat** - tap the parts of a dinghy, then a quiz.
2. **Find the wind** - read a flag, ripples and a flapping sail.
3. **Steer with the tiller** - the mainsheet looks after itself.
4. **The mainsheet** - the boat steers itself.
5. **The no-go zone** - close hauled, reach and run, then captain's orders.
6. **Tacking** - turn through the wind, then zigzag upwind to the stars.
7. **Gybing** - turn with the wind behind, then zigzag downwind.
8. **Who gives way** - tap the boat that must keep clear: port/starboard, windward, overtaking.
9. **Compass** - steer by compass, then follow directions to hidden stars.
10. **Buoy race** - upwind, across and downwind round three buoys against the clock.

Plus **Free sail**, open any time. Best stars are saved on the device.

Each level opens with a short animated explainer ("Show me how" replays it).
Instructions are read aloud and there are sound effects; the 🔊 button turns
both off.

## Controls

- **Tiller** (bottom left): drag left and right. The boat turns the opposite way.
- **Mainsheet** (bottom right): drag down to pull in, up to let out.
- **Keyboard**: left/right arrows move the tiller, down pulls the mainsheet in, up lets it out.

## Code

- `src/sim.ts` - the sailing engine (wind, sail trim, speed, tacking, gybing)
- `src/render.ts` - drawing the bay, boat and on-screen controls
- `src/controls.ts` - touch, mouse and keyboard input
- `src/levels/` - one file per level, plus free sail
- `src/intro.ts` - the animated explainers shown before each level
- `src/audio.ts` - sound effects and spoken instructions
- `src/game.ts` - what a level can read and change
- `src/main.ts` - the game loop, home screen and level-complete card

`npm test` runs the engine tests.
