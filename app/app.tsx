// Pocket Tools on the CardputerZero: a Home grid of tools, each a scene of
// the compact kit. Home is one grid of fixed columns that scrolls down as
// tools are added, each tool once, in the order of their groups; an icon, a
// name and one glance value on each tile. Tab steps the grid through three
// sizes (four large tiles a row with their readings, five medium, eight
// small icons that show every tool at once) and the tiles glide and scale
// to their new places; + and - step it one way. `/` opens a search field
// that filters the grid as letters arrive, the matches gliding to the front.
// FXZC move, Enter opens; coming back, the cursor is where it was. The
// status bar's right side glances at the battery and the clock; Escape at
// Home asks before handing the panel back to the launcher.

import { createMemo, createSignal, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { after } from "@pocketjs/framework/clock";
import { AppGrid, arrive, CompactApp, createSelection, GRID_SIZES, KEY_LABEL, TextField, useAppGrid, useHints, useKey, useScenes, toast, GUTTER, CONTENT_W, ellipsize, SLOT, type GridSize, type GridTile } from "@pocketjs/framework/compact";
import { APPLETS, GROUPS, type Applet } from "./applets/index.ts";
import { createTopic, post, store, type Battery, type Capabilities, type SystemInfo } from "./device.ts";

/** Every tool once, in the order of their groups. */
const ORDER: readonly Applet[] = GROUPS.flatMap(group => APPLETS.filter(a => a.group === group));

interface HomeStore {
  size?: GridSize["name"];
}

function HomeScene(props: { caps: () => Capabilities | null; system: () => SystemInfo | null; battery: () => Battery | null; now: () => Date }) {
  const scenes = useScenes();
  const [query, setQuery] = createSignal("");
  const [searching, setSearching] = createSignal(false);
  const [sizeIndex, setSizeIndex] = createSignal(1);
  const size = () => GRID_SIZES[sizeIndex()]!;
  void store
    .get<HomeStore>("home")
    .then(value => {
      const saved = GRID_SIZES.findIndex(s => s.name === value?.size);
      if (saved >= 0) setSizeIndex(saved);
    })
    .catch(() => {});
  const save = () => void store.set("home", { size: size().name } satisfies HomeStore).catch(() => {});

  const available = (applet: Applet) => {
    const c = props.caps();
    if (!applet.needs || !c) return true;
    return applet.needs(c);
  };
  const two = (n: number) => String(n).padStart(2, "0");
  /** The one value a tile glances at: a live reading where the tool has
   *  one, what is missing where it cannot run, nothing otherwise. */
  const glance = (applet: Applet): string => {
    if (!available(applet)) return applet.missing;
    switch (applet.id) {
      case "clock":
        return `${two(props.now().getHours())}:${two(props.now().getMinutes())}`;
      case "system": {
        const b = props.battery();
        return b?.percent != null ? `${b.percent}%` : "";
      }
      case "radio": {
        const ssid = props.system()?.wifi.ssid;
        return ssid ? ssid : props.system() ? "no Wi-Fi" : "";
      }
      case "flashlight": {
        const light = props.system()?.backlight;
        return light ? `${Math.round((light.value / light.max) * 100)}%` : "";
      }
      default:
        return "";
    }
  };
  // One tile object per app, kept across layouts: the grid moves a tile it
  // already drew instead of drawing a new one, so a search result glides
  // from its place in the grid.
  const tileCache = new Map<string, GridTile>();
  const tileOf = (applet: Applet): GridTile => {
    let tile = tileCache.get(applet.id);
    if (!tile) {
      tile = {
        id: applet.id,
        icon: applet.icon,
        label: applet.title,
        value: () => glance(applet),
        tone: () => (available(applet) ? "dim" : "warn"),
      };
      tileCache.set(applet.id, tile);
    }
    return tile;
  };
  const shown = createMemo<Applet[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [...ORDER];
    // Names first, then groups, then what a summary says.
    const rank = (a: Applet) => {
      const title = a.title.toLowerCase();
      if (title.startsWith(q)) return 0;
      if (title.includes(q) || a.id.startsWith(q)) return 1;
      if (a.group.toLowerCase().startsWith(q)) return 2;
      if (a.summary.toLowerCase().includes(q)) return 3;
      return -1;
    };
    return ORDER.map(a => [rank(a), a] as const)
      .filter(([r]) => r >= 0)
      .sort((x, y) => x[0] - y[0])
      .map(([, a]) => a);
  });
  const tiles = createMemo(() => shown().map(tileOf));
  const selection = createSelection(() => tiles().length);
  const focused = () => shown()[selection.index()] ?? null;
  const open = (index: number) => {
    const applet = shown()[index];
    if (!applet) return;
    setSearching(false);
    setQuery("");
    // Back from the tool, the cursor is on it.
    selection.set(ORDER.indexOf(applet));
    scenes.push({ title: applet.title, render: applet.render });
  };
  const resize = (step: number, wrap: boolean) => {
    const n = GRID_SIZES.length;
    const next = wrap ? (sizeIndex() + step + n) % n : Math.max(0, Math.min(n - 1, sizeIndex() + step));
    if (next === sizeIndex()) return;
    setSizeIndex(next);
    save();
  };
  useAppGrid(tiles, selection, {
    size,
    onOk: open,
    other: event => {
      if (event.key === "search") {
        setSearching(true);
        return true;
      }
      if (event.key === "action" && !searching()) {
        resize(1, true);
        return true;
      }
      return;
    },
  });
  useKey(event => {
    if (searching() || event.kind !== "key" || !event.pressed) return;
    if (event.key === "+" || event.key === "=") {
      resize(-1, false);
      return true;
    }
    if (event.key === "-") {
      resize(1, false);
      return true;
    }
    return;
  });
  useHints(() => (searching() ? `Type to filter   ${KEY_LABEL.ok} open   ${KEY_LABEL.back} close search` : `${KEY_LABEL.arrows} move   ${KEY_LABEL.ok} open   ${KEY_LABEL.search} search   ${KEY_LABEL.action} size   ${KEY_LABEL.back} quit`));
  const gridY = () => (searching() ? 24 : 2);
  const gridH = () => 122 - gridY();
  // Small tiles carry no names: the line under the grid names the focused tool.
  const summary = () => {
    const applet = focused();
    if (!applet) return "";
    return size().text === "none" ? `${applet.title}: ${applet.summary}` : applet.summary;
  };
  return (
    <View class="absolute left-0 top-0 w-[320] h-[136]">
      <Show when={searching()}>
        <View ref={node => arrive(node, -6)} class="absolute left-0 top-0 w-[320] h-[24]">
          <TextField
            value={query}
            active={searching}
            placeholder="Search tools"
            x={GUTTER}
            y={2}
            w={CONTENT_W}
            onInput={value => {
              setQuery(value);
              selection.set(0);
            }}
            onSubmit={() => open(selection.index())}
            onCancel={() => {
              // The cursor stays on the match it was on.
              const applet = focused();
              setSearching(false);
              setQuery("");
              if (applet) selection.set(ORDER.indexOf(applet));
            }}
          />
        </View>
      </Show>
      <AppGrid tiles={tiles} selection={selection} size={size} x={GUTTER} y={gridY()} w={CONTENT_W} h={gridH()} empty="No tool matches" />
      <View class="absolute left-0 w-[320] h-[1] bg-[#2b2148]" style={{ insetT: 123 }} />
      <Text class="absolute text-2xs leading-[12] text-[#cbbde2]" style={{ insetL: GUTTER, insetT: 124 }}>
        {ellipsize(summary(), SLOT.tiny, CONTENT_W)}
      </Text>
    </View>
  );
}

export default function ToolsApp() {
  const caps = createTopic<Capabilities>("/dev/capabilities", 30);
  const battery = createTopic<Battery>("/dev/battery", 10);
  const system = createTopic<SystemInfo>("/dev/system", 10);
  const [now, setNow] = createSignal(new Date());
  // The clock in the status bar and on the Clock tile: once a second is
  // enough for minutes.
  const tick = () => {
    setNow(new Date());
    after(1, tick);
  };
  tick();
  const glance = () => {
    const b = battery.data();
    const percent = b?.percent != null ? `${b.percent}%${b.status === "Charging" ? "+" : ""}` : "";
    const d = now();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return percent ? `${percent}   ${time}` : time;
  };
  return (
    <CompactApp
      root={{ title: "Pocket Tools", render: () => <HomeScene caps={caps.data} system={system.data} battery={battery.data} now={now} /> }}
      glance={glance}
      exit={{
        title: "Leave Pocket Tools?",
        text: "The panel goes back to the launcher.",
        action: "Leave",
        run: () => {
          void post("/quit").catch(() => toast("Could not quit", "warn"));
        },
      }}
    />
  );
}
