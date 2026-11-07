import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Room from '../src/models/Room.js';
import { getRoomById } from '../src/controllers/roomController.js';

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

async function runRoomLayoutApiTests() {
  console.log('\n======================================================');
  console.log(' ProxiSpeak Week 4: Room Layout Retrieval API Tests');
  console.log(' GET /api/rooms/:id');
  console.log('======================================================\n');

  const TEST_PORT = 5058;
  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let server = null;

  try {
    // -------------------------------------------------------------------------
    // Start Express Test Server
    // -------------------------------------------------------------------------
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));
    assert(true, `Test server started on port ${TEST_PORT}`);

    // -------------------------------------------------------------------------
    // Test Suite 1: Malformed MongoDB ID Validation (HTTP 400)
    // -------------------------------------------------------------------------
    console.log('\n[Suite 1: Invalid MongoDB ID Validation]');

    // 1a. Non-hex string
    const res1a = await fetch(`${BASE_URL}/api/rooms/invalid-id-xyz`);
    const data1a = await res1a.json();
    console.log('[DEBUG] Malformed ID response:', data1a);
    assert(res1a.status === 400, '1a. Malformed ID "invalid-id-xyz" returns HTTP 400');
    assert(data1a.success === false, '1a. Response success is false');
    assert(data1a.message === 'Invalid room ID format', '1a. Message indicates invalid room ID format');

    // 1b. Short numeric string
    const res1b = await fetch(`${BASE_URL}/api/rooms/12345`);
    const data1b = await res1b.json();
    console.log('[DEBUG] Short numeric ID response:', data1b);
    assert(res1b.status === 400, '1b. Short numeric ID "12345" returns HTTP 400');
    assert(data1b.message === 'Invalid room ID format', '1b. Correct error message returned');

    // 1c. Invalid characters of length 24
    const res1c = await fetch(`${BASE_URL}/api/rooms/zzzzzzzzzzzzzzzzzzzzzzzz`);
    const data1c = await res1c.json();
    assert(res1c.status === 400, '1c. 24-char non-hex ID returns HTTP 400');

    // -------------------------------------------------------------------------
    // Test Suite 2: Controller Unit Verification (Isolated mock testing)
    // -------------------------------------------------------------------------
    console.log('\n[Suite 2: Controller Layout Serialization & Error Invariants]');

    // 2a. Mock room retrieval with full office layout
    const mockFullRoom = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Executive Design Studio',
      description: 'Virtual studio space for design team',
      width: 1920,
      height: 1080,
      dimensions: { width: 1920, height: 1080 },
      audioRadius: 120,
      capacity: 35,
      spawnPoint: { x: 150, y: 150 },
      obstacles: [
        {
          _id: new mongoose.Types.ObjectId(),
          x: 300,
          y: 200,
          width: 250,
          height: 100,
          label: 'Design Team Desk Pod',
          blocksSound: false,
          blocksMovement: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          x: 800,
          y: 400,
          width: 40,
          height: 500,
          label: 'Soundproof Glass Partition',
          blocksSound: true,
          soundAttenuation: 0.95,
          blocksMovement: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          x: 1200,
          y: 700,
          width: 180,
          height: 90,
          label: 'Whiteboard & Coffee Lounge',
          blocksSound: false,
          blocksMovement: true,
        },
      ],
      isPrivate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Test controller output serialization
    const originalFindById = Room.findById;
    const originalCountDocuments = mongoose.model('User').countDocuments;
    try {
      mongoose.model('User').countDocuments = async () => 0;
      // Mock findById returning mock room
      Room.findById = () => ({
        select: () => ({
          lean: async () => mockFullRoom,
        }),
      });

      let responseStatus = null;
      let responseBody = null;

      const mockReq = { params: { id: mockFullRoom._id.toString() } };
      const mockRes = {
        status: (s) => {
          responseStatus = s;
          return mockRes;
        },
        json: (b) => {
          responseBody = b;
          return mockRes;
        },
      };

      await getRoomById(mockReq, mockRes);

      assert(responseStatus === 200, '2a. Controller returns HTTP 200 for existing room');
      assert(responseBody.success === true, '2a. Controller response success is true');

      // Also test via live HTTP endpoint
      const httpRes = await fetch(`${BASE_URL}/api/rooms/${mockFullRoom._id}`);
      const httpData = await httpRes.json();
      assert(httpRes.status === 200, '2b. HTTP GET /api/rooms/:id responds with HTTP 200');
      assert(httpData.success === true, '2b. HTTP response success is true');

      const roomData = httpData.data;
      assert(roomData.name === 'Executive Design Studio', '2c. Name is accurately returned');
      assert(roomData.description === 'Virtual studio space for design team', '2c. Description is returned');
      assert(roomData.width === 1920 && roomData.height === 1080, '2c. Width and height are returned');
      assert(roomData.audioRadius === 120, '2c. Audio radius is returned');
      assert(roomData.capacity === 35, '2c. Capacity is returned');
      assert(roomData.spawnPoint.x === 150 && roomData.spawnPoint.y === 150, '2c. Complete spawnPoint is returned');

      // Verify obstacles layout returned
      assert(Array.isArray(roomData.obstacles) && roomData.obstacles.length === 3, '2d. All 3 obstacles are returned');
      assert(roomData.obstacles[0].label === 'Design Team Desk Pod', '2d. Obstacle 1 label returned');
      assert(roomData.obstacles[1].label === 'Soundproof Glass Partition', '2d. Obstacle 2 label returned');
      assert(roomData.obstacles[1].blocksSound === true, '2d. Acoustic property blocksSound returned');
      assert(roomData.obstacles[1].soundAttenuation === 0.95, '2d. Acoustic attenuation returned');
      assert(roomData.obstacles[2].label === 'Whiteboard & Coffee Lounge', '2d. Obstacle 3 label returned');

      // Internal information disclosure verification
      assert(roomData.__v === undefined, '2e. Internal Mongoose __v field is not exposed');
      assert(roomData.passcode === undefined, '2e. Passcode is not exposed in public layout response');

      // 2f. Non-existing room test (404) via HTTP
      Room.findById = () => ({
        select: () => ({
          lean: async () => null,
        }),
      });

      const notFoundId = new mongoose.Types.ObjectId().toString();
      const http404Res = await fetch(`${BASE_URL}/api/rooms/${notFoundId}`);
      const http404Data = await http404Res.json();

      assert(http404Res.status === 404, '2f. HTTP GET /api/rooms/:id returns HTTP 404 when room does not exist');
      assert(http404Data.success === false, '2f. 404 response success is false');
      assert(http404Data.message === 'Room not found', '2f. 404 response message is "Room not found"');

      // 2g. Database error handling test (500) via HTTP
      Room.findById = () => ({
        select: () => ({
          lean: async () => {
            throw new Error('Simulated database connection crash');
          },
        }),
      });

      const http500Res = await fetch(`${BASE_URL}/api/rooms/${notFoundId}`);
      const http500Data = await http500Res.json();

      assert(http500Res.status === 500, '2g. HTTP GET /api/rooms/:id returns HTTP 500 on database error');
      assert(http500Data.success === false, '2g. 500 response success is false');
      assert(http500Data.message === 'Failed to retrieve room', '2g. Error message matches existing convention');
      assert(http500Data.error === 'Simulated database connection crash', '2g. Error detail passed through');

    } finally {
      Room.findById = originalFindById;
      if (originalCountDocuments) {
        mongoose.model('User').countDocuments = originalCountDocuments;
      }
    }

    // -------------------------------------------------------------------------
    // Test Suite 3: Live MongoDB Integration (if MongoDB is running)
    // -------------------------------------------------------------------------
    console.log('\n[Suite 3: Live MongoDB Layout Retrieval Integration]');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/proxispeak';
    let isMongoConnected = false;

    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
      isMongoConnected = true;
      console.log('[Test] Connected to MongoDB for live HTTP integration testing.');
    } catch (err) {
      console.log('[Notice] MongoDB server offline. Live HTTP DB tests skipped:', err.message);
    }

    if (isMongoConnected) {
      // Create a test room with layout and obstacles in database
      const liveRoom = await Room.create({
        name: 'Live Layout Test Room',
        description: 'Room with multiple obstacles for layout API testing',
        width: 1920,
        height: 1080,
        audioRadius: 150,
        capacity: 45,
        spawnPoint: { x: 200, y: 200 },
        obstacles: [
          {
            x: 400,
            y: 300,
            width: 180,
            height: 90,
            label: 'Desk Cluster Alpha',
            blocksSound: false,
            blocksMovement: true,
          },
          {
            x: 800,
            y: 200,
            width: 30,
            height: 450,
            label: 'East Wall Barrier',
            blocksSound: true,
            soundAttenuation: 1.0,
            blocksMovement: true,
          },
        ],
      });

      // 3a. Retrieve existing room with layout via HTTP
      const liveRes = await fetch(`${BASE_URL}/api/rooms/${liveRoom._id}`);
      const liveData = await liveRes.json();

      assert(liveRes.status === 200, '3a. HTTP GET /api/rooms/:id returns HTTP 200');
      assert(liveData.success === true, '3a. Response success is true');
      assert(liveData.data.name === 'Live Layout Test Room', '3a. Room name matches database document');
      assert(liveData.data.width === 1920 && liveData.data.height === 1080, '3a. Canvas width & height match');
      assert(liveData.data.spawnPoint.x === 200 && liveData.data.spawnPoint.y === 200, '3a. Spawn point matches');
      assert(liveData.data.obstacles.length === 2, '3a. All obstacles retrieved from MongoDB');
      assert(liveData.data.obstacles[1].label === 'East Wall Barrier', '3a. Obstacle labels and acoustic data intact');
       
            // 3b. Update room layout via HTTP
      const updatedLayout = {
        width: 1600,
        height: 900,
        audioRadius: 120,
        capacity: 60,
        spawnPoint: { x: 250, y: 250 },
        obstacles: [
          {
            x: 500,
            y: 300,
            width: 200,
            height: 100,
            label: 'Updated Meeting Room',
            blocksSound: true,
            soundAttenuation: 0.5,
            blocksMovement: true,
          },
        ],
      };

      const updateRes = await fetch(
        `${BASE_URL}/api/rooms/${liveRoom._id}/layout`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedLayout),
        }
      );

      const updateData = await updateRes.json();
      console.log('[DEBUG] PUT status:', updateRes.status);
      console.log('[DEBUG] PUT response:', updateData);

      assert(updateRes.status === 200, '3b. PUT layout returns HTTP 200');
      assert(updateData.success === true, '3b. Layout update succeeds');

      const verifyRes = await fetch(`${BASE_URL}/api/rooms/${liveRoom._id}`);
      const verifyData = await verifyRes.json();

      assert(verifyData.data.width === 1600, '3b. Updated room width is persisted');
      assert(verifyData.data.height === 900, '3b. Updated room height is persisted');
      assert(verifyData.data.audioRadius === 120, '3b. Updated audio radius is persisted');
      assert(verifyData.data.spawnPoint.x === 250, '3b. Updated spawn point is persisted');
      assert(
        verifyData.data.obstacles[0].label === 'Updated Meeting Room',
        '3b. Updated obstacles are persisted'
      );

      // 3b. Non-existing room with valid ObjectId format
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const notFoundRes = await fetch(`${BASE_URL}/api/rooms/${nonExistentId}`);
      const notFoundData = await notFoundRes.json();

      assert(notFoundRes.status === 404, '3b. HTTP GET /api/rooms/:id returns 404 for non-existent room');
      assert(notFoundData.success === false, '3b. 404 response success is false');
      assert(notFoundData.message === 'Room not found', '3b. 404 response message is "Room not found"');

      // Clean up test room
      await Room.deleteOne({ _id: liveRoom._id });
      await mongoose.disconnect();
    }

  } catch (err) {
    console.error('[Test Error]:', err);
    failCount++;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passCount} Passed, ${failCount} Failed.`);
  console.log('------------------------------------------------------\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('All Room Layout Retrieval API tests passed successfully!\n');
    process.exit(0);
  }
}

runRoomLayoutApiTests();
