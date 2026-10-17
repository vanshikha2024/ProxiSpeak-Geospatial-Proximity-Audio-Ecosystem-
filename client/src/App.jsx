// ---------------------------------------------------------------
// App.jsx - puts the pieces together.
// (All the heavy work lives in hooks/ and components/.)
// ---------------------------------------------------------------
import "./App.css";
import JoinScreen from "./components/JoinScreen";
import OfficeCanvas from "./components/OfficeCanvas";
import TopBar from "./components/TopBar";
import { useSocket } from "./hooks/useSocket";

export default function App() {
  const {
    socket,
    connected,
    connectError,
    users,
    usersRef,
    myId,
    spawn,
    profile,
    join,
  } = useSocket();

  return (
    <main className="page">
      <TopBar connected={connected} connectError={connectError} />

      {/* Step 1: ask for a name and room.  Step 2: show the office. */}
      {!profile ? (
        <JoinScreen connected={connected} onJoin={join} />
      ) : (
        <section className="office">
          <div className="office-title">
            <div>
              <h2>Virtual Office</h2>
              <p>
                Room: <strong>{profile.roomId}</strong> - move around to
                explore.
              </p>
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
      )}
    </main>
  );
}
