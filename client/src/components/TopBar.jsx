// ---------------------------------------------------------------
// components/TopBar.jsx - the title and the connection status.
// ---------------------------------------------------------------
export default function TopBar({ connected }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">SPATIAL COLLABORATION</p>
        <h1>ProxiSpeak</h1>
        <p>Your virtual office, where conversations happen naturally.</p>
      </div>

      <span className={`status ${connected ? "online" : ""}`}>
        {connected ? "● Connected" : "○ Connecting..."}
      </span>
    </header>
  );
}