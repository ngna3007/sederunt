import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BotFace, MinaFace, NoahFace } from "./faces";
import { blue, ink, mute } from "./theme";
import { cardStyle } from "./ui";

export type Speaker = "Noah" | "Mina" | "Sederunt";

export type Line = {
  readonly who: Speaker;
  readonly text: string;
  readonly from: number;
  readonly to: number;
};

const speak = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, from + 8, to - 8, to], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Face: React.FC<{ readonly who: Speaker }> = ({ who }) => {
  if (who === "Noah") return <NoahFace />;
  if (who === "Mina") return <MinaFace />;
  return <BotFace />;
};

const Tile: React.FC<{
  readonly who: Speaker;
  readonly tint: string;
  readonly active: number;
  readonly height: number;
}> = ({ who, tint, active, height }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: 18,
        background: tint,
        border: `2px solid rgba(36, 88, 246, ${0.08 + active * 0.92})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        scale: `${1 + active * 0.025}`,
      }}
    >
      <Face who={who} />
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: ink, fontSize: 15, fontWeight: 600 }}>{who}</span>
        <span style={{ display: "flex", gap: 3, height: 14, alignItems: "flex-end", opacity: active }}>
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              style={{
                width: 3,
                borderRadius: 2,
                background: blue,
                height: 4 + Math.abs(Math.sin(frame * 0.45 + bar)) * 10 * active,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
};

const CaptionText: React.FC<{ readonly text: string }> = ({ text }) => {
  const mark = "@Sederunt";
  const at = text.indexOf(mark);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: "#9eb6ff", fontWeight: 600 }}>{mark}</span>
      {text.slice(at + mark.length)}
    </>
  );
};

export const Meeting: React.FC<{
  readonly lines: readonly Line[];
  readonly width?: number;
  readonly footer?: React.ReactNode;
}> = ({ lines, width = 900, footer }) => {
  const frame = useCurrentFrame();
  const level = (who: Speaker) =>
    lines.reduce((sum, line) => (line.who === who ? Math.max(sum, speak(frame, line.from, line.to)) : sum), 0);

  return (
    <div
      style={{
        ...cardStyle,
        width,
        position: "relative",
        padding: "18px 22px 24px",
        gap: 0,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Img src={staticFile("logos/meet.svg")} style={{ width: 22, height: 22 }} />
        <span style={{ color: ink, fontSize: 16, fontWeight: 600 }}>Standup</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "#2f9e62" }} />
        <span style={{ color: mute, fontSize: 13, fontWeight: 500 }}>Live</span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Tile who="Noah" tint="#e7eefc" active={level("Noah")} height={196} />
        <Tile who="Mina" tint="#f8eef6" active={level("Mina")} height={196} />
        <Tile who="Sederunt" tint="#e8eeff" active={level("Sederunt")} height={196} />
      </div>
      <div style={{ height: 46, position: "relative" }}>
        {lines.map((line) => (
          <div
            key={`${line.who}-${line.from}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              display: "flex",
              justifyContent: "center",
              opacity: speak(frame, line.from, line.to),
            }}
          >
            <div
              style={{
                maxWidth: 760,
                padding: "10px 16px",
                borderRadius: 12,
                background: "rgba(23, 24, 28, 0.92)",
                color: "#ffffff",
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.35,
                textAlign: "center",
              }}
            >
              <span style={{ color: "#b9c7ee", marginRight: 8, fontWeight: 600 }}>{line.who}</span>
              <CaptionText text={line.text} />
            </div>
          </div>
        ))}
      </div>
      </div>
      {footer}
    </div>
  );
};
