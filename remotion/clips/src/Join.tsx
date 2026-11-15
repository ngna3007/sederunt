import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { Line } from "./meeting";
import { Meeting } from "./meeting";
import { Wash } from "./ui";

const lines: readonly Line[] = [
  { who: "Noah", text: "Anyone free for the client call tomorrow?", from: 18, to: 90 },
  { who: "Mina", text: "I can take it. You send the notes after?", from: 98, to: 170 },
  { who: "Noah", text: "Sure. Hey @Sederunt, how did we do it last week?", from: 178, to: 262 },
  { who: "Sederunt", text: "Mina took the call. Noah sent the notes that day.", from: 274, to: 356 },
  { who: "Mina", text: "Perfect. Let's do that again.", from: 364, to: 408 },
];

export const Join: React.FC = () => {
  const frame = useCurrentFrame();
  const open = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <Wash>
      <div style={{ opacity: open, translate: `0px ${(1 - open) * 12}px` }}>
        <Meeting lines={lines} />
      </div>
    </Wash>
  );
};
