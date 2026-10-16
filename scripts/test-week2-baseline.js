import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';
import { calculateEuclideanDistance } from '../src/controllers/userController.js';

/**
 * Week 2 Baseline Tests for ProxiSpeak
 *
 * Supplements existing test-sockets.js and test-routes.js with:
 *  - calculateEuclideanDistance unit tests
 *  - Nearby query with varying / configurable audioRadius
 *  - `radius` query param alias
 *  - Validation edge cases (negative maxDistance, NaN, missing params)
 *  - Boundary-distance precision
 *  - Room-scoped audioRadius verification via Room model
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

async function runWeek2BaselineTests() {
  console.log('\n--- Week 2 Baseline Test Suite: Proximity Queries & Signaling Edge Cases ---\n');

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

  const server = http.createServer(app);
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

  // ─── Section 3: DB-Backed Proximity Tests ───

  console.log('\nSection 3: Database-Backed Proximity & AudioRadius Tests');

  let isMongoConnected = false;
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/proxispeak',
      { serverSelectionTimeoutMS: 2000 }
    );
    isMongoConnected = true;
    console.log('  [Test] Connected to MongoDB');

    // Ensure indexes are synced
    try {
      const indexes = await User.collection.indexes();
      const oldGeo = indexes.filter(
        (idx) => idx.key && (idx.key.location === '2dsphere' || idx.key['location.coordinates'] === '2d')
      );
      for (const idx of oldGeo) {
        await User.collection.dropIndex(idx.name);
      }
      await User.syncIndexes();
    } catch (_) {
      // collection may not exist yet
    }
  } catch (err) {
    console.warn('  [Test] MongoDB unavailable:', err.message);
  }

  if (isMongoConnected) {
    // Cleanup
    await User.deleteMany({ username: /^W2Test/ });
    await Room.deleteMany({ name: /^W2TestRoom/ });

    // ─── 3a: Create rooms with DIFFERENT audioRadius values ───
    const roomSmall = await Room.create({ name: 'W2TestRoom_Small', audioRadius: 50 });
    const roomLarge = await Room.create({ name: 'W2TestRoom_Large', audioRadius: 300 });

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
      username: 'W2TestOrigin',
      isOnline: true,
      roomId: roomSmall._id,
      location: { type: 'Point', coordinates: [200, 200] },
    });

    const nearby = await User.create({
      username: 'W2TestNearby',
      isOnline: true,
      roomId: roomSmall._id,
      location: { type: 'Point', coordinates: [230, 240] },
    });

    const far = await User.create({
      username: 'W2TestFar',
      isOnline: true,
      roomId: roomSmall._id,
      location: { type: 'Point', coordinates: [260, 280] },
    });

    // Also an avatar in the "Large" room at [200, 200]
    const otherRoom = await User.create({
      username: 'W2TestOtherRoom',
      isOnline: true,
      roomId: roomLarge._id,
      location: { type: 'Point', coordinates: [200, 200] },
    });

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
        usernames.includes('W2TestNearby'),
        '3c. W2TestNearby at distance=50 is included (on the boundary of audioRadius=50)'
      );
      assert(
        !usernames.includes('W2TestFar'),
        '3d. W2TestFar at distance=100 is excluded (outside audioRadius=50)'
      );
      assert(
        !usernames.includes('W2TestOtherRoom'),
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
          data.data.some((u) => u.username === 'W2TestNearby') &&
          data.data.some((u) => u.username === 'W2TestFar'),
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
      const nearbyEntry = data.data.find((u) => u.username === 'W2TestNearby');
      const farEntry = data.data.find((u) => u.username === 'W2TestFar');

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
      const nearbyEntry = data.data.find((u) => u.username === 'W2TestNearby');
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
        !data.data.some((u) => u.username === 'W2TestNearby'),
        '3n. Offline users are excluded from nearby results'
      );
    }

    // Cleanup
    await User.deleteMany({ username: /^W2Test/ });
    await Room.deleteMany({ name: /^W2TestRoom/ });
  } else {
    skip('3a-3n. Database-backed proximity tests (requires MongoDB)');
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

  // ─── Teardown ───

  server.close();
  if (isMongoConnected) {
    await mongoose.disconnect();
  }

  console.log(`\n--- Week 2 Baseline Summary ---`);
  console.log(`Passed: ${passCount} | Failed: ${failCount} | Skipped: ${skipCount}`);

  if (failCount === 0) {
    console.log('🎉 ALL WEEK 2 BASELINE TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('⚠️  SOME WEEK 2 BASELINE TESTS FAILED!\n');
    process.exit(1);
  }
}

runWeek2BaselineTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
