// ---------------------------------------------------------------
// App.jsx - puts the pieces together.
// (All the heavy work lives in hooks/ and components/.)
// ---------------------------------------------------------------
import "./App.css";
import OfficeCanvas from "./components/OfficeCanvas";
import TopBar from "./components/TopBar";
import { useSocket } from "./hooks/useSocket";

export default function App() {
  const { socket, connected, users, usersRef, myId, spawn } = useSocket();

  return (
    <main className="page">
      <TopBar connected={connected} />

      <section className="office">
        <div className="office-title">
          <div>
            <h2>Virtual Office</h2>
            <p>Move around to explore the shared space.</p>
          </div>
          <span className="online-count">
            <strong>{users.length}</strong> online
          </span>
        </div>

        <OfficeCanvas
          socket={socket}
          connected={connected}
          usersRef={usersRef}
          myId={myId}
          spawn={spawn}
        />
      </section>
    </main>
  );
}