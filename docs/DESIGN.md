# The design language of Tools

Tools is built on the Pocket Compact UI Kit (`@pocketjs/framework/compact`), whose contract is [`docs/COMPACT-UI.md`](https://github.com/pocket-nexus/pocketjs/blob/main/docs/COMPACT-UI.md) in PocketJS. This page states the rules the app follows and why, for a 1.9" 320×170 panel at 191 ppi and a 46-key keyboard held in two hands.

## Principles

- **Glance first.** A tool opens on its reading: the bubble, the level in dBFS, the network list, the time. A screen shows one task, and the number a user came for is the largest thing on it.
- **Action oriented.** The keys that act on the current screen are always written in the hint bar; Enter does the focused action, and nothing needs a menu to reach.
- **Keyboard driven.** One vocabulary of keys means the same thing on every screen (below). A key never changes meaning while its screen stays up: an edit is an explicit state that Enter opens and Escape leaves (the clock's timer, the IR key's name).
- **Instruments, not forms.** Readings are drawn as instruments: a bubble between rings, a ruler sliding under a fixed pointer, a tape compass, a spectrum, large fixed-advance digits. A reading says what the sensor cannot measure (an uncalibrated field, a missing microphone) instead of inventing a value.
- **High contrast, visible focus, immediate feedback.** Plum on near-black, one accent yellow, cyan for "ok", pink for "warn"; one focus cursor (a wash and an accent bar or edge) on every list, grid and pad; every key press changes the screen in the frame it lands.

## The frame

| Strip | Height | Carries |
| --- | ---: | --- |
| Status bar | 18 px | The scene's title at the left; battery and clock at the right. |
| Body | 136 px | One scene. Scenes under it stay mounted with their state. |
| Hint bar | 16 px | The keys that act on this scene, as the scene names them. |

**The body is wide and short: 308 by 136 px inside 6 px gutters, so a screen spends its width first.** A readout sits beside its instrument; a list row carries its value at the right edge; the two things a screen is about share a row, one left and one right (Clock's time and date, Metronome's tempo and the bar's beats, Counter's count and its last change, Camera's viewfinder and its last photo). A single reading centred with empty flanks is a layout to redo.

## Keys

| Key | Means |
| --- | --- |
| F X Z C, or the arrows on the Fn layer | up, down, left, right. **Left and right switch a tool's sections on every screen.** (The CardputerZero's own launcher uses F/X/Z/C as arrows, and its key guide recommends them when no text is being typed.) |
| Enter | the focused action |
| Esc | back: a field or an edit first, then the scene; held a second, home |
| / | search the tools |
| Tab | the screen's second action (the grid's size at home, a QR scan in Camera, a lap in the stopwatch) |
| Space | pause, record |
| Shift | the fine step of a value (seconds instead of minutes, 1 bpm instead of 2) |

Digits and symbols are typed where a tool takes text (the calculator, the search, an IR key's name); everything else is reached with the keys above.

## The launcher

Home is one grid that grows downward as tools are added, never paging sideways. **Tiles sit in fixed columns that share the row, so every column keeps one x down the grid and only the last row is short; each tool appears once, in the order of its group.** A tile is an icon, a name and one glance value: the time on Clock, the battery on System, the network on Radio, the backlight on Flashlight, what is missing on a tool that cannot run, nothing otherwise.

Tab steps the grid through three sizes, as the 3DS home menu zooms:

| Size | Tiles a row | Tile | Text |
| --- | ---: | --- | --- |
| Large | 4 | 74 × 59, 32 px icon; two rows fill the grid | name and glance value |
| Medium | 5 | 59 × 50, 24 px icon | name and glance value |
| Small | 8 | 36 × 36, 24 px icon; all thirteen tools in two rows | none; the line under the grid names the focused tool |

`/` opens a search that filters by name, group and summary as letters arrive, names first; the matches glide to the front and Enter opens the first. With dozens of tools the keyboard is the fast path, not scrolling. Coming back from a tool, the cursor is on it.

## Motion

Motion is declared by the kit and run by the PocketJS core: no JavaScript runs while a thing moves. **At the panel's 30 Hz a move of 150 ms is five frames; shorter moves read as a jump, so no move is shorter.**

| Move | Duration |
| --- | ---: |
| The focus cursor between rows, tiles and pad cells | 150 ms |
| A pressed cell or tile dipping to 88 % and springing back | 150 ms |
| A list's rows sliding when the focus passes the view's edge | 160 ms |
| The section highlight gliding between tabs, the new section's content sliding in 56 px from its side | 180 ms |
| A scene sliding in from the right, sliding out when it closes | 200 ms |
| A toast, a dialog, the search field rising into place | 180 ms |
| Tiles gliding and scaling to a new layout (a grid size, a search); a tile that arrives growing in | 260 ms |
| The bubble, the ruler, the compass tape following a reading | 120 ms |

A reading that is itself motion (the spectrum, the waveform, the shake trace, the viewfinder) is drawn as it arrives; a digit changes as a cut. Nothing animates while nothing happens.

**The panel shows every frame.** The CardputerZero's SPI panel is a deferred-I/O framebuffer that the kernel flushes 50 ms after the first write, about 18 times a second, which merged the frames of every move into one or two. The program flushes it after each frame (`fsync` on `/dev/fb0`): 29 panel updates a second while something moves, none while nothing does.

## Feedback

- A press shows on the item it hit (the dip) before what it does arrives.
- A state is a chip at the top right: `LIVE`, `SCANNING`, `SAVED`, `EDIT`, `FAILED`.
- A toast confirms what happened off-screen ("QR code read", "Timer done") and leaves by itself.
- A destructive action asks first: a dialog with the action named on its button ("Reset", "Delete", "Leave").
- A tool that cannot run says what is missing, on its tile and in its scene.

## Colour and type

| Token | Value | Used for |
| --- | --- | --- |
| Background | `#171226` | every surface |
| Panel, wash | `#231b3b`, `#2b2148` | fields, the focus wash |
| Text, dim | `#fcf6ff`, `#8e80ac` | readings, labels |
| Accent | `#ffd23f` | focus, the active section, values being changed |
| OK | `#3fd0e8` | live, in tune, connected |
| Warn | `#ff7fb4` | missing, failed, a limit |

Type is the baked UI font at 10, 12, 14 and 16 px for text and up to 54 px for digits; digits use fixed-advance cells so a changing number does not shift.

## A new tool

One row in `app/applets/index.ts` (id, title, summary, group, icon, what hardware it needs, what it says when that is missing, its scene), one 24-unit SVG in `app/icons/` (filled circles, rectangles and paths; `fill="hole"` cuts), and a scene that reads its topic with `createTopic` and draws with the kit's controls and instruments.
