import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';


const TEST_PORT = 5056;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function runRoutesTest() {
  console.log('\n--- Day 3: ProxiSpeak REST Routes & Spatial Proximity Verification ---');

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/proxispeak';
  let isMongoConnected = false;
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    isMongoConnected = true;
    console.log('[Test] Connected to MongoDB');

    // Ensure index with updated planar bounds is synced
    try {
      const indexes = await User.collection.indexes();
      const oldGeo = indexes.filter(
        (idx) => idx.key && (idx.key.location === '2dsphere' || idx.key['location.coordinates'] === '2d')
      );
      for (const idx of oldGeo) {
        await User.collection.dropIndex(idx.name);
        console.log(`[Test] Dropped old geo index: ${idx.name}`);
      }
      await User.syncIndexes();
    } catch (e) {
      // index sync error if collection does not exist yet
    }
  } catch (err) {
    console.warn('[Test] Local MongoDB not running, tests will run with HTTP validation mode:', err.message);
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  assert(true, `1. Express Server with REST routes started on port ${TEST_PORT}`);

  try {
    // 2. Health check
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', '2. GET /health responds with 200 and status: ok');

    // 3. POST /api/rooms - Validation error (missing name)
    const invalidRoomRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const invalidRoomData = await invalidRoomRes.json();
    assert(
      invalidRoomRes.status === 400 && invalidRoomData.success === false,
      '3. POST /api/rooms validates required name and returns 400'
    );

    let testRoomId = null;

    if (isMongoConnected) {
      // Clean up past test rooms
      await Room.deleteMany({ name: /^Test Office/ });
      await User.deleteMany({ username: /^TestAvatar/ });

      // 4. POST /api/rooms - Create Room
      const createRoomRes = await fetch(`${BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Office Alpha',
          description: 'A virtual room for team testing',
          audioRadius: 100,
          dimensions: { width: 1920, height: 1080 },
        }),
      });
      const createRoomData = await createRoomRes.json();
      assert(
        createRoomRes.status === 201 &&
          createRoomData.success === true &&
          createRoomData.data?.name === 'Test Office Alpha',
        '4. POST /api/rooms successfully creates room with 2D dimensions'
      );
      testRoomId = createRoomData.data?._id;

      // 5. GET /api/rooms - List Rooms
      const listRoomsRes = await fetch(`${BASE_URL}/api/rooms`);
      const listRoomsData = await listRoomsRes.json();
      assert(
        listRoomsRes.status === 200 &&
          listRoomsData.success === true &&
          Array.isArray(listRoomsData.data) &&
          listRoomsData.count >= 1,
        '5. GET /api/rooms lists rooms with active member counts'
      );

      // 6. GET /api/rooms/:id - Get Single Room
      const getSingleRoomRes = await fetch(`${BASE_URL}/api/rooms/${testRoomId}`);
      const getSingleRoomData = await getSingleRoomRes.json();
      assert(
        getSingleRoomRes.status === 200 &&
          getSingleRoomData.data?._id === testRoomId &&
          getSingleRoomData.data?.audioRadius === 100,
        '6. GET /api/rooms/:id returns room details'
      );

      // Create test avatars in database
      // Alice at [100, 100] (Room Alpha)
      const alice = await User.create({
        username: 'TestAvatarAlice',
        isOnline: true,
        roomId: testRoomId,
        location: { type: 'Point', coordinates: [100, 100] },
      });

      // Bob at [150, 100] (Distance: 50 px, within 100 px audio radius)
      const bob = await User.create({
        username: 'TestAvatarBob',
        isOnline: true,
        roomId: testRoomId,
        location: { type: 'Point', coordinates: [150, 100] },
      });

      // Charlie at [400, 400] (Distance: > 400 px, OUTSIDE audio radius)
      const charlie = await User.create({
        username: 'TestAvatarCharlie',
        isOnline: true,
        roomId: testRoomId,
        location: { type: 'Point', coordinates: [400, 400] },
      });

      // 7. GET /api/rooms/:id/members - Get active avatars in room
      const membersRes = await fetch(`${BASE_URL}/api/rooms/${testRoomId}/members`);
      const membersData = await membersRes.json();
      assert(
        membersRes.status === 200 &&
          membersData.count === 3 &&
          membersData.data.some((m) => m.username === 'TestAvatarAlice'),
        '7. GET /api/rooms/:id/members retrieves all online members in room'
      );

      // 8. GET /api/users - List users
      const usersRes = await fetch(`${BASE_URL}/api/users?roomId=${testRoomId}`);
      const usersData = await usersRes.json();
      assert(
        usersRes.status === 200 && usersData.count === 3,
        '8. GET /api/users returns users filtered by query parameter'
      );

      // 9. GET /api/users/:id - Get specific user
      const userRes = await fetch(`${BASE_URL}/api/users/${alice._id}`);
      const userData = await userRes.json();
      assert(
        userRes.status === 200 && userData.data.username === 'TestAvatarAlice',
        '9. GET /api/users/:id returns user avatar coordinates and state'
      );

      // 10. GET /api/users/nearby - Geospatial Proximity from Alice's position [100, 100]
      const nearbyRes = await fetch(
        `${BASE_URL}/api/users/nearby?x=100&y=100&maxDistance=100&roomId=${testRoomId}&excludeId=${alice._id}`
      );
      const nearbyData = await nearbyRes.json();
      assert(
        nearbyRes.status === 200 &&
          nearbyData.success === true &&
          nearbyData.data.length === 1 &&
          nearbyData.data[0].username === 'TestAvatarBob' &&
          nearbyData.data[0].distance === 50,
        '10. GET /api/users/nearby correctly detects Bob within 50px distance and excludes Charlie (>400px)'
      );
    } else {
      console.log('  [Notice] MongoDB is offline. Testing parameter validation for routes:');
      // Parameter validation test for nearby endpoint
      const invalidNearbyRes = await fetch(`${BASE_URL}/api/users/nearby`);
      const invalidNearbyData = await invalidNearbyRes.json();
      assert(
        invalidNearbyRes.status === 400 && invalidNearbyData.success === false,
        '10. GET /api/users/nearby requires finite x and y coordinates'
      );
    }

    // 11. 404 Route handler test
    const notFoundRes = await fetch(`${BASE_URL}/api/nonexistent`);
    assert(notFoundRes.status === 404, '11. 404 handler responds for unregistered endpoints');

  } catch (error) {
    console.error('[Test Error]:', error);
    failCount++;
  } finally {
    if (server) {
      try {
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      } catch (err) {
        console.error('Error closing test server:', err.message);
        failCount++;
      }
    }
    if (isMongoConnected) {
      try {
        await mongoose.disconnect();
      } catch (err) {
        console.error('Error disconnecting mongoose:', err.message);
        failCount++;
      }
    }
  }

  console.log(`\nResults: ${passCount} Passed, ${failCount} Failed.`);
  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('All Day 3 route tests passed successfully!\n');
    process.exit(0);
  }
}

runRoutesTest();
