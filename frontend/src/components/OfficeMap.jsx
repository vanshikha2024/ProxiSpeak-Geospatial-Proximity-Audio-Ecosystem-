import "./OfficeMap.css";

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1200;

function getPositionPercent(value, dimension, fallback) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const percentage = (safeValue / dimension) * 100;

  // Keep avatars visible near the edges of the map.
  return Math.min(98, Math.max(2, percentage));
}

function OfficeMap({ users = [], currentUserId, localPosition }) {
  const nearbyCount = users.filter((user) => user.isNearby).length;
  const peopleCount = users.length + (currentUserId ? 1 : 0);

  return (
    <section className="office-section">
      <div className="office-heading">
        <div>
          <h2>Virtual Office</h2>
          <p>Everyone in your shared workspace</p>
        </div>

        <span className="people-count">
          {peopleCount} {peopleCount === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="office-map-summary">
        <span className="map-summary-item">
          <span className="map-summary-dot map-summary-dot-you" />
          You
        </span>

        <span className="map-summary-item">
          <span className="map-summary-dot map-summary-dot-team" />
          Teammates
        </span>

        <span className="map-summary-item">
          <span className="map-summary-dot map-summary-dot-nearby" />
          Nearby: {nearbyCount}
        </span>
      </div>

      <div
        className="office-map"
        role="img"
        aria-label={`Virtual office map with ${peopleCount} ${
          peopleCount === 1 ? "person" : "people"
        }, including ${nearbyCount} nearby teammates`}
      >
        {currentUserId && (
          <div
            className="office-avatar self-avatar"
            style={{
              left: `${getPositionPercent(
                localPosition?.x,
                MAP_WIDTH,
                500
              )}%`,
              top: `${getPositionPercent(
                localPosition?.y,
                MAP_HEIGHT,
                250
              )}%`,
            }}
            title="Your avatar"
          >
            <div className="avatar-circle">You</div>
            <span className="avatar-name">You</span>
          </div>
        )}

        {users.map((user) => {
          const displayName = user.name || user.username || "Guest";
          const isNearby = Boolean(user.isNearby);

          return (
            <div
              key={user.id}
              className={`office-avatar remote-avatar ${
                isNearby ? "nearby-avatar" : ""
              }`}
              style={{
                left: `${getPositionPercent(user.x, MAP_WIDTH, 100)}%`,
                top: `${getPositionPercent(user.y, MAP_HEIGHT, 100)}%`,
              }}
              title={`${displayName}${isNearby ? " — nearby" : ""}`}
            >
              <div
                className="avatar-circle"
                style={{ backgroundColor: user.color || "#6366f1" }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>

              <span className="avatar-name">{displayName}</span>

              {isNearby && (
                <span className="avatar-nearby-label">Nearby</span>
              )}
            </div>
          );
        })}

        {!currentUserId && (
          <p className="map-empty">Join an office to see your avatar.</p>
        )}

        {currentUserId && users.length === 0 && (
          <p className="map-hint">You’re here. Invite a teammate to join you.</p>
        )}
      </div>
    </section>
  );
}

export default OfficeMap;