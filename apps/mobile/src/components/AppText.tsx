import {
  Platform,
  findNodeHandle,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputInstance,
  type TextInputProps as RNTextInputProps,
  type TextProps as RNTextProps,
} from "react-native";
import {
  naturalTextDirection,
  setNaturalTextAlignment,
} from "@t3tools/mobile-markdown-text/primitive";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "../lib/cn";

export type AppTextProps = RNTextProps & {
  readonly className?: string;
  readonly naturalDirection?: boolean;
};

/**
 * Thin wrapper around RN Text with default font-family and foreground color.
 * Uses Uniwind className — no manual style parsing.
 */
export function AppText({ className, naturalDirection, onLayout, ...props }: AppTextProps) {
  const textTag = useRef<number | null>(null);
  const alignmentStyle = useMemo(
    () =>
      naturalDirection && Platform.OS === "android" && typeof props.children === "string"
        ? { direction: naturalTextDirection(props.children) }
        : undefined,
    [naturalDirection, props.children],
  );
  // RN can replace native text on any prop update, even without a new layout event.
  useEffect(() => {
    if (naturalDirection && Platform.OS === "android" && textTag.current !== null) {
      setNaturalTextAlignment(textTag.current);
    }
  });
  return (
    <RNText
      className={cn("font-sans text-foreground", className)}
      selectionColorClassName={Platform.OS === "android" ? "accent-focus/32" : undefined}
      {...props}
      style={alignmentStyle ? [props.style, alignmentStyle] : props.style}
      onLayout={
        naturalDirection && Platform.OS === "android"
          ? (event) => {
              const tag =
                typeof event.currentTarget === "number"
                  ? event.currentTarget
                  : findNodeHandle(event.currentTarget);
              textTag.current = tag ?? null;
              if (typeof tag === "number") setNaturalTextAlignment(tag);
              onLayout?.(event);
            }
          : onLayout
      }
    />
  );
}

export type AppTextInputProps = Omit<RNTextInputProps, "placeholderTextColor"> & {
  readonly className?: string;
  readonly ref?: React.Ref<TextInputInstance>;
};

/**
 * Thin wrapper around RN TextInput with default input styling.
 * Uses Uniwind className — no manual style parsing.
 */
export function AppTextInput({ className, ref, ...props }: AppTextInputProps) {
  return (
    <RNTextInput
      ref={ref}
      className={cn(
        "min-h-13.5 rounded-2xl border border-input-border bg-input px-3.5 py-3 font-sans text-base text-foreground",
        className,
      )}
      placeholderTextColorClassName="accent-placeholder"
      selectionColorClassName={"accent-focus/32"}
      cursorColorClassName={"accent-focus"}
      selectionHandleColorClassName={Platform.OS === "android" ? "accent-focus" : undefined}
      {...props}
    />
  );
}
