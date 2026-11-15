import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { Line } from "./meeting";
import { Meeting } from "./meeting";
import { ink, mute } from "./theme";
import { Wash } from "./ui";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const lines: readonly Line[] = [
  { who: "Noah", text: "The totals are off by one.", from: 16, to: 78 },
  { who: "Mina", text: "That's a fix. Rowan should own ENG-406.", from: 86, to: 160 },
  { who: "Noah", text: "Hey @Sederunt, update Linear. Assign ENG-406 to Rowan.", from: 168, to: 246 },
  { who: "Sederunt", text: "Assigned to Rowan.", from: 292, to: 380 },
];

const LinearMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#222326"
      d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"
    />
  </svg>
);

const AssignIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.15" fill="none" stroke={mute} strokeWidth="1.25" />
    <circle cx="8" cy="6.15" r="1.55" fill={mute} />
    <path
      d="M4.35 11.55c.72-1.55 2.05-2.3 3.65-2.3s2.93.75 3.65 2.3"
      fill="none"
      stroke={mute}
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
);

const Ticket: React.FC = () => {
  const frame = useCurrentFrame();
  const open = interpolate(frame, [232, 268], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const person = interpolate(frame, [268, 286], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const badge = interpolate(frame, [268, 282], [0.62, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const height = open * 64;

  return (
    <div style={{ height, overflow: "hidden", opacity: open }}>
      <div
        style={{
          borderTop: "1px solid #e7e9f2",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <LinearMark />
            <div>
              <div style={{ color: ink, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>
                ENG-406
              </div>
              <div style={{ marginTop: 4, color: mute, fontSize: 14, fontWeight: 500 }}>Fix the totals</div>
            </div>
          </div>
          <div style={{ position: "relative", height: 28, minWidth: 176, flexShrink: 0 }}>
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                height: 28,
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: 1 - person,
              }}
            >
              <AssignIcon />
              <span style={{ color: mute, fontSize: 16, fontWeight: 500 }}>Assign</span>
            </div>
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                height: 28,
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: person,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "#4cb782",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 650,
                  letterSpacing: "-0.04em",
                  scale: `${badge}`,
                }}
              >
                RN
              </div>
              <span style={{ color: ink, fontSize: 16, fontWeight: 500 }}>Rowan Nguyen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Implement: React.FC = () => {
  const frame = useCurrentFrame();
  const open = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <Wash>
      <div style={{ opacity: open, translate: `0px ${(1 - open) * 12}px` }}>
        <Meeting lines={lines} width={920} footer={<Ticket />} />
      </div>
    </Wash>
  );
};
