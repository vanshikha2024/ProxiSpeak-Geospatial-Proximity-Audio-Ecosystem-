
import "./OfficeMap.css";
import OfficeCanvas from "./OfficeCanvas";

function OfficeMap({
  users = [],
  currentUserId,
  localPosition,
  audioRadius = 0,
  obstacles = [],
  roomWidth = 1920,
  roomHeight = 1080,
}) {
  return (
    <section className="office-section">
      <div className="office-map">
        <OfficeCanvas
          users={users}
          currentUserId={currentUserId}
          localPosition={localPosition}
          audioRadius={audioRadius}
          obstacles={obstacles}
          roomWidth={roomWidth}
          roomHeight={roomHeight}
        />
      </div>
    </section>
  );
}

export default OfficeMap;
