// Camera: a live viewfinder and a shutter. Opening the tool opens the
// program's video plane on the camera (pocketjs programs/cardputer-zero/src/
// video.rs): libcamera takes about ten seconds to deliver the first frame on
// the Zero, and a bar fills while it does; from then the program copies each
// frame into the viewfinder's texture, about twelve a second, and no frame
// crosses JavaScript. Enter keeps the frame on
// screen as a photo: the viewfinder flashes and the frame flies into the
// last photo's place at the right. Tab scans every frame for a QR code until
// one reads; the text shows over the bottom of the viewfinder. Leaving the
// tool stops the stream.

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { getOps } from "@pocketjs/framework/host";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { after } from "@pocketjs/framework/clock";
import { Chip, display, flip, KeyValue, MOTION, Progress, toast, useHints, useNav, useSceneActive, KEY_LABEL, GUTTER, wrap, SLOT, when, type Rect } from "@pocketjs/framework/compact";
import { createTopic, message, post, requestBytes, type Camera } from "../device.ts";

/** The last photo's thumbnail: 128x64 RGB565 (device/camera.rs). */
const THUMB_TEXTURE_W = 128;
const THUMB_TEXTURE_H = 64;
const PSM_5650 = 0;
/** libcamera's start on the Zero, for the warm-up bar. */
const START_S = 10;
/** The viewfinder, 16:9, and the last photo's place in the right column. */
const VIEW: Rect = { x: GUTTER, y: 4, w: 224, h: 126 };
const SIDE_X = VIEW.x + VIEW.w + 8;
const SIDE_W = 320 - GUTTER - SIDE_X;
const THUMB: Rect = { x: SIDE_X, y: 58, w: SIDE_W, h: Math.round((SIDE_W * 9) / 16) };

/** One texture handle at a time on one Image node; the previous handle is
 *  freed unless something else still shows it. */
function createTextureSlot(keep: () => number[]) {
  let handle = -1;
  return {
    get: () => handle,
    show(node: NodeMirror | undefined, next: number) {
      const previous = handle;
      handle = next;
      if (node) getOps().setImage(node.id, next);
      if (previous >= 0 && previous !== next && !keep().includes(previous)) getOps().freeTexture?.(previous);
    },
    take() {
      const taken = handle;
      handle = -1;
      return taken;
    },
    free() {
      if (handle >= 0 && !keep().includes(handle)) getOps().freeTexture?.(handle);
      handle = -1;
    },
  };
}

export function CameraScene() {
  const active = useSceneActive();
  const camera = createTopic<Camera>("/dev/camera", 0.25, active);
  const live = () => camera.data()?.live ?? null;
  const [hasFrame, setHasFrame] = createSignal(false);
  const [hasThumb, setHasThumb] = createSignal(false);
  const [flash, setFlash] = createSignal(false);
  const [flying, setFlying] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  let view: NodeMirror | undefined;
  let thumb: NodeMirror | undefined;
  let ghost: NodeMirror | undefined;
  const thumbSlot = createTextureSlot(() => []);

  // The video plane runs while the tool is on top: open binds its texture to
  // the viewfinder, each frame takes the newest picture, close stops the
  // stream.
  const ops = getOps();
  let opened = false;
  const close = () => {
    if (!opened) return;
    opened = false;
    ops.videoClose?.();
  };
  createEffect(() => {
    if (!active()) return close();
    if (opened || !ops.videoOpen) return;
    opened = ops.videoOpen("camera");
    const handle = opened ? (ops.videoTexture?.() ?? -1) : -1;
    if (handle >= 0) {
      if (view) ops.setImage(view.id, handle);
      if (ghost) ops.setImage(ghost.id, handle);
    }
    camera.refresh();
  });
  onFrame(() => {
    if (!opened) return;
    const frame = ops.videoTick?.() ?? -1;
    if (frame >= 0 && !hasFrame()) setHasFrame(true);
  });
  let alive = true;
  onCleanup(() => {
    alive = false;
    close();
    thumbSlot.free();
  });
  const clock = () => {
    if (!alive) return;
    setNow(Date.now());
    after(0.2, clock);
  };
  clock();

  // The last photo, when the tool opens and after each picture.
  const loadThumbnail = () =>
    void requestBytes("/dev/camera/thumbnail.rgb565")
      .then(bytes => {
        if (!alive || bytes.length !== THUMB_TEXTURE_W * THUMB_TEXTURE_H * 2) return;
        const handle = ops.uploadTexture(bytes, THUMB_TEXTURE_W, THUMB_TEXTURE_H, PSM_5650);
        if (handle < 0) return;
        thumbSlot.show(thumb, handle);
        setHasThumb(true);
      })
      .catch(() => {});
  let thumbAsked = false;
  createEffect(() => {
    if (thumbAsked || !camera.data()?.thumbnail) return;
    thumbAsked = true;
    loadThumbnail();
  });

  const shoot = () => {
    if (live()?.phase !== "live" || !hasFrame()) {
      toast(live()?.phase === "starting" ? "The camera is still starting" : "The camera is not running", "warn");
      return;
    }
    // The viewfinder flashes and its picture flies into the last photo's
    // place; the thumbnail follows once the photo is written.
    setFlying(true);
    if (ghost) flip(ghost, VIEW, THUMB, MOTION.reflow);
    after(MOTION.reflow / 1000, () => setFlying(false));
    setFlash(true);
    after(0.09, () => setFlash(false));
    setSaved(true);
    after(1.4, () => setSaved(false));
    void post("/dev/camera/capture", { qr: false })
      .then(() => {
        loadThumbnail();
        camera.refresh();
      })
      .catch(error => toast(message(error), "warn"));
  };
  let lastQr: string | null = null;
  createEffect(() => {
    const qr = live()?.qr ?? null;
    if (qr && qr !== lastQr) toast("QR code read", "ok");
    lastQr = qr;
  });
  useNav(event => {
    switch (event.key) {
      case "ok":
        shoot();
        return true;
      case "action":
        void post("/dev/camera/scan", { on: !live()?.scanning })
          .then(() => camera.refresh())
          .catch(error => toast(message(error), "warn"));
        return true;
    }
    return;
  });
  useHints(() => `${KEY_LABEL.ok} take a picture   ${KEY_LABEL.action} ${live()?.scanning ? "stop scanning" : "scan a QR code"}   ${KEY_LABEL.back} back`);

  const phase = () => {
    const c = camera.data();
    if (!c) return "waiting";
    if (!c.available) return "none";
    return c.live.phase;
  };
  const state = () => {
    if (saved()) return "SAVED";
    switch (phase()) {
      case "waiting":
        return "WAITING";
      case "none":
        return "NO CAMERA";
      case "starting":
        return "STARTING";
      case "live":
        return live()!.scanning ? "SCANNING" : "LIVE";
      case "failed":
        return "FAILED";
      default:
        return "OFF";
    }
  };
  const stateTone = () => (saved() ? "accent" : phase() === "live" ? "ok" : phase() === "failed" || phase() === "none" ? "warn" : "dim");
  const warming = () => {
    const l = live();
    if (!l || l.phase !== "starting") return 0;
    return Math.min(0.95, (now() - l.startedAt) / 1000 / START_S);
  };
  const qrLines = () => {
    const text = live()?.qr;
    return text ? wrap(text, SLOT.tiny, VIEW.w - 12).slice(0, 2) : [];
  };
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <View class="absolute rounded-sm bg-[#000000] border border-[#3a2d5c] overflow-hidden" style={{ insetL: VIEW.x - 1, insetT: VIEW.y - 1, width: VIEW.w + 2, height: VIEW.h + 2 }}>
        <Image nodeRef={(node: NodeMirror) => (view = node)} class="absolute" style={{ insetL: 1, insetT: 1, width: VIEW.w, height: VIEW.h, display: display(hasFrame()) }} />
        <Show when={!hasFrame()}>
          <Text class="absolute left-0 text-xs leading-[14] text-center text-[#cbbde2]" style={{ width: VIEW.w + 2, insetT: 46 }}>
            {phase() === "none" ? "No camera on this Zero" : phase() === "failed" ? "The camera stopped" : "Starting the camera"}
          </Text>
          <Show when={phase() === "failed" && live()?.error}>
            <Text class="absolute left-0 text-2xs leading-[12] text-center text-[#ff7fb4]" style={{ width: VIEW.w + 2, insetT: 64 }}>
              {live()!.error}
            </Text>
          </Show>
          <Show when={phase() === "starting" || phase() === "waiting"}>
            <Progress value={warming} x={40} y={68} w={VIEW.w - 78} h={4} tone="accent" />
            <Text class="absolute left-0 text-2xs leading-[12] text-center text-[#8e80ac]" style={{ width: VIEW.w + 2, insetT: 78 }}>
              libcamera takes about ten seconds here
            </Text>
          </Show>
        </Show>
        <Show when={live()?.scanning}>
          <View class="absolute w-[14] h-[2] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 - 40, insetT: VIEW.h / 2 - 40 }} />
          <View class="absolute w-[2] h-[14] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 - 40, insetT: VIEW.h / 2 - 40 }} />
          <View class="absolute w-[14] h-[2] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 + 28, insetT: VIEW.h / 2 - 40 }} />
          <View class="absolute w-[2] h-[14] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 + 40, insetT: VIEW.h / 2 - 40 }} />
          <View class="absolute w-[14] h-[2] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 - 40, insetT: VIEW.h / 2 + 40 }} />
          <View class="absolute w-[2] h-[14] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 - 40, insetT: VIEW.h / 2 + 28 }} />
          <View class="absolute w-[14] h-[2] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 + 28, insetT: VIEW.h / 2 + 40 }} />
          <View class="absolute w-[2] h-[14] bg-[#3fd0e8]" style={{ insetL: VIEW.w / 2 + 40, insetT: VIEW.h / 2 + 28 }} />
        </Show>
        <Show when={qrLines().length > 0}>
          <View class="absolute left-0 bg-[#171226]" style={{ insetT: VIEW.h + 2 - 30, width: VIEW.w + 2, height: 30 }}>
            <Text class="absolute text-2xs leading-[12] text-[#3fd0e8]" style={{ insetL: 6, insetT: 3, width: VIEW.w - 10 }}>
              {qrLines().join("\n")}
            </Text>
          </View>
        </Show>
        <Show when={flash()}>
          <View class="absolute left-0 top-0 bg-[#fcf6ff]" style={{ width: VIEW.w + 2, height: VIEW.h + 2 }} />
        </Show>
      </View>
      <Chip text={state} tone={stateTone} x={SIDE_X} y={4} />
      <KeyValue label="photos" value={() => `${camera.data()?.photos.length ?? 0}`} x={SIDE_X} y={20} w={SIDE_W} />
      <KeyValue label="rate" value={() => (phase() === "live" ? `${Math.round(live()!.fps)} fps` : "--")} x={SIDE_X} y={36} w={SIDE_W} tone={() => "dim"} />
      <View class="absolute rounded-sm bg-[#000000] border border-[#3a2d5c] overflow-hidden" style={{ insetL: THUMB.x - 1, insetT: THUMB.y - 1, width: THUMB.w + 2, height: THUMB.h + 2 }}>
        <Image nodeRef={(node: NodeMirror) => (thumb = node)} class="absolute" style={{ insetL: 1, insetT: 1, width: THUMB.w, height: THUMB.h, display: display(hasThumb()) }} />
      </View>
      <Text class="absolute text-2xs leading-[12] text-[#8e80ac]" style={{ insetL: SIDE_X, insetT: THUMB.y + THUMB.h + 4, width: SIDE_W }}>
        {camera.data()?.last ? `last ${when(camera.data()!.last!.at)}` : camera.data()?.photos.length ? `newest ${when(camera.data()!.photos[0]!.modified * 1000)}` : "no photo yet"}
      </Text>
      <Image nodeRef={(node: NodeMirror) => (ghost = node)} class="absolute" style={{ insetL: THUMB.x, insetT: THUMB.y, width: THUMB.w, height: THUMB.h, display: display(flying()) }} />
    </View>
  );
}
