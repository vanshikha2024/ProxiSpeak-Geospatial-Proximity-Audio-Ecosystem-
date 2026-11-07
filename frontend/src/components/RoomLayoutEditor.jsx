import { useEffect, useState } from "react";
import "./RoomLayoutEditor.css";

function RoomLayoutEditor({ room, onSave, onCancel }) {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    if (!room) return;

    setLayout({
      width: room.width ?? 1920,
      height: room.height ?? 1080,
      audioRadius: room.audioRadius ?? 100,
      capacity: room.capacity ?? 300,
      spawnPoint: {
        x: room.spawnPoint?.x ?? 500,
        y: room.spawnPoint?.y ?? 250,
      },
      obstacles: (room.obstacles ?? []).map((item) => ({ ...item })),
    });
  }, [room]);

  if (!room || !layout) return null;

  function updateField(field, value) {
    setLayout((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSpawn(field, value) {
    setLayout((current) => ({
      ...current,
      spawnPoint: {
        ...current.spawnPoint,
        [field]: value,
      },
    }));
  }

  function updateObstacle(index, field, value) {
    setLayout((current) => ({
      ...current,
      obstacles: current.obstacles.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addObstacle() {
    setLayout((current) => ({
      ...current,
      obstacles: [
        ...current.obstacles,
        {
          x: 100,
          y: 100,
          width: 100,
          height: 50,
          label: "New obstacle",
          blocksMovement: true,
          blocksSound: true,
          soundAttenuation: 0.5,
        },
      ],
    }));
  }

  function removeObstacle(index) {
    setLayout((current) => ({
      ...current,
      obstacles: current.obstacles.filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(layout);
  }

  return (
    <form className="room-layout-editor" onSubmit={handleSubmit}>
      <h2>Edit Room Layout: {room.name}</h2>

      <h3>Room Settings</h3>

      <label>
        Width
        <input
          type="number"
          min="1"
          value={layout.width}
          onChange={(e) => updateField("width", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Height
        <input
          type="number"
          min="1"
          value={layout.height}
          onChange={(e) => updateField("height", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Audio Radius
        <input
          type="number"
          min="1"
          value={layout.audioRadius}
          onChange={(e) => updateField("audioRadius", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Capacity
        <input
          type="number"
          min="1"
          value={layout.capacity}
          onChange={(e) => updateField("capacity", Number(e.target.value))}
          required
        />
      </label>

      <h3>Spawn Point</h3>

      <label>
        X
        <input
          type="number"
          value={layout.spawnPoint.x}
          onChange={(e) => updateSpawn("x", Number(e.target.value))}
          required
        />
      </label>

      <label>
        Y
        <input
          type="number"
          value={layout.spawnPoint.y}
          onChange={(e) => updateSpawn("y", Number(e.target.value))}
          required
        />
      </label>

      <h3>Obstacles</h3>

      {layout.obstacles.map((item, index) => (
        <fieldset key={index}>
          <legend>{item.label || `Obstacle ${index + 1}`}</legend>

          {["label", "x", "y", "width", "height", "soundAttenuation"].map(
            (field) => (
              <label key={field}>
                {field}
                <input
                  type={field === "label" ? "text" : "number"}
                  min={field === "label" ? undefined : "0"}
                  step={field === "soundAttenuation" ? "0.1" : "1"}
                  value={item[field] ?? ""}
                  onChange={(e) =>
                    updateObstacle(
                      index,
                      field,
                      field === "label" ? e.target.value : Number(e.target.value)
                    )
                  }
                  required
                />
              </label>
            )
          )}

          <label>
            <input
              type="checkbox"
              checked={item.blocksMovement !== false}
              onChange={(e) =>
                updateObstacle(index, "blocksMovement", e.target.checked)
              }
            />
            Blocks Movement
          </label>

          <label>
            <input
              type="checkbox"
              checked={item.blocksSound !== false}
              onChange={(e) =>
                updateObstacle(index, "blocksSound", e.target.checked)
              }
            />
            Blocks Sound
          </label>

          <button type="button" onClick={() => removeObstacle(index)}>
            Remove Obstacle
          </button>
        </fieldset>
      ))}

      <button type="button" onClick={addObstacle}>
        Add Obstacle
      </button>

      <div>
        <button type="submit">Save Layout</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default RoomLayoutEditor;
