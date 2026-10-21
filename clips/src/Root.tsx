import { Composition, Folder } from "remotion";
import { Implement } from "./Implement";
import { Join } from "./Join";
import { Remember } from "./Remember";
import { Tenants } from "./Tenants";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="Sections">
      <Composition id="Join" component={Join} durationInFrames={420} fps={30} width={1120} height={480} />
      <Composition id="Remember" component={Remember} durationInFrames={240} fps={30} width={1120} height={480} />
      <Composition id="Implement" component={Implement} durationInFrames={420} fps={30} width={1120} height={480} />
      <Composition id="Tenants" component={Tenants} durationInFrames={340} fps={30} width={1120} height={480} />
    </Folder>
  );
};
