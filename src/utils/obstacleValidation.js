import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_SPAWN_X,
  DEFAULT_SPAWN_Y,
} from '../config/constants.js';

/**
 * Checks whether a 2D point (px, py) falls inside or on the boundary of an obstacle rectangle.
 *
 * @param {object} point - Point with numeric coordinates { x, y }
 * @param {object} obstacle - Obstacle with { x, y, width, height }
 * @returns {boolean} True if point intersects or is inside obstacle bounds
 */
export function isPointInsideObstacle(point, obstacle) {
  if (!point || !obstacle) return false;
  const px = point.x;
  const py = point.y;
  const ox = obstacle.x;
  const oy = obstacle.y;
  const ow = obstacle.width;
  const oh = obstacle.height;

  if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !Number.isFinite(ox) ||
    !Number.isFinite(oy) ||
    !Number.isFinite(ow) ||
    !Number.isFinite(oh)
  ) {
    return false;
  }

  return px >= ox && px <= ox + ow && py >= oy && py <= oy + oh;
}

/**
 * Validates room dimensions (width and height).
 *
 * @param {number} width - Room width in pixels
 * @param {number} height - Room height in pixels
 * @returns {string[]} Array of error messages, empty if valid
 */
export function validateRoomDimensions(width, height) {
  const errors = [];

  if (width === undefined || width === null) {
    errors.push('Room width is required');
  } else if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    errors.push(`Room width must be a positive number (received: ${width})`);
  }

  if (height === undefined || height === null) {
    errors.push('Room height is required');
  } else if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
    errors.push(`Room height must be a positive number (received: ${height})`);
  }

  return errors;
}

/**
 * Validates a single furniture or sound obstacle against room boundaries.
 *
 * @param {object} obstacle - Obstacle object with { x, y, width, height, label }
 * @param {number} roomWidth - Total room width
 * @param {number} roomHeight - Total room height
 * @param {number} [index=0] - Obstacle index in layout array
 * @returns {string[]} Array of error messages, empty if valid
 */
export function validateObstacle(obstacle, roomWidth, roomHeight, index = 0) {
  const errors = [];

  if (!obstacle || typeof obstacle !== 'object' || Array.isArray(obstacle)) {
    errors.push(`Obstacle [${index}] must be a valid object`);
    return errors;
  }

  const label =
    typeof obstacle.label === 'string' && obstacle.label.trim().length > 0
      ? obstacle.label.trim()
      : null;

  if (!label) {
    errors.push(`Obstacle [${index}] must have a non-empty string label`);
  }

  const obstacleTag = label ? `"${label}" (index ${index})` : `[${index}]`;

  // Validate x coordinate
  if (obstacle.x === undefined || obstacle.x === null) {
    errors.push(`Obstacle ${obstacleTag} is missing required x coordinate`);
  } else if (typeof obstacle.x !== 'number' || !Number.isFinite(obstacle.x)) {
    errors.push(`Obstacle ${obstacleTag} x coordinate must be a valid number (received: ${obstacle.x})`);
  } else if (obstacle.x < 0) {
    errors.push(`Obstacle ${obstacleTag} x coordinate cannot be negative (received: ${obstacle.x})`);
  }

  // Validate y coordinate
  if (obstacle.y === undefined || obstacle.y === null) {
    errors.push(`Obstacle ${obstacleTag} is missing required y coordinate`);
  } else if (typeof obstacle.y !== 'number' || !Number.isFinite(obstacle.y)) {
    errors.push(`Obstacle ${obstacleTag} y coordinate must be a valid number (received: ${obstacle.y})`);
  } else if (obstacle.y < 0) {
    errors.push(`Obstacle ${obstacleTag} y coordinate cannot be negative (received: ${obstacle.y})`);
  }

  // Validate width
  if (obstacle.width === undefined || obstacle.width === null) {
    errors.push(`Obstacle ${obstacleTag} is missing required width`);
  } else if (typeof obstacle.width !== 'number' || !Number.isFinite(obstacle.width) || obstacle.width <= 0) {
    errors.push(`Obstacle ${obstacleTag} width must be a positive number (received: ${obstacle.width})`);
  }

  // Validate height
  if (obstacle.height === undefined || obstacle.height === null) {
    errors.push(`Obstacle ${obstacleTag} is missing required height`);
  } else if (typeof obstacle.height !== 'number' || !Number.isFinite(obstacle.height) || obstacle.height <= 0) {
    errors.push(`Obstacle ${obstacleTag} height must be a positive number (received: ${obstacle.height})`);
  }

  // Boundary checks (if coordinates, dimensions, and room bounds are valid numbers)
  const isCoordValid =
    Number.isFinite(obstacle.x) &&
    obstacle.x >= 0 &&
    Number.isFinite(obstacle.y) &&
    obstacle.y >= 0 &&
    Number.isFinite(obstacle.width) &&
    obstacle.width > 0 &&
    Number.isFinite(obstacle.height) &&
    obstacle.height > 0;

  if (isCoordValid && Number.isFinite(roomWidth) && roomWidth > 0 && Number.isFinite(roomHeight) && roomHeight > 0) {
    if (obstacle.x + obstacle.width > roomWidth) {
      errors.push(
        `Obstacle ${obstacleTag} extends outside room width (x: ${obstacle.x} + width: ${obstacle.width} = ${obstacle.x + obstacle.width} > room width: ${roomWidth})`
      );
    }
    if (obstacle.y + obstacle.height > roomHeight) {
      errors.push(
        `Obstacle ${obstacleTag} extends outside room height (y: ${obstacle.y} + height: ${obstacle.height} = ${obstacle.y + obstacle.height} > room height: ${roomHeight})`
      );
    }
  }

  return errors;
}

/**
 * Validates room spawn point coordinates against room bounds and obstacles.
 *
 * @param {object} spawnPoint - Coordinate object { x, y }
 * @param {number} roomWidth - Room width in pixels
 * @param {number} roomHeight - Room height in pixels
 * @param {Array<object>} [obstacles=[]] - List of room obstacles
 * @returns {string[]} Array of error messages, empty if valid
 */
export function validateSpawnPoint(spawnPoint, roomWidth, roomHeight, obstacles = []) {
  const errors = [];

  if (!spawnPoint || typeof spawnPoint !== 'object' || Array.isArray(spawnPoint)) {
    errors.push('Spawn point must be an object with numeric x and y coordinates');
    return errors;
  }

  const { x, y } = spawnPoint;

  if (x === undefined || x === null || typeof x !== 'number' || !Number.isFinite(x)) {
    errors.push(`Spawn point x coordinate must be a valid number (received: ${x})`);
  }

  if (y === undefined || y === null || typeof y !== 'number' || !Number.isFinite(y)) {
    errors.push(`Spawn point y coordinate must be a valid number (received: ${y})`);
  }

  const isPointValid = Number.isFinite(x) && Number.isFinite(y);

  if (isPointValid && Number.isFinite(roomWidth) && roomWidth > 0 && Number.isFinite(roomHeight) && roomHeight > 0) {
    if (x < 0 || x > roomWidth) {
      errors.push(`Spawn point x coordinate (${x}) is outside room bounds (0 to ${roomWidth})`);
    }
    if (y < 0 || y > roomHeight) {
      errors.push(`Spawn point y coordinate (${y}) is outside room bounds (0 to ${roomHeight})`);
    }

    // Check collision with obstacles
    if (Array.isArray(obstacles)) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (isPointInsideObstacle(spawnPoint, obs)) {
          const obsLabel = obs?.label ? `"${obs.label}"` : `at index ${i}`;
          errors.push(`Spawn point (${x}, ${y}) cannot be inside obstacle ${obsLabel}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Master validation function for virtual office layouts.
 * Validates dimensions, acoustic settings, capacity, obstacles, and spawn point.
 * Reusable across room creation (POST /api/rooms) and layout updates (PUT /api/rooms/:id/layout).
 *
 * @param {object} layoutData - Room layout payload
 * @param {object} [options={}] - Validation options (e.g. requireName)
 * @returns {{ isValid: boolean, errors: string[] }} Validation result
 */
export function validateRoomLayout(layoutData, options = {}) {
  const errors = [];

  if (!layoutData || typeof layoutData !== 'object' || Array.isArray(layoutData)) {
    return {
      isValid: false,
      errors: ['Layout payload must be a valid object'],
    };
  }

  // 1. Name validation
  if (options.requireName || layoutData.name !== undefined) {
    if (!layoutData.name || typeof layoutData.name !== 'string' || !layoutData.name.trim()) {
      errors.push('Room name is required and cannot be empty');
    } else if (layoutData.name.trim().length > 100) {
      errors.push('Room name cannot exceed 100 characters');
    }
  }

  // 2. Room Dimensions
  const roomWidth = layoutData.width ?? layoutData.dimensions?.width;
  const roomHeight = layoutData.height ?? layoutData.dimensions?.height;

  const dimErrors = validateRoomDimensions(roomWidth, roomHeight);
  errors.push(...dimErrors);

  // 3. Audio radius (if provided)
  if (layoutData.audioRadius !== undefined && layoutData.audioRadius !== null) {
    if (
      typeof layoutData.audioRadius !== 'number' ||
      !Number.isFinite(layoutData.audioRadius) ||
      layoutData.audioRadius <= 0
    ) {
      errors.push(`Audio radius must be a positive number (received: ${layoutData.audioRadius})`);
    } else if (layoutData.audioRadius < 10 || layoutData.audioRadius > 1000) {
      errors.push(`Audio radius must be between 10 and 1000 (received: ${layoutData.audioRadius})`);
    }
  }

  // 4. Capacity (if provided)
  if (layoutData.capacity !== undefined && layoutData.capacity !== null) {
    if (
      typeof layoutData.capacity !== 'number' ||
      !Number.isFinite(layoutData.capacity) ||
      layoutData.capacity < 1
    ) {
      errors.push(`Room capacity must be a positive number (received: ${layoutData.capacity})`);
    } else if (layoutData.capacity < 2) {
      errors.push(`Room capacity must be at least 2 (received: ${layoutData.capacity})`);
    }
  }

  // 5. Obstacles validation
  let obstaclesList = [];
  if (layoutData.obstacles !== undefined && layoutData.obstacles !== null) {
    if (!Array.isArray(layoutData.obstacles)) {
      errors.push('Obstacles must be an array of obstacle objects');
    } else {
      obstaclesList = layoutData.obstacles;
      for (let i = 0; i < layoutData.obstacles.length; i++) {
        const obsErrors = validateObstacle(
          layoutData.obstacles[i],
          roomWidth,
          roomHeight,
          i
        );
        errors.push(...obsErrors);
      }
    }
  }

  // 6. Spawn Point validation
  const effectiveSpawnPoint = layoutData.spawnPoint ?? {
    x: DEFAULT_SPAWN_X,
    y: DEFAULT_SPAWN_Y,
  };

  if (layoutData.spawnPoint !== undefined) {
    const spawnErrors = validateSpawnPoint(
      layoutData.spawnPoint,
      roomWidth,
      roomHeight,
      obstaclesList
    );
    errors.push(...spawnErrors);
  } else if (obstaclesList.length > 0) {
    // If spawnPoint was not explicitly set, ensure the default spawn point is not inside any obstacle
    const defaultSpawnErrors = validateSpawnPoint(
      effectiveSpawnPoint,
      roomWidth,
      roomHeight,
      obstaclesList
    );
    errors.push(...defaultSpawnErrors);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Express middleware to validate incoming room creation or layout update requests.
 */
export function validateRoomLayoutMiddleware(req, res, next) {
  const isPost = req.method === 'POST';
  const validation = validateRoomLayout(req.body, { requireName: isPost });

  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Room layout validation failed',
      errors: validation.errors,
    });
  }

  next();
}
