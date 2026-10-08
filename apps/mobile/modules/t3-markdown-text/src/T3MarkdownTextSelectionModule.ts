import { requireOptionalNativeModule } from "expo";

interface T3MarkdownTextSelectionNativeModule {
  readonly naturalTextDirection?: (text: string) => "ltr" | "rtl";
  readonly setNaturalTextAlignment?: (reactTag: number) => void;
  readonly setSelectionHandleColor?: (reactTag: number, color: number) => void;
  readonly installCopySanitizer: (reactTag: number, contextClipboardConfig: string) => void;
  readonly renderContextChip?: (payloadJson: string) => {
    readonly uri: string;
    readonly width: number;
    readonly height: number;
    /** Inline box height: the paragraph font's ascent, so the line box never grows. */
    readonly boxHeight: number;
    /** Bitmap top relative to the box top; negative when the chip overhangs the box. */
    readonly offsetY: number;
  } | null;
}

const nativeModule =
  requireOptionalNativeModule<T3MarkdownTextSelectionNativeModule>("T3MarkdownTextSelection");

export function installMarkdownCopySanitizer(reactTag: number, contextClipboardConfig = ""): void {
  nativeModule?.installCopySanitizer(reactTag, contextClipboardConfig);
}

export function setMarkdownSelectionHandleColor(reactTag: number, color: number): void {
  nativeModule?.setSelectionHandleColor?.(reactTag, color);
}

export function setNaturalTextAlignment(reactTag: number): void {
  nativeModule?.setNaturalTextAlignment?.(reactTag);
}

export function naturalTextDirection(text: string): "ltr" | "rtl" {
  return nativeModule?.naturalTextDirection?.(text) ?? "ltr";
}

export function renderAndroidContextChip(payloadJson: string) {
  return nativeModule?.renderContextChip?.(payloadJson) ?? null;
}
