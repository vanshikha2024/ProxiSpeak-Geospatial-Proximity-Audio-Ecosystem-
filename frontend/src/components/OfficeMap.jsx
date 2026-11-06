
import "./OfficeMap.css";
import OfficeCanvas from "./OfficeCanvas";

function OfficeMap({
  users = [],
  currentUserId,
  localPosition,
  audioRadius = 0,
  obstacles = [],
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
        />
      </div>
    </section>
  );
}

export default OfficeMap;
