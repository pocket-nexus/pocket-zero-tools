# Submitting Tools to the CardputerZero Store

The Store takes a `.deb` and the listing in `app-builder.json`; `czdev publish` (or the upload on [dev.cardputer.cc](https://dev.cardputer.cc)) checks both and opens a pull request on [CardputerZero/packages](https://github.com/CardputerZero/packages). **A first listing is merged by a maintainer after a video of the app on a real device is posted in that pull request**; later versions merge by themselves once the checks pass.

## What is ready

| Item | Where | Rule it meets |
| --- | --- | --- |
| Package | `.build/pocket-zero-tools_0.2.0-2_arm64.deb` (`bun scripts/zero.ts deb`) | `<package>_<version>-<revision>_arm64.deb`; a `.desktop` entry; no systemd service; no udev rule that runs a command; the launcher starts it as `pi` |
| Title | `app_name`: Tools | unique in the Store (no listed app uses it on 2026-10-28) |
| Package name | `pocket-zero-tools` | lowercase Debian name; fixed after the first publish |
| Summary | 80 characters, with zh-CN and ja translations | at most 80 characters |
| Icon | `store/icon.png`, 256 × 256, full square, no rounded corners | square PNG, 128 to 512 px |
| Screenshots | `store/screenshots/01-home.png` … `06-small-grid.png` | 1 to 6 PNGs of exactly 320 × 170 |
| Categories | System Tools, Hardware & IoT | 1 or 2 from the Store's list |
| Permissions | camera, microphone, IMU: yes; network, extra hardware, background service, external display: no | all seven declared |
| Share code | `TOOL` | 4 letters or digits, unique (unused on 2026-10-28) |
| License, source | MIT, https://github.com/pocket-nexus/pocket-zero-tools | SPDX id; public source recommended |
| Author | display name Pocket Nexus; `czdev` records the GitHub login that publishes | `display_name` required |
| Maintainer field | `Pocket Nexus <7312949+doodlewind@users.noreply.github.com>` | not a template default |

`bun scripts/zero.ts check` runs the Store's own `store_meta_policy.py` on this listing and `install_path_policy.py` on the `.deb` (with `dpkg-deb`; `brew install dpkg` on macOS). Title and share-code uniqueness are checked by the Store's CI against the whole catalogue.

## The video

The Store asks for **the app launching, its main features, and the app exiting**, filmed on the device. A shot list of about a minute:

1. The launcher's carousel; move to **Tools**; Enter. The grid appears.
2. Tab three times: the grid steps through large, small and medium, the tiles gliding.
3. Open **Level**; tilt the Zero so the bubble moves; C to Angle and to Compass; Esc.
4. Open **Audio**; speak or clap so the meter and the spectrum move; Esc.
5. Open **Radio**; the Wi-Fi list fills after a scan; Esc.
6. Open **Camera**; wait for the viewfinder (about ten seconds); point it at something; Enter takes a photo; Esc.
7. Open **IR Remote**; Learn; press a key on a TV remote toward the Zero; the pulses and the decoded key show; Esc twice.
8. `/` and type `calc`; Enter; type `12`, C and Enter for `+`, `30`, Enter: `42`; Esc.
9. Esc at the grid; **Leave**: the launcher's carousel returns.

## Publishing

```sh
git clone https://github.com/CardputerZero/AppBuilder ~/code/AppBuilder
~/code/AppBuilder/czdev login                                   # GitHub device code
bun scripts/zero.ts check                                        # the Store's metadata policy, locally
~/code/AppBuilder/czdev publish --deb .build/pocket-zero-tools_0.2.0-2_arm64.deb
```

Run `czdev publish` from this repository's root, where `app-builder.json` is. It forks CardputerZero/packages under the logged-in account, uploads the `.deb` to that fork's `czdev-buffer` release, and opens the pull request. Post the video as a comment on it.

A new version: raise `version` in `pocket.json` and `app-builder.json` together, rebuild the `.deb`, publish again.
