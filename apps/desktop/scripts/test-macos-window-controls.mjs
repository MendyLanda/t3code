import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const require = NodeModule.createRequire(import.meta.url);
const script = NodeURL.fileURLToPath(import.meta.url);
const desktop = NodePath.resolve(NodePath.dirname(script), "..");

if (!process.versions.electron) {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- This standalone native test requires macOS.
  NodeAssert.equal(NodeOS.platform(), "darwin", "This test needs AppKit.");
  const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-macos-window-controls-"));
  try {
    const library = NodePath.join(scratch, "probe.dylib");
    const compile = NodeChildProcess.spawnSync(
      "clang",
      [
        "-dynamiclib",
        "-fobjc-arc",
        "-framework",
        "Cocoa",
        NodePath.join(desktop, "scripts/fixtures/macos-window-controls.m"),
        "-o",
        library,
      ],
      { encoding: "utf8" },
    );
    NodeAssert.equal(compile.status, 0, compile.stderr);
    for (const [language, rtl] of [
      ["en", false],
      ["he", true],
      ["ar", true],
    ]) {
      const env = {
        ...process.env,
        T3_WINDOW_CONTROL_TEST_DIR: scratch,
        T3_WINDOW_CONTROL_TEST_LIBRARY: library,
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = NodeChildProcess.spawnSync(
        require("electron"),
        [
          script,
          "--lang=en-US",
          "-AppleLanguages",
          `(${language})`,
          "-AppleTextDirection",
          rtl ? "YES" : "NO",
          "-NSForceRightToLeftWritingDirection",
          rtl ? "YES" : "NO",
          ...(process.argv.includes("--baseline") ? ["--baseline"] : []),
        ],
        { env, encoding: "utf8", timeout: 45_000 },
      );
      process.stdout.write(result.stdout ?? "");
      NodeAssert.equal(result.status, 0, result.stderr || result.error?.message);
    }
  } finally {
    NodeFS.rmSync(scratch, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow, Menu } = require("electron");
  const { DataType, load, open } = require("ffi-rs");
  const {
    getMacosAppLayoutDirection,
    getMacosWindowTitleBarOptions,
    syncMacosWindowButtons,
  } = require("../src/window/MacosWindowControls.ts");
  const direction = getMacosAppLayoutDirection();
  app.setPath("userData", NodePath.join(process.env.T3_WINDOW_CONTROL_TEST_DIR, "profile"));
  if (!process.argv.includes("--baseline"))
    app.commandLine.appendSwitch("force-ui-direction", direction);
  let stage = "startup";
  const watchdog = setTimeout(() => {
    console.error(`Native window test did not finish: ${stage}`);
    app.exit(2);
  }, 30_000);
  app
    .whenReady()
    .then(async () => {
      app.setActivationPolicy("regular");
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([{ label: "View", submenu: [{ role: "togglefullscreen" }] }]),
      );
      open({ library: "window-probe", path: process.env.T3_WINDOW_CONTROL_TEST_LIBRARY });
      const window = new BrowserWindow({
        width: 900,
        height: 650,
        show: false,
        ...getMacosWindowTitleBarOptions(),
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      const handle = window.getNativeWindowHandle().readBigUInt64LE();
      const click = (button) =>
        load({
          library: "window-probe",
          funcName: "clickButton",
          retType: DataType.Void,
          paramsType: [DataType.BigInt, DataType.I32],
          paramsValue: [handle, button],
        });
      const painted = NodeEvents.once(window, "ready-to-show");
      const css = NodeFS.readFileSync(NodePath.join(desktop, "../web/src/index.css"), "utf8").match(
        /\.wco \{([^}]+)\}/,
      )[1];
      const inset = JSON.parse(
        NodeFS.readFileSync(
          NodePath.join(desktop, "../web/src/components/AppSidebarLayout.tsx"),
          "utf8",
        ).match(/const MACOS_TRAFFIC_LIGHTS_LEFT_INSET =\s*("[^\n]+")/)[1],
      );
      await window.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(`
      <html class="wco"><style>.wco{${css}}body{margin:0;background:#fafafa;font:16px system-ui}
      header{height:var(--workspace-topbar-height);-webkit-app-region:drag}
      button{position:absolute;top:12px;width:28px;height:28px;-webkit-app-region:no-drag}
      #left{left:var(--workspace-controls-left)}#right{right:var(--workspace-controls-right)}</style>
      <body style="--workspace-controls-left:${inset}"><header><button id="left">☰</button>
      <button id="right">⋯</button></header><p dir="auto">שלום עולם, Hello world</p></body></html>`),
      );
      await painted;
      window.show();
      app.focus({ steal: true });
      window.focus();
      const inspect = () =>
        JSON.parse(
          load({
            library: "window-probe",
            funcName: "snapshot",
            retType: DataType.String,
            paramsType: [DataType.BigInt],
            paramsValue: [handle],
          }),
        );
      const verify = async () => {
        await window.webContents.executeJavaScript(
          "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        const snapshot = inspect();
        const page = await window.webContents.executeJavaScript(`({
        header:document.querySelector('header').getBoundingClientRect().toJSON(),
        controls:['left','right'].map(id=>document.getElementById(id).getBoundingClientRect().toJSON()),
        overlay:navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON(),
        textDirection:getComputedStyle(document.querySelector('p')).direction})`);
        const zoom = window.webContents.getZoomFactor();
        NodeAssert.equal(page.textDirection, "rtl");
        for (const button of snapshot.buttons) {
          NodeAssert.ok(
            button.x >= 0 && button.x + button.width <= snapshot.width,
            `Clipped button ${button.type}: x=${button.x}`,
          );
          NodeAssert.ok(
            button.hittable && button.enabled && !button.hidden,
            `Unclickable button ${button.type}`,
          );
          const top = snapshot.height - button.y - button.height;
          NodeAssert.ok(
            Math.abs(top + button.height / 2 - (page.header.height * zoom) / 2) <= 1,
            `Button and header centers differ: zoom=${zoom}, top=${top}, height=${page.header.height}, overlay=${JSON.stringify(page.overlay)}`,
          );
          for (const control of page.controls) {
            NodeAssert.ok(
              control.right * zoom <= button.x || control.left * zoom >= button.x + button.width,
              "Web control overlaps a native button",
            );
          }
        }
        NodeAssert.ok(page.overlay.width > 0 && page.overlay.width < snapshot.width / zoom);
      };
      for (const zoom of [1, 1.2, 0.8, 1]) {
        stage = `zoom ${zoom}`;
        window.webContents.setZoomFactor(zoom);
        syncMacosWindowButtons(window);
        await verify();
      }
      window.setSize(800, 500);
      await verify();
      stage = "enter fullscreen";
      const entered = NodeEvents.once(window, "enter-full-screen");
      click(2);
      await entered;
      stage = "leave fullscreen";
      const left = NodeEvents.once(window, "leave-full-screen");
      window.setFullScreen(false);
      await left;
      syncMacosWindowButtons(window);
      await verify();
      stage = "minimize button";
      const minimized = NodeEvents.once(window, "minimize");
      click(1);
      await minimized;
      stage = "restore minimized window";
      const restored = NodeEvents.once(window, "restore");
      window.restore();
      await restored;
      await verify();
      stage = "close button";
      const closed = NodeEvents.once(window, "closed");
      click(0);
      await closed;
      console.log(
        `PASS ${direction}: native placement, hit testing, Hebrew text, zoom, resize, fullscreen, minimize and close`,
      );
      clearTimeout(watchdog);
      app.exit(0);
    })
    .catch((error) => {
      console.error(error);
      clearTimeout(watchdog);
      app.exit(1);
    });
}
