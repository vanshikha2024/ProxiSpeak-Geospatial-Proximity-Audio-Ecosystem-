import "./NearbyPanel.css";

function NearbyPanel({ nearbyUsers = [], audioRadius = 100 }) {
  const nearby = nearbyUsers.filter((user) => user.isNearby);

  return (
    <section className="nearby-panel">
      <h2>Nearby Teammates</h2>
      <p className="nearby-subtitle">
        People within {audioRadius} pixels of your avatar
      </p>

      {nearby.length === 0 ? (
        <p className="nearby-empty">
          No one nearby. Move closer to a teammate!
        </p>
      ) : (
        <ul className="nearby-list">
          {nearby.map((user) => (
            <li className="nearby-item" key={user.id}>
              <span
                className="nearby-dot"
                style={{ backgroundColor: user.color || "#6366f1" }}
              />
              <span className="nearby-name">{user.name || user.username || "Guest"}</span>
              <span className="nearby-distance">{user.distance} pixels</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default NearbyPanel;
