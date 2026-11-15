import type { CSSProperties } from "react";
import { loadFont } from "@remotion/google-fonts/Inter";

const loaded = loadFont("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

export const fontFamily = loaded.fontFamily;

export const ink = "#17181c";
export const mute = "#8b909a";
export const line = "#e6e8f0";
export const blue = "#2458F6";

export const labelStyle: CSSProperties = {
  color: mute,
  fontFamily,
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: "0.02em",
};

export const rowText: CSSProperties = {
  color: ink,
  fontFamily,
  fontSize: 22,
  fontWeight: 500,
  letterSpacing: "-0.02em",
};
