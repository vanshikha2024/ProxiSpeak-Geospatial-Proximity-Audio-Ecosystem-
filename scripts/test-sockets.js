import http from 'http';
import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';
import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { initSocket } from '../src/sockets/socket.js';
import User from '../src/models/User.js';
import Room from '../src/models/Room.js';

const runTests = async () => {
  console.log('--- Starting ProxiSpeak Week 1 Comprehensive Socket Test Suite ---');
  let passedCount = 0;
  let failedCount = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`✅ [PASS] ${description}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${description}`);
      failedCount++;
    }
  };

  // Connect to DB if available
  let isMongoConnected = false;
  try {
    await connectDB();
    isMongoConnected = true;
    console.log('[Test Suite] Connected to MongoDB for database persistence checks');
    // Clean up test data
    await User.deleteMany({ username: { $in: ['TestAlice', 'TestBob', 'TestCharlie', 'TestDave'] } });
    await Room.deleteMany({ name: { $in: ['TestRoomAlpha', 'TestRoomBeta'] } });
  } catch (err) {
    console.warn('[Test Suite] MongoDB unavailable, running in socket-validation mode:', err.message);
  }

  // 1. Start Server on test port
  const server = http.createServer(app);
  const ioServer = initSocket(server);
  const TEST_PORT = 5055;

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  assert(true, `1. Backend server started successfully on port ${TEST_PORT}`);

  // 2. Health check
  try {
    const healthRes = await fetch(`http://localhost:${TEST_PORT}/health`);
    const healthJson = await healthRes.json();
    assert(
      healthRes.status === 200 && healthJson.status === 'ok',
      '2. GET /health endpoint returns HTTP 200 and status: ok'
    );
  } catch (err) {
    assert(false, `2. GET /health failed: ${err.message}`);
  }

  // Create test rooms if Mongo is connected, else use mock IDs
  let room1Id = new mongoose.Types.ObjectId().toString();
  let room2Id = new mongoose.Types.ObjectId().toString();

  if (isMongoConnected) {
    const r1 = await Room.create({ name: 'TestRoomAlpha', audioRadius: 100 });
    const r2 = await Room.create({ name: 'TestRoomBeta', audioRadius: 100 });
    room1Id = r1._id.toString();
    room2Id = r2._id.toString();
  }

  const createClient = () => {
    return Client(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket'],
      forceNew: true,
    });
  };

  const client1 = createClient();
  const client2 = createClient();
  const client3 = createClient();

  await Promise.all([
    new Promise((resolve) => client1.on('connect', resolve)),
    new Promise((resolve) => client2.on('connect', resolve)),
    new Promise((resolve) => client3.on('connect', resolve)),
  ]);
  assert(
    client1.connected && client2.connected && client3.connected,
    '3. Three Socket.io clients connected concurrently'
  );

  // 4. Client 1 joins Room 1
  const c1JoinedPromise = new Promise((resolve) => client1.once('avatar:joined', resolve));
  const c1InitialPromise = new Promise((resolve) => client1.once('avatars:initial', resolve));

  client1.emit('avatar:join', { username: 'TestAlice', x: 50, y: 50, roomId: room1Id });

  const c1Joined = await c1JoinedPromise;
  const c1Initial = await c1InitialPromise;

  assert(
    c1Joined.username === 'TestAlice' &&
      c1Joined.socketId === client1.id &&
      c1Joined.roomId === room1Id &&
      c1Joined.x === 50 &&
      c1Joined.y === 50,
    '4a. Client 1 receives avatar:joined confirmation with consistent avatarId, socketId, and roomId'
  );

  assert(
    Array.isArray(c1Initial) && c1Initial.length === 1 && c1Initial[0].username === 'TestAlice',
    '4b. Client 1 receives initial avatar snapshot containing only themselves'
  );

  // 5. Client 2 joins SAME Room 1
  const c2JoinedPromise = new Promise((resolve) => client2.once('avatar:joined', resolve));
  const c2InitialPromise = new Promise((resolve) => client2.once('avatars:initial', resolve));
  const c1HeardC2Join = new Promise((resolve) => client1.once('avatar:joined', resolve));

  client2.emit('avatar:join', { username: 'TestBob', x: 70, y: 80, roomId: room1Id });

  const c2Joined = await c2JoinedPromise;
  const c2Initial = await c2InitialPromise;
  const c1NotifiedJoin = await c1HeardC2Join;

  assert(
    c2Initial.length === 2 &&
      c2Initial.some((a) => a.username === 'TestAlice') &&
      c2Initial.some((a) => a.username === 'TestBob'),
    '5a. Newly joined Client 2 receives room initial list containing both TestAlice and TestBob'
  );

  assert(
    c1NotifiedJoin.username === 'TestBob' && c1NotifiedJoin.socketId === client2.id,
    '5b. Existing Client 1 in same room receives avatar:joined broadcast for newcomer TestBob'
  );

  // 6. Multi-Room Isolation: Client 3 joins SEPARATE Room 2
  let c1SawRoom2Join = false;
  let c2SawRoom2Join = false;
  client1.once('avatar:joined', () => { c1SawRoom2Join = true; });
  client2.once('avatar:joined', () => { c2SawRoom2Join = true; });

  const c3JoinedPromise = new Promise((resolve) => client3.once('avatar:joined', resolve));
  const c3InitialPromise = new Promise((resolve) => client3.once('avatars:initial', resolve));

  client3.emit('avatar:join', { username: 'TestCharlie', x: 200, y: 200, roomId: room2Id });

  const c3Joined = await c3JoinedPromise;
  const c3Initial = await c3InitialPromise;

  assert(
    c3Initial.length === 1 && c3Initial[0].username === 'TestCharlie',
    '6a. Client 3 in Room 2 initial list contains ONLY Room 2 occupants (isolated from Room 1)'
  );

  await new Promise((r) => setTimeout(r, 100));
  assert(
    !c1SawRoom2Join && !c2SawRoom2Join,
    '6b. Clients in Room 1 did NOT receive join broadcast from Client 3 in Room 2'
  );

  // 7. Movement & Echo Suppression within Room 1
  let c1SawOwnEcho = false;
  client1.once('avatar:moved', () => { c1SawOwnEcho = true; });

  const c2MovePromise = new Promise((resolve) => client2.once('avatar:moved', resolve));
  let c3SawRoom1Move = false;
  client3.once('avatar:moved', () => { c3SawRoom1Move = true; });

  client1.emit('avatar:move', { x: 90, y: 95 });

  const c2Move = await c2MovePromise;
  await new Promise((r) => setTimeout(r, 100));

  assert(
    c2Move.username === 'TestAlice' && c2Move.x === 90 && c2Move.y === 95 && c2Move.socketId === client1.id,
    '7a. Client 2 in Room 1 receives avatar:moved event with updated coordinates'
  );
  assert(!c1SawOwnEcho, '7b. Originating Client 1 does not receive its own echo on movement');
  assert(!c3SawRoom1Move, '7c. Client 3 in Room 2 does NOT receive movement events from Room 1');

  // 8. Throttled MongoDB Persistence (max once per second per user)
  if (isMongoConnected) {
    // Fire 5 moves in rapid succession (< 100ms)
    client1.emit('avatar:move', { x: 100, y: 100 });
    client1.emit('avatar:move', { x: 110, y: 110 });
    client1.emit('avatar:move', { x: 120, y: 120 });
    client1.emit('avatar:move', { x: 130, y: 130 });
    client1.emit('avatar:move', { x: 150, y: 160 });

    // Wait for the trailing throttle timer to trigger (1100ms)
    await new Promise((r) => setTimeout(r, 1200));

    const aliceDoc = await User.findById(c1Joined.avatarId);
    assert(
      aliceDoc &&
        aliceDoc.location.coordinates[0] === 150 &&
        aliceDoc.location.coordinates[1] === 160,
      '8. Rapid movement writes are throttled to max 1/sec and trailing timer persists final position [150, 160]'
    );
  } else {
    console.log('ℹ️ [SKIPPED] 8. Throttled DB write test (requires MongoDB)');
  }

  // 9. Distinct User Identity for Duplicate Usernames
  const client4 = createClient();
  await new Promise((resolve) => client4.on('connect', resolve));

  const c4JoinedPromise = new Promise((resolve) => client4.once('avatar:joined', resolve));
  // Client 4 joins with the SAME username 'TestAlice'
  client4.emit('avatar:join', { username: 'TestAlice', x: 10, y: 10, roomId: room1Id });
  const c4Joined = await c4JoinedPromise;

  assert(
    c4Joined.username === 'TestAlice' &&
      c4Joined.avatarId !== c1Joined.avatarId &&
      c4Joined.socketId === client4.id,
    '9a. Two concurrent connections with same username "TestAlice" get distinct avatarIds and socketIds'
  );

  if (isMongoConnected) {
    const aliceDocs = await User.find({ username: 'TestAlice', isOnline: true });
    assert(
      aliceDocs.length === 2,
      '9b. MongoDB maintains distinct records for concurrent users with identical usernames (no overwrite)'
    );
  }

  // 10. Invalid Input and Coordinates Rejection
  const errorPromise = new Promise((resolve) => client4.once('error', resolve));
  client4.emit('avatar:move', { x: 'not-a-number', y: 50 });
  const err = await errorPromise;
  assert(
    err && err.message.includes('Invalid coordinates'),
    '10a. Invalid non-numeric coordinates trigger error event without crashing server'
  );

  const errorRoomPromise = new Promise((resolve) => client4.once('error', resolve));
  client4.emit('avatar:join', { username: 'TestDave', x: 20, y: 20, roomId: '' });
  const errRoom = await errorRoomPromise;
  assert(
    errRoom && errRoom.message.includes('Room ID is required'),
    '10b. Empty roomId triggers error event'
  );

  // 11. Secure, Room-Aware WebRTC Signaling Relay
  // Move client1 into audio proximity range with client2 ([70, 80])
  const c2MoveWait = new Promise((resolve) => client2.once('avatar:moved', resolve));
  client1.emit('avatar:move', { x: 75, y: 80 });
  await c2MoveWait;

  // 11a. Valid in-range signal:offer relayed to peer in same room (ignoring spoofed sender fields)
  const offerPromise = new Promise((resolve) => client2.once('signal:offer', resolve));
  client1.emit('signal:offer', {
    toSocketId: client2.id,
    offer: { type: 'offer', sdp: 'dummy-sdp-offer' },
    fromSocketId: 'spoofed-socket-id',
    fromAvatarId: 'spoofed-avatar-id',
  });
  const receivedOffer = await offerPromise;
  assert(
    receivedOffer.fromSocketId === client1.id &&
      receivedOffer.fromAvatarId === c1Joined.avatarId &&
      receivedOffer.offer.sdp === 'dummy-sdp-offer',
    '11a. signal:offer relayed successfully to peer in same room with server-derived sender identity'
  );

  // 11b. Valid in-range signal:answer relayed successfully back to peer
  const answerPromise = new Promise((resolve) => client1.once('signal:answer', resolve));
  client2.emit('signal:answer', {
    toSocketId: client1.id,
    answer: { type: 'answer', sdp: 'dummy-sdp-answer' },
  });
  const receivedAnswer = await answerPromise;
  assert(
    receivedAnswer.fromSocketId === client2.id &&
      receivedAnswer.fromAvatarId === c2Joined.avatarId &&
      receivedAnswer.answer.sdp === 'dummy-sdp-answer',
    '11b. signal:answer relayed successfully back to peer in same room'
  );

  // 11c. Valid in-range signal:ice relayed successfully to peer
  const icePromise = new Promise((resolve) => client2.once('signal:ice', resolve));
  client1.emit('signal:ice', {
    toSocketId: client2.id,
    candidate: { candidate: 'candidate:1' },
  });
  const receivedIce = await icePromise;
  assert(
    receivedIce.fromSocketId === client1.id &&
      receivedIce.fromAvatarId === c1Joined.avatarId &&
      receivedIce.candidate.candidate === 'candidate:1',
    '11c. signal:ice relayed successfully to peer in same room'
  );

  // 11d. Cross-room signaling attempt is blocked
  const crossRoomErrPromise = new Promise((resolve) => client3.once('error', resolve));
  client3.emit('signal:offer', { toSocketId: client1.id, offer: { test: true } });
  const crossErr = await crossRoomErrPromise;
  assert(
    crossErr && crossErr.message.includes('Target peer not found in this room'),
    '11d. Cross-room WebRTC signaling attempt is blocked and emits error'
  );

  // 11e. Out-of-range signaling attempt (offer) is blocked by configured audio radius
  const c2MoveOutWait = new Promise((resolve) => client2.once('avatar:moved', resolve));
  client1.emit('avatar:move', { x: 300, y: 300 }); // Distance to [70, 80] is ~318px > 100px audio radius
  await c2MoveOutWait;

  const outOfRangeOfferErrPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', {
    toSocketId: client2.id,
    offer: { type: 'offer', sdp: 'out-of-range-offer' },
  });
  const outOfRangeOfferErr = await outOfRangeOfferErrPromise;
  assert(
    outOfRangeOfferErr && outOfRangeOfferErr.message.includes('out of proximity audio range'),
    '11e. Out-of-range signal:offer is blocked when peer is beyond room audio radius'
  );

  // 11f. Out-of-range signaling attempt (answer & ice) is blocked
  const outOfRangeAnswerErrPromise = new Promise((resolve) => client2.once('error', resolve));
  client2.emit('signal:answer', {
    toSocketId: client1.id,
    answer: { type: 'answer', sdp: 'out-of-range-answer' },
  });
  const outOfRangeAnswerErr = await outOfRangeAnswerErrPromise;

  const outOfRangeIceErrPromise = new Promise((resolve) => client2.once('error', resolve));
  client2.emit('signal:ice', {
    toSocketId: client1.id,
    candidate: { candidate: 'candidate:out-of-range' },
  });
  const outOfRangeIceErr = await outOfRangeIceErrPromise;
  assert(
    outOfRangeAnswerErr &&
      outOfRangeAnswerErr.message.includes('out of proximity audio range') &&
      outOfRangeIceErr &&
      outOfRangeIceErr.message.includes('out of proximity audio range'),
    '11f. Out-of-range signal:answer and signal:ice are blocked when peer is beyond audio radius'
  );

  // Move client1 back into range for subsequent tests
  const c2MoveBackWait = new Promise((resolve) => client2.once('avatar:moved', resolve));
  client1.emit('avatar:move', { x: 80, y: 80 });
  await c2MoveBackWait;

  // 11g. Nonexistent or disconnected target socket is rejected
  const nonExistentTargetPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', {
    toSocketId: 'nonexistent-socket-id-999',
    offer: { type: 'offer', sdp: 'test' },
  });
  const nonExistentErr = await nonExistentTargetPromise;
  assert(
    nonExistentErr && nonExistentErr.message.includes('Target peer not found'),
    '11g. Nonexistent target socket ID is rejected with error'
  );

  // 11h. Self-signaling attempt is rejected
  const selfSignalPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', {
    toSocketId: client1.id,
    offer: { type: 'offer', sdp: 'test' },
  });
  const selfSignalErr = await selfSignalPromise;
  assert(
    selfSignalErr && selfSignalErr.message.includes('Cannot signal yourself'),
    '11h. Self-signaling attempt is rejected with error'
  );

  // 11i. Malformed payloads (missing target, null payload, missing signal fields)
  const missingTargetPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', { offer: { type: 'offer' } });
  const missingTargetErr = await missingTargetPromise;

  const nullPayloadPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', null);
  const nullPayloadErr = await nullPayloadPromise;

  const missingOfferPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:offer', { toSocketId: client2.id });
  const missingOfferErr = await missingOfferPromise;

  const missingAnswerPromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:answer', { toSocketId: client2.id });
  const missingAnswerErr = await missingAnswerPromise;

  const missingIcePromise = new Promise((resolve) => client1.once('error', resolve));
  client1.emit('signal:ice', { toSocketId: client2.id });
  const missingIceErr = await missingIcePromise;

  assert(
    missingTargetErr &&
      missingTargetErr.message.includes('Invalid target socket ID') &&
      nullPayloadErr &&
      nullPayloadErr.message.includes('Invalid signaling payload') &&
      missingOfferErr &&
      missingOfferErr.message.includes('offer object is required') &&
      missingAnswerErr &&
      missingAnswerErr.message.includes('answer object is required') &&
      missingIceErr &&
      missingIceErr.message.includes('candidate is required'),
    '11i. Malformed signaling payloads are safely validated and rejected without server crash'
  );

  // 11j. Unregistered sender attempting to signal before joining is rejected
  const unjoinedClient = createClient();
  await new Promise((resolve) => unjoinedClient.on('connect', resolve));
  const unjoinedErrPromise = new Promise((resolve) => unjoinedClient.once('error', resolve));
  unjoinedClient.emit('signal:offer', {
    toSocketId: client2.id,
    offer: { type: 'offer', sdp: 'unregistered' },
  });
  const unjoinedErr = await unjoinedErrPromise;
  assert(
    unjoinedErr && unjoinedErr.message.includes('Avatar has not joined yet'),
    '11j. Unregistered sender attempting signaling before avatar:join is rejected'
  );
  unjoinedClient.disconnect();

  // 12. Disconnect & Cleanup
  const leavePromise = new Promise((resolve) => client2.once('avatar:left', resolve));
  client1.disconnect();
  const leftData = await leavePromise;

  assert(
    leftData.avatarId === c1Joined.avatarId &&
      leftData.socketId === c1Joined.socketId &&
      leftData.roomId === room1Id,
    '12a. Remaining client in Room 1 receives avatar:left event with consistent payload'
  );

  if (isMongoConnected) {
    await new Promise((r) => setTimeout(r, 200));
    const aliceFinal = await User.findById(c1Joined.avatarId);
    assert(
      aliceFinal && aliceFinal.isOnline === false && aliceFinal.socketId === null,
      '12b. MongoDB records marked isOnline: false and socketId: null on disconnect'
    );
  }

  // Teardown
  client2.disconnect();
  client3.disconnect();
  client4.disconnect();
  await new Promise((r) => setTimeout(r, 200));

  if (isMongoConnected) {
    try {
      await User.deleteMany({ username: { $in: ['TestAlice', 'TestBob', 'TestCharlie', 'TestDave'] } });
      await Room.deleteMany({ name: { $in: ['TestRoomAlpha', 'TestRoomBeta'] } });
      await mongoose.disconnect();
    } catch (cleanupErr) {
      console.error('Error during test database cleanup:', cleanupErr.message);
      failedCount++;
    }
  }

  if (server) {
    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (servErr) {
      console.error('Error closing test HTTP server:', servErr.message);
      failedCount++;
    }
  }

  console.log('\n--- Test Suite Summary ---');
  console.log(`Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount === 0) {
    console.log('🎉 ALL PROXISPEAK SOCKET CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME CHECKS FAILED!');
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
