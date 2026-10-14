import { close, DataType, load, open } from "ffi-rs";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

// Matches --workspace-topbar-height. Native buttons remain 14 points tall at any zoom.
const TOPBAR_HEIGHT = 52;
const BUTTON_RADIUS = 7;

export function getMacosWindowTitleBarOptions() {
  return {
    titleBarStyle: "hiddenInset",
    titleBarOverlay: true,
    trafficLightPosition: { x: 16, y: TOPBAR_HEIGHT / 2 - BUTTON_RADIUS },
  } satisfies Pick<
    BrowserWindowConstructorOptions,
    "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"
  >;
}

export function syncMacosWindowButtons(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isFullScreen()) return;
  const height = TOPBAR_HEIGHT * window.webContents.getZoomFactor();
  window.setWindowButtonPosition({ x: 16, y: Math.round(height / 2 - BUTTON_RADIUS) });
}

/** Read AppKit's direction, which can differ from the bundled Chromium locale. */
export function getMacosAppLayoutDirection(): "ltr" | "rtl" {
  const library = "t3-macos-layout-direction";
  open({ library, path: "/usr/lib/libobjc.A.dylib" });
  try {
    const applicationClass = load({
      library,
      funcName: "objc_getClass",
      retType: DataType.BigInt,
      paramsType: [DataType.String],
      paramsValue: ["NSApplication"],
    }) as bigint;
    const send = (receiver: bigint, name: string) => {
      const selector = load({
        library,
        funcName: "sel_registerName",
        retType: DataType.BigInt,
        paramsType: [DataType.String],
        paramsValue: [name],
      }) as bigint;
      return load({
        library,
        funcName: "objc_msgSend",
        retType: DataType.BigInt,
        paramsType: [DataType.BigInt, DataType.BigInt],
        paramsValue: [receiver, selector],
      }) as bigint;
    };
    return send(send(applicationClass, "sharedApplication"), "userInterfaceLayoutDirection") === 1n
      ? "rtl"
      : "ltr";
  } finally {
    close(library);
  }
}
