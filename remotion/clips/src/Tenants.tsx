import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BotFace, HenryFace, MinaFace, NoahFace } from "./faces";
import { blue, ink, mute } from "./theme";
import { rise, Wash } from "./ui";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const Face: React.FC<{ readonly size: number; readonly children: React.ReactNode }> = ({ size, children }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", flexShrink: 0 }}>
    <div style={{ width: 92, height: 92, transform: `scale(${size / 92})`, transformOrigin: "top left" }}>{children}</div>
  </div>
);

const Person: React.FC<{
  readonly name: string;
  readonly children: React.ReactNode;
}> = ({ name, children }) => (
  <div style={{ width: 86, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
    <Face size={58}>{children}</Face>
    <span style={{ color: ink, fontSize: 14, fontWeight: 600 }}>{name}</span>
  </div>
);

const AccessLabel: React.FC<{ readonly on: boolean }> = ({ on }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill={on ? blue : "none"} stroke={on ? blue : mute} strokeWidth="1.5" />
      {on ? (
        <path d="M5.15 9.15 7.65 11.55 12.85 6.35" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M5.4 9h7.2" fill="none" stroke={mute} strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
    <span style={{ color: on ? ink : mute, fontSize: 14, fontWeight: 600 }}>{on ? "Invited" : "Not invited"}</span>
  </span>
);

const Talk: React.FC<{
  readonly name: string;
  readonly ask: string;
  readonly answer: string;
  readonly face: React.ReactNode;
}> = ({ name, ask, answer, face }) => {
  const frame = useCurrentFrame();
  const count = Math.max(0, Math.min(ask.length, frame - 126));
  const typed = ask.slice(0, count);
  const dotsFrom = 126 + ask.length + 8;
  const replyFrom = dotsFrom + 42;
  const shell = interpolate(frame, [dotsFrom, dotsFrom + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "0 8px" }}>
      <Face size={42}>{face}</Face>
      <div>
        <div style={{ color: mute, fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div style={{ color: ink, fontSize: 18, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.25, minHeight: 23 }}>
          {typed}
          {count < ask.length ? <span style={{ display: "inline-block", width: 2, height: 16, marginLeft: 1, background: ink, transform: "translateY(2px)" }} /> : null}
        </div>
      </div>
    </div>
    <div style={{ maxHeight: shell * 148, overflow: "hidden", opacity: shell }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 22,
          background: "#eef3ff",
        }}
      >
        <Face size={42}><BotFace /></Face>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: blue, fontSize: 13, fontWeight: 600 }}>Sederunt</div>
          <div style={{ minHeight: 46, display: "flex", alignItems: "center" }}>
            {frame < replyFrom ? (
              <span style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 22 }}>
                {[0, 1, 2].map((dot) => {
                  const lift = Math.max(0, Math.sin((frame - dotsFrom) * 0.45 - dot * 0.9)) * 6;
                  return <span key={dot} style={{ width: 7, height: 7, borderRadius: 4, background: blue, transform: `translateY(${-lift}px)` }} />;
                })}
              </span>
            ) : (
              <div style={{ color: ink, fontSize: 16, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.35, whiteSpace: "pre-line" }}>{answer}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export const Tenants: React.FC = () => {
  const frame = useCurrentFrame();
  const group = rise(frame, 8);
  const handoff = interpolate(frame, [120, 138], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <Wash>
      <div
        style={{
          width: 1040,
          height: 330,
          position: "relative",
          borderRadius: 28,
          background: "#ffffff",
          boxShadow: "0 28px 70px rgba(72, 84, 140, 0.13)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 1 - handoff,
            padding: "26px 32px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ ...group, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Img src={staticFile("logos/meet.svg")} style={{ width: 22, height: 22 }} />
              <span style={{ color: ink, fontSize: 18, fontWeight: 600, letterSpacing: "-0.03em" }}>Client call</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 36, marginTop: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "16px 18px 12px", borderRadius: 24, background: "#f4f6fb" }}>
                  <Person name="Noah"><NoahFace /></Person>
                  <Person name="Mina"><MinaFace /></Person>
                  <Person name="Sederunt"><BotFace /></Person>
                </div>
                <AccessLabel on />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 16 }}>
                <Person name="Henry"><HenryFace /></Person>
                <AccessLabel on={false} />
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: handoff, padding: "28px 24px", display: "flex", alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
          <Talk
            name="Noah"
            face={<NoahFace />}
            ask="What happened on the client call?"
            answer={"Mina took the client call.\nNoah sent the notes that day."}
          />
          <Talk
            name="Henry"
            face={<HenryFace />}
            ask="What happened on the client call?"
            answer="I can't see that. Ask someone who was there."
          />
          </div>
        </div>
      </div>
    </Wash>
  );
};
