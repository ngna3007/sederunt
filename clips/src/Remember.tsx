import { Easing, interpolate, useCurrentFrame } from "remotion";
import { BotFace, NoahFace } from "./faces";
import { blue, ink, mute } from "./theme";
import { Wash, cardStyle } from "./ui";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const rise = (frame: number, start: number) =>
  interpolate(frame, [start, start + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

const Face: React.FC<{ readonly who: "Noah" | "Sederunt" }> = ({ who }) => (
  <div style={{ width: 48, height: 48, borderRadius: 24, overflow: "hidden", flexShrink: 0 }}>
    <div style={{ width: 92, height: 92, transform: "scale(0.5217)", transformOrigin: "top left" }}>
      {who === "Noah" ? <NoahFace /> : <BotFace />}
    </div>
  </div>
);

const question = "Who's taking the client call?";
const reply = "Mina is. You send the notes after.";

export const Remember: React.FC = () => {
  const frame = useCurrentFrame();
  const ask = rise(frame, 14);
  const typeFrom = 20;
  const count = Math.max(0, Math.min(question.length, frame - typeFrom));
  const dotsFrom = typeFrom + question.length + 8;
  const replyFrom = dotsFrom + 42;
  const shell = interpolate(frame, [dotsFrom, dotsFrom + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <Wash>
      <div style={{ ...cardStyle, width: 700, padding: "28px 28px 24px", gap: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            textAlign: "left",
            padding: "0 16px",
            opacity: ask,
            translate: `0px ${(1 - ask) * 10}px`,
          }}
        >
          <Face who="Noah" />
          <div>
            <div style={{ color: mute, fontSize: 13, fontWeight: 600 }}>Noah</div>
            <div style={{ color: ink, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.25, minHeight: 28 }}>
              {question.slice(0, count)}
              {count < question.length ? (
                <span style={{ display: "inline-block", width: 2, height: 20, marginLeft: 1, background: ink, transform: "translateY(3px)" }} />
              ) : null}
            </div>
          </div>
        </div>
        <div style={{ maxHeight: shell * 92, overflow: "hidden", opacity: shell }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              textAlign: "left",
              marginTop: 16,
              padding: "14px 16px",
              borderRadius: 22,
              background: "#eef3ff",
            }}
          >
            <Face who="Sederunt" />
            <div>
              <div style={{ color: blue, fontSize: 13, fontWeight: 600 }}>Sederunt</div>
              {frame < replyFrom ? (
                <span style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 28 }}>
                  {[0, 1, 2].map((dot) => {
                    const lift = Math.max(0, Math.sin((frame - dotsFrom) * 0.45 - dot * 0.9)) * 7;
                    return <span key={dot} style={{ width: 8, height: 8, borderRadius: 4, background: blue, transform: `translateY(${-lift}px)` }} />;
                  })}
                </span>
              ) : (
                <div style={{ color: ink, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.25 }}>{reply}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Wash>
  );
};
