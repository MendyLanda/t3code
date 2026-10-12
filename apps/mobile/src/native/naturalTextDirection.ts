import { requireOptionalNativeModule } from "expo";

const nativeControls = requireOptionalNativeModule<{
  readonly naturalTextDirection?: (text: string) => "ltr" | "rtl";
  readonly setNaturalTextAlignment?: (reactTag: number) => void;
}>("T3NativeControls");

export function naturalTextDirection(text: string): "ltr" | "rtl" {
  return nativeControls?.naturalTextDirection?.(text) ?? "ltr";
}

export function setNaturalTextAlignment(reactTag: number): void {
  nativeControls?.setNaturalTextAlignment?.(reactTag);
}
