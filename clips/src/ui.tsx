import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { blue, fontFamily, ink, mute, rowText } from "./theme";

export const Wash: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = Math.min(
    interpolate(frame, [0, 0.28 * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [durationInFrames - 0.45 * fps, durationInFrames - 1], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #e7ecfb 0%, #f5f3fb 46%, #fbfbfd 100%)",
        fontFamily,
      }}
    >
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 74% 16%, rgba(188, 198, 246, 0.55), transparent 52%)",
        }}
      />
      <AbsoluteFill
        style={{
          opacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const cardStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: 28,
  border: "1px solid rgba(255, 255, 255, 0.92)",
  boxShadow: "0 28px 70px rgba(72, 84, 140, 0.13)",
  padding: "26px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const rise = (frame: number, start: number) => ({
  opacity: interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  }),
  translate: `0px ${interpolate(frame, [start, start + 16], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })}px`,
});

export const Check: React.FC<{ readonly start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const amount = interpolate(frame, [start, start + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        border: "1.5px solid #d5d8e4",
        background: blue,
        flexShrink: 0,
        opacity: amount,
        scale: 0.7 + amount * 0.3,
      }}
    />
  );
};

export const ProductRow: React.FC<{
  readonly text: string;
  readonly start: number;
  readonly mark?: string;
  readonly markSize?: number;
}> = ({ text, start, mark, markSize = 28 }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        ...rise(frame, start),
        display: "flex",
        alignItems: "center",
        gap: 14,
        minHeight: 64,
        padding: "0 16px",
        borderRadius: 16,
        border: `1px solid ${"#e7e9f2"}`,
        background: "#fbfbfe",
      }}
    >
      {mark ? (
        <Img src={staticFile(mark)} style={{ width: markSize, height: markSize, objectFit: "contain" }} />
      ) : null}
      <span style={{ ...rowText, flex: 1 }}>{text}</span>
      <Check start={start + 8} />
    </div>
  );
};

export const Quiet: React.FC<{ readonly children: React.ReactNode; readonly start: number }> = ({
  children,
  start,
}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ ...rise(frame, start), color: mute, fontSize: 16, fontWeight: 500 }}>{children}</div>
  );
};

export const inkColor = ink;
