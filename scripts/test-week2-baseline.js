import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';
import { calculateEuclideanDistance } from '../src/controllers/userController.js';

/**
 * Week 2 Baseline Tests for ProxiSpeak
 *
 * Safe test suite verifying:
 *  - calculateEuclideanDistance unit tests
 *  - Parameter validation edge cases (missing, non-finite, negative, invalid ObjectId)
 *  - 2D geospatial index inspection on User collection
 *  - Nearby query with varying / configurable audioRadius
 *  - Boundary-distance behavior & precision
 *  - Room isolation and room-scoped audioRadius verification via Room model
 *  - Self-exclusion and payload data sanitization
 */

const TEST_PORT = 5057;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

function skip(message) {
  console.log(`  ⏭️  SKIP: ${message}`);
  skipCount++;
}

/**
 * Validates that the provided URI points to an explicit, dedicated test database.
 * Prevents accidental connection to or modification of development/production databases.
 */
function validateTestDatabaseUri(uri) {
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    return {
      isValid: false,
      reason: 'Dedicated test database URI (MONGODB_TEST_URI or TEST_MONGODB_URI) is not configured.',
    };
  }

  try {
    const normalized = uri.trim().replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const parsed = new URL(normalized);
    const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];

    if (!dbName) {
      return {
        isValid: false,
        reason: 'Database name is missing in test database URI.',
      };
    }

    const lowerDb = dbName.toLowerCase();
    // Safety verification: must contain 'test' and cannot be the default application database
    if (!lowerDb.includes('test') || lowerDb === 'proxispeak') {
      return {
        isValid: false,
        reason: `Database "${dbName}" is not clearly a dedicated test database (name must contain "test" and cannot be "proxispeak").`,
      };
    }

    return { isValid: true, dbName, uri: uri.trim() };
  } catch (err) {
    return {
      isValid: false,
      reason: `Invalid MongoDB URI format: ${err.message}`,
    };
  }
}

async function runWeek2BaselineTests() {
  console.log('\n--- Week 2 Baseline Test Suite: Proximity Queries & Signaling Edge Cases ---\n');

  let server = null;
  let isMongoConnected = false;
  const createdUserIds = [];
  const createdRoomIds = [];
  const runId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    // ─── Section 1: Pure Unit Tests (no DB required) ───

    console.log('Section 1: calculateEuclideanDistance Unit Tests');

    assert(
      calculateEuclideanDistance(0, 0, 3, 4) === 5,
      '1a. Euclidean distance from (0,0) to (3,4) equals 5 (classic 3-4-5 triangle)'
    );

    assert(
      calculateEuclideanDistance(100, 100, 100, 100) === 0,
      '1b. Euclidean distance from identical points equals 0'
    );

    assert(
      calculateEuclideanDistance(0, 0, 100, 0) === 100,
      '1c. Horizontal-only distance (0,0) to (100,0) equals 100'
    );

    assert(
      calculateEuclideanDistance(0, 0, 0, 200) === 200,
      '1d. Vertical-only distance (0,0) to (0,200) equals 200'
    );

    // Floating-point precision
    const diagDist = calculateEuclideanDistance(0, 0, 1, 1);
    assert(
      Math.abs(diagDist - Math.SQRT2) < 1e-10,
      '1e. Diagonal distance (0,0) to (1,1) equals √2 within floating-point tolerance'
    );

    // Large pixel coordinates (virtual office scale)
    assert(
      calculateEuclideanDistance(0, 0, 1920, 1080) === Math.sqrt(1920 ** 2 + 1080 ** 2),
      '1f. Large canvas distance (0,0) to (1920,1080) is correct'
    );

    // ─── Section 2: Nearby Query Validation Edge Cases (HTTP only, no DB needed) ───

    console.log('\nSection 2: Nearby Query Validation (Parameter Validation)');

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));
    assert(true, `2a. Test server started on port ${TEST_PORT}`);

    // Missing x parameter
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?y=100`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false && data.message.includes('x and y'),
        '2b. GET /api/users/nearby without x returns 400 with descriptive message'
      );
    }

    // Missing y parameter
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false,
        '2c. GET /api/users/nearby without y returns 400'
      );
    }

    // NaN coordinates
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=abc&y=def`);
      const data = await res.json();
      assert(
        res.status === 400 && data.message.includes('valid finite numbers'),
        '2d. GET /api/users/nearby with NaN coordinates returns 400'
      );
    }

    // Negative maxDistance
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100&y=100&maxDistance=-50`);
      const data = await res.json();
      assert(
        res.status === 400 && data.message.includes('positive'),
        '2e. GET /api/users/nearby with negative maxDistance returns 400'
      );
    }

    // Zero maxDistance
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100&y=100&maxDistance=0`);
      const data = await res.json();
      assert(
        res.status === 400,
        '2f. GET /api/users/nearby with zero maxDistance returns 400'
      );
    }

    // Negative x coordinate
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=-10&y=100`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false && data.message.includes('negative'),
        '2g. GET /api/users/nearby with negative x coordinate returns 400'
      );
    }

    // Negative y coordinate
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100&y=-10`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false && data.message.includes('negative'),
        '2h. GET /api/users/nearby with negative y coordinate returns 400'
      );
    }

    // Invalid roomId format
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100&y=100&roomId=invalid_room_id`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false && data.message.includes('roomId format'),
        '2i. GET /api/users/nearby with invalid roomId format returns 400'
      );
    }

    // Invalid excludeId format
    {
      const res = await fetch(`${BASE_URL}/api/users/nearby?x=100&y=100&excludeId=invalid_exclude_id`);
      const data = await res.json();
      assert(
        res.status === 400 && data.success === false && data.message.includes('excludeId format'),
        '2j. GET /api/users/nearby with invalid excludeId format returns 400'
      );
    }

    // ─── Section 3: DB-Backed Proximity Tests ───

    console.log('\nSection 3: Database-Backed Proximity & AudioRadius Tests');

    const rawTestUri = process.env.MONGODB_TEST_URI || process.env.TEST_MONGODB_URI;
    const dbValidation = validateTestDatabaseUri(rawTestUri);

    if (!dbValidation.isValid) {
      console.error(`  ⚠️ Test database safety check failed: ${dbValidation.reason}`);
      assert(
        false,
        `3-db-safety. Dedicated test database safety check: ${dbValidation.reason}`
      );
      skip('3a-3s. Database-backed proximity tests skipped due to missing/unsafe test database URI');
    } else {
      try {
        console.log(`  [Test] Connecting to dedicated test database: "${dbValidation.dbName}"`);
        await mongoose.connect(dbValidation.uri, { serverSelectionTimeoutMS: 3000 });
        isMongoConnected = true;
        console.log('  [Test] Connected successfully to test database.');

        // Inspect existing indexes - DO NOT drop or rebuild indexes
        const indexes = await User.collection.indexes();
        const has2dIndex = indexes.some(
          (idx) => idx.key && idx.key['location.coordinates'] === '2d'
        );
        assert(
          has2dIndex,
          '3-index. User collection has required 2D geospatial index on location.coordinates'
        );

        if (!has2dIndex) {
          console.error('  ❌ Required 2D geospatial index on location.coordinates is missing or incorrect');
        }
      } catch (err) {
        console.error('  [Test] Failed to connect to test database:', err.message);
        assert(false, `3-db-connect. Failed to connect to test database: ${err.message}`);
      }
    }

    if (isMongoConnected) {
      // ─── 3a: Create rooms with DIFFERENT audioRadius values ───
      const roomSmall = await Room.create({
        name: `W2TestRoom_Small_${runId}`,
        audioRadius: 50,
      });
      createdRoomIds.push(roomSmall._id);

      const roomLarge = await Room.create({
        name: `W2TestRoom_Large_${runId}`,
        audioRadius: 300,
      });
      createdRoomIds.push(roomLarge._id);

      assert(
        roomSmall.audioRadius === 50 && roomLarge.audioRadius === 300,
        '3a. Rooms created with configurable audioRadius values (50px and 300px)'
      );

      // ─── 3b: Create test avatars ───
      //
      // Layout in "Small" room (audioRadius=50):
      //   W2TestOrigin at [200, 200]
      //   W2TestNearby at [230, 240]  → distance = √(30²+40²) = 50  (boundary)
      //   W2TestFar    at [260, 280]  → distance = √(60²+80²) = 100 (outside 50)
      //
      const origin = await User.create({
        username: `W2TestOrigin_${runId}`,
        isOnline: true,
        roomId: roomSmall._id,
        location: { type: 'Point', coordinates: [200, 200] },
      });
      createdUserIds.push(origin._id);

      const nearby = await User.create({
        username: `W2TestNearby_${runId}`,
        isOnline: true,
        roomId: roomSmall._id,
        location: { type: 'Point', coordinates: [230, 240] },
      });
      createdUserIds.push(nearby._id);

      const far = await User.create({
        username: `W2TestFar_${runId}`,
        isOnline: true,
        roomId: roomSmall._id,
        location: { type: 'Point', coordinates: [260, 280] },
      });
      createdUserIds.push(far._id);

      // Also an avatar in the "Large" room at [200, 200]
      const otherRoom = await User.create({
        username: `W2TestOtherRoom_${runId}`,
        isOnline: true,
        roomId: roomLarge._id,
        location: { type: 'Point', coordinates: [200, 200] },
      });
      createdUserIds.push(otherRoom._id);

      // ─── 3c: Nearby with room's audioRadius (50px) ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&maxDistance=50&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        assert(
          res.status === 200 && data.success === true,
          '3b. Nearby query with audioRadius=50 returns 200 OK'
        );

        const usernames = data.data.map((u) => u.username);
        assert(
          usernames.includes(nearby.username),
          '3c. W2TestNearby at distance=50 is included (on the boundary of audioRadius=50)'
        );
        assert(
          !usernames.includes(far.username),
          '3d. W2TestFar at distance=100 is excluded (outside audioRadius=50)'
        );
        assert(
          !usernames.includes(otherRoom.username),
          '3e. W2TestOtherRoom in different room is excluded by roomId filter'
        );
      }

      // ─── 3f: Nearby with larger radius (300px) ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&maxDistance=300&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        assert(
          data.data.length === 2 &&
            data.data.some((u) => u.username === nearby.username) &&
            data.data.some((u) => u.username === far.username),
          '3f. Nearby with maxDistance=300 captures both W2TestNearby and W2TestFar'
        );
      }

      // ─── 3g: `radius` query param alias ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&radius=50&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        assert(
          res.status === 200 && data.maxDistance === 50,
          '3g. `radius` query param is accepted as an alias for `maxDistance`'
        );
      }

      // ─── 3h: Distance precision ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&maxDistance=300&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        const nearbyEntry = data.data.find((u) => u.username === nearby.username);
        const farEntry = data.data.find((u) => u.username === far.username);

        assert(
          nearbyEntry && nearbyEntry.distance === 50,
          '3h. Reported distance for W2TestNearby is exactly 50.00'
        );
        assert(
          farEntry && farEntry.distance === 100,
          '3i. Reported distance for W2TestFar is exactly 100.00'
        );
      }

      // ─── 3j: inAudioRange flag ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&maxDistance=75&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        const nearbyEntry = data.data.find((u) => u.username === nearby.username);
        assert(
          nearbyEntry && nearbyEntry.inAudioRange === true,
          '3j. inAudioRange flag is true for user within maxDistance'
        );
      }

      // ─── 3k: Default maxDistance falls back to DEFAULT_AUDIO_RADIUS (100) ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        assert(
          res.status === 200 && data.maxDistance === 100,
          '3k. Omitting maxDistance defaults to DEFAULT_AUDIO_RADIUS (100px)'
        );
        assert(
          data.data.length === 2,
          '3l. Default radius=100 captures both W2TestNearby(50px) and W2TestFar(100px)'
        );
      }

      // ─── 3m: Room model audioRadius is queryable ───
      {
        const roomRes = await fetch(`${BASE_URL}/api/rooms/${roomSmall._id}`);
        const roomData = await roomRes.json();
        assert(
          roomData.data.audioRadius === 50,
          '3m. Room audioRadius is retrievable via GET /api/rooms/:id for client-side radius config'
        );
      }

      // ─── 3n: Offline users excluded ───
      await User.findByIdAndUpdate(nearby._id, { isOnline: false });
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&maxDistance=300&roomId=${roomSmall._id}&excludeId=${origin._id}`
        );
        const data = await res.json();
        assert(
          !data.data.some((u) => u.username === nearby.username),
          '3n. Offline users are excluded from nearby results'
        );
      }

      // ─── 3o: Non-existent room ID returns 404 ───
      {
        const nonExistentRoomId = new mongoose.Types.ObjectId().toString();
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=200&y=200&roomId=${nonExistentRoomId}`
        );
        const data = await res.json();
        assert(
          res.status === 404 && data.success === false && data.message.includes('Room not found'),
          '3o. GET /api/users/nearby with non-existent roomId returns 404 Room not found'
        );
      }

      // ─── 3p: Boundary-distance behavior (inside, exactly on, and outside) ───
      // Center: [500, 500], radius = 100
      // Inside: [500, 599] -> distance = 99
      // Exact:  [500, 600] -> distance = 100
      // Outside: [500, 601] -> distance = 101
      const boundaryRoom = await Room.create({
        name: `W2TestRoom_Boundary_${runId}`,
        audioRadius: 100,
      });
      createdRoomIds.push(boundaryRoom._id);

      const userInside = await User.create({
        username: `W2TestBoundary_Inside_${runId}`,
        isOnline: true,
        roomId: boundaryRoom._id,
        location: { type: 'Point', coordinates: [500, 599] },
      });
      createdUserIds.push(userInside._id);

      const userOnBoundary = await User.create({
        username: `W2TestBoundary_Exact_${runId}`,
        isOnline: true,
        roomId: boundaryRoom._id,
        location: { type: 'Point', coordinates: [500, 600] },
      });
      createdUserIds.push(userOnBoundary._id);

      const userOutside = await User.create({
        username: `W2TestBoundary_Outside_${runId}`,
        isOnline: true,
        roomId: boundaryRoom._id,
        location: { type: 'Point', coordinates: [500, 601] },
      });
      createdUserIds.push(userOutside._id);

      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=500&y=500&maxDistance=100&roomId=${boundaryRoom._id}`
        );
        const data = await res.json();
        const returnedNames = data.data.map((u) => u.username);
        assert(
          returnedNames.includes(userInside.username),
          '3p-1. User just inside boundary (distance 99px <= 100px) is included'
        );
        assert(
          returnedNames.includes(userOnBoundary.username),
          '3p-2. User exactly on boundary (distance 100px <= 100px) is included'
        );
        assert(
          !returnedNames.includes(userOutside.username),
          '3p-3. User just outside boundary (distance 101px > 100px) is excluded'
        );
      }

      // ─── 3q: Self-exclusion via excludeId ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=500&y=599&maxDistance=100&roomId=${boundaryRoom._id}&excludeId=${userInside._id}`
        );
        const data = await res.json();
        const returnedIds = data.data.map((u) => u.avatarId);
        assert(
          !returnedIds.includes(userInside._id.toString()),
          '3q. Self user is excluded from nearby query when excludeId is provided'
        );
      }

      // ─── 3r: Data sanitization and sensitive field protection ───
      {
        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=500&y=500&maxDistance=100&roomId=${boundaryRoom._id}`
        );
        const data = await res.json();
        const userSample = data.data[0];
        const hasNoSensitiveFields =
          userSample &&
          userSample.email === undefined &&
          userSample.socketId === undefined &&
          userSample.passcode === undefined &&
          userSample.__v === undefined;
        const hasRequiredFields =
          userSample &&
          userSample.avatarId !== undefined &&
          userSample.username !== undefined &&
          userSample.x !== undefined &&
          userSample.y !== undefined &&
          userSample.distance !== undefined &&
          userSample.inAudioRange !== undefined;
        assert(
          hasNoSensitiveFields && hasRequiredFields,
          '3r. Nearby response sanitizes data: no sensitive fields (email, socketId, passcode), only necessary spatial avatar fields'
        );
      }

      // ─── 3s: Distance ordering (nearest to farthest) ───
      {
        const userClosest = await User.create({
          username: `W2TestBoundary_Closest_${runId}`,
          isOnline: true,
          roomId: boundaryRoom._id,
          location: { type: 'Point', coordinates: [500, 510] },
        });
        createdUserIds.push(userClosest._id);

        const res = await fetch(
          `${BASE_URL}/api/users/nearby?x=500&y=500&maxDistance=100&roomId=${boundaryRoom._id}`
        );
        const data = await res.json();
        const distances = data.data.map((u) => u.distance);
        const isSorted = distances.every((val, idx, arr) => idx === 0 || arr[idx - 1] <= val);
        assert(
          isSorted && data.data[0].username === userClosest.username,
          '3s. Nearby query results are ordered from nearest to farthest'
        );
      }
    }

    // ─── Section 4: 404 for invalid room/user IDs ───

    console.log('\nSection 4: Edge Case Route Responses');

    {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`${BASE_URL}/api/rooms/${fakeId}`);
      if (isMongoConnected) {
        assert(res.status === 404, '4a. GET /api/rooms/:id with non-existent ID returns 404');
      } else {
        skip('4a. GET /api/rooms/:id 404 test (requires MongoDB)');
      }
    }

    {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`${BASE_URL}/api/users/${fakeId}`);
      if (isMongoConnected) {
        assert(res.status === 404, '4b. GET /api/users/:id with non-existent ID returns 404');
      } else {
        skip('4b. GET /api/users/:id 404 test (requires MongoDB)');
      }
    }
  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    assert(false, `Unexpected test runner error: ${err.message}`);
  } finally {
    // ─── Guaranteed Teardown & Resource Cleanup ───
    if (isMongoConnected) {
      try {
        if (createdUserIds.length > 0) {
          await User.deleteMany({ _id: { $in: createdUserIds } });
        }
        if (createdRoomIds.length > 0) {
          await Room.deleteMany({ _id: { $in: createdRoomIds } });
        }
      } catch (cleanupErr) {
        console.error('Error during test database cleanup:', cleanupErr.message);
      }

      try {
        await mongoose.disconnect();
      } catch (discErr) {
        console.error('Error disconnecting Mongoose:', discErr.message);
      }
    }

    if (server) {
      try {
        await new Promise((resolve) => server.close(resolve));
      } catch (servErr) {
        console.error('Error closing test HTTP server:', servErr.message);
      }
    }
  }

  console.log(`\n--- Week 2 Baseline Summary ---`);
  console.log(`Passed: ${passCount} | Failed: ${failCount} | Skipped: ${skipCount}`);

  if (failCount === 0) {
    console.log('🎉 ALL WEEK 2 BASELINE TESTS PASSED!\n');
    process.exitCode = 0;
  } else {
    console.error('⚠️  SOME WEEK 2 BASELINE TESTS FAILED!\n');
    process.exitCode = 1;
  }
}

runWeek2BaselineTests().catch((err) => {
  console.error('Fatal unhandled test runner error:', err);
  process.exitCode = 1;
});
