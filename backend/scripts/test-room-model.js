import mongoose from 'mongoose';
import Room from '../src/models/Room.js';

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

async function runRoomModelTests() {
  console.log('\n======================================================');
  console.log(' ProxiSpeak Week 4: Unified Room Model Verification');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Test 1: A valid room can be created
    // -------------------------------------------------------------------------
    console.log('[Suite 1: Valid Room Creation]');
    const validRoom = new Room({
      name: 'Engineering Hub',
      description: 'Main virtual engineering open floor',
      width: 1920,
      height: 1080,
    });
    const validErr = validRoom.validateSync();
    assert(!validErr, 'Valid room passes schema validation with no errors');
    assert(validRoom.name === 'Engineering Hub', 'Room name matches input');
    assert(validRoom.description === 'Main virtual engineering open floor', 'Room description matches input');
    assert(validRoom.width === 1920 && validRoom.height === 1080, 'Room width and height match inputs');

    // -------------------------------------------------------------------------
    // Test 2: Required fields are enforced (name, width, height)
    // -------------------------------------------------------------------------
    console.log('\n[Suite 2: Required Fields Enforcement]');
    // 2a. Missing name
    const missingNameRoom = new Room({ width: 1920, height: 1080 });
    const missingNameErr = missingNameRoom.validateSync();
    assert(
      missingNameErr && missingNameErr.errors['name'] !== undefined,
      'Omitting room name triggers validation error'
    );

    // 2b. Missing width
    const missingWidthRoom = new Room({ name: 'Lobby', height: 1080 });
    const missingWidthErr = missingWidthRoom.validateSync();
    assert(
      missingWidthErr && missingWidthErr.errors['width'] !== undefined,
      'Omitting room width triggers validation error'
    );

    // 2c. Missing height
    const missingHeightRoom = new Room({ name: 'Lobby', width: 1920 });
    const missingHeightErr = missingHeightRoom.validateSync();
    assert(
      missingHeightErr && missingHeightErr.errors['height'] !== undefined,
      'Omitting room height triggers validation error'
    );

    // 2d. Missing all required fields
    const emptyRoom = new Room({});
    const emptyErr = emptyRoom.validateSync();
    assert(
      emptyErr &&
        emptyErr.errors['name'] !== undefined &&
        emptyErr.errors['width'] !== undefined &&
        emptyErr.errors['height'] !== undefined,
      'Empty room payload enforces all required fields (name, width, height)'
    );

    // -------------------------------------------------------------------------
    // Test 3: Default audioRadius is 100
    // -------------------------------------------------------------------------
    console.log('\n[Suite 3: Default Audio Radius]');
    const defaultRadiusRoom = new Room({
      name: 'Default Radius Room',
      width: 1200,
      height: 800,
    });
    assert(
      defaultRadiusRoom.audioRadius === 100,
      `Default audioRadius is 100 (actual: ${defaultRadiusRoom.audioRadius})`
    );

    // Custom audioRadius
    const customRadiusRoom = new Room({
      name: 'Custom Radius Room',
      width: 1200,
      height: 800,
      audioRadius: 250,
    });
    assert(
      customRadiusRoom.audioRadius === 250,
      `Configurable audioRadius is supported (actual: ${customRadiusRoom.audioRadius})`
    );

    // -------------------------------------------------------------------------
    // Test 4: Default capacity is 300
    // -------------------------------------------------------------------------
    console.log('\n[Suite 4: Default Room Capacity]');
    const defaultCapacityRoom = new Room({
      name: 'Default Capacity Room',
      width: 1200,
      height: 800,
    });
    assert(
      defaultCapacityRoom.capacity === 300,
      `Default capacity is 50 (actual: ${defaultCapacityRoom.capacity})`
    );

    // Custom capacity
    const customCapacityRoom = new Room({
      name: 'Custom Capacity Room',
      width: 1200,
      height: 800,
      capacity: 150,
    });
    assert(
      customCapacityRoom.capacity === 150,
      `Configurable capacity is supported (actual: ${customCapacityRoom.capacity})`
    );

    // -------------------------------------------------------------------------
    // Test 5: Spawn point is stored correctly
    // -------------------------------------------------------------------------
    console.log('\n[Suite 5: Spawn Point Storage]');
    // 5a. Default spawn point
    const defaultSpawnRoom = new Room({
      name: 'Default Spawn Room',
      width: 1000,
      height: 1000,
    });
    assert(
      defaultSpawnRoom.spawnPoint &&
        defaultSpawnRoom.spawnPoint.x === 0 &&
        defaultSpawnRoom.spawnPoint.y === 0,
      'Default spawnPoint is initialized to { x: 0, y: 0 }'
    );

    // 5b. Custom spawn point
    const customSpawnRoom = new Room({
      name: 'Custom Spawn Room',
      width: 2400,
      height: 1600,
      spawnPoint: { x: 150, y: 250 },
    });
    const spawnErr = customSpawnRoom.validateSync();
    assert(!spawnErr, 'Custom spawnPoint passes schema validation');
    assert(
      customSpawnRoom.spawnPoint.x === 150 && customSpawnRoom.spawnPoint.y === 250,
      `Spawn point coordinates stored accurately (x: ${customSpawnRoom.spawnPoint.x}, y: ${customSpawnRoom.spawnPoint.y})`
    );

    // -------------------------------------------------------------------------
    // Test 6: Multiple obstacles are stored correctly
    // -------------------------------------------------------------------------
    console.log('\n[Suite 6: Multiple Obstacles Storage]');
    const obstacleList = [
      {
        x: 100,
        y: 150,
        width: 200,
        height: 60,
        label: 'Conference Table',
        blocksSound: false,
        blocksMovement: true,
      },
      {
        x: 400,
        y: 200,
        width: 20,
        height: 400,
        label: 'North Soundproof Glass Wall',
        blocksSound: true,
        soundAttenuation: 0.9,
        blocksMovement: true,
      },
      {
        x: 800,
        y: 600,
        width: 120,
        height: 80,
        label: 'Hot Desk Cluster A',
        blocksSound: false,
        blocksMovement: true,
      },
    ];

    const roomWithObstacles = new Room({
      name: 'Furnished Office Floor',
      width: 1920,
      height: 1080,
      obstacles: obstacleList,
    });
    const obstacleErr = roomWithObstacles.validateSync();
    assert(!obstacleErr, 'Room with multiple obstacles passes schema validation');
    assert(
      Array.isArray(roomWithObstacles.obstacles) && roomWithObstacles.obstacles.length === 3,
      `Multiple obstacles stored correctly (count: ${roomWithObstacles.obstacles.length})`
    );
    assert(
      roomWithObstacles.obstacles[0].label === 'Conference Table' &&
        roomWithObstacles.obstacles[0].width === 200 &&
        roomWithObstacles.obstacles[0].height === 60,
      'Obstacle 1 properties (label, width, height) stored correctly'
    );
    assert(
      roomWithObstacles.obstacles[1].label === 'North Soundproof Glass Wall' &&
        roomWithObstacles.obstacles[1].blocksSound === true &&
        roomWithObstacles.obstacles[1].soundAttenuation === 0.9,
      'Obstacle 2 acoustic properties (blocksSound, soundAttenuation) stored correctly'
    );
    assert(
      roomWithObstacles.obstacles[2].label === 'Hot Desk Cluster A' &&
        roomWithObstacles.obstacles[2].x === 800 &&
        roomWithObstacles.obstacles[2].y === 600,
      'Obstacle 3 coordinates (x, y) stored correctly'
    );

    // -------------------------------------------------------------------------
    // Test 7: Invalid room dimensions are rejected
    // -------------------------------------------------------------------------
    console.log('\n[Suite 7: Invalid Room Dimensions Rejection]');
    // 7a. Zero width
    const zeroWidthRoom = new Room({ name: 'Zero Width', width: 0, height: 1080 });
    const zeroWidthErr = zeroWidthRoom.validateSync();
    assert(
      zeroWidthErr && zeroWidthErr.errors['width'] !== undefined,
      'Zero width is rejected as non-positive'
    );

    // 7b. Negative width
    const negativeWidthRoom = new Room({ name: 'Negative Width', width: -500, height: 1080 });
    const negativeWidthErr = negativeWidthRoom.validateSync();
    assert(
      negativeWidthErr && negativeWidthErr.errors['width'] !== undefined,
      'Negative width is rejected'
    );

    // 7c. Zero height
    const zeroHeightRoom = new Room({ name: 'Zero Height', width: 1920, height: 0 });
    const zeroHeightErr = zeroHeightRoom.validateSync();
    assert(
      zeroHeightErr && zeroHeightErr.errors['height'] !== undefined,
      'Zero height is rejected as non-positive'
    );

    // 7d. Negative height
    const negativeHeightRoom = new Room({ name: 'Negative Height', width: 1920, height: -300 });
    const negativeHeightErr = negativeHeightRoom.validateSync();
    assert(
      negativeHeightErr && negativeHeightErr.errors['height'] !== undefined,
      'Negative height is rejected'
    );

    // 7e. Non-numeric dimension
    const nonNumericRoom = new Room({ name: 'Bad Dim', width: 'not-a-number', height: 1080 });
    const nonNumericErr = nonNumericRoom.validateSync();
    assert(
      nonNumericErr && nonNumericErr.errors['width'] !== undefined,
      'Non-numeric width is rejected by schema casting/validation'
    );

    // -------------------------------------------------------------------------
    // Test 8: Backward Compatibility with dimensions object
    // -------------------------------------------------------------------------
    console.log('\n[Suite 8: Backward Compatibility with Dimensions Object]');
    const legacyRoom = new Room({
      name: 'Legacy Office Alpha',
      dimensions: { width: 1400, height: 900 },
    });
    const legacyErr = legacyRoom.validateSync();
    assert(!legacyErr, 'Legacy room created with dimensions object passes validation');
    assert(
      legacyRoom.width === 1400 && legacyRoom.height === 900,
      'Legacy dimensions.width/height synchronized to top-level width/height'
    );
    assert(
      legacyRoom.dimensions.width === 1400 && legacyRoom.dimensions.height === 900,
      'Document dimensions object remains accessible for legacy consumers'
    );

    // -------------------------------------------------------------------------
    // Test 9: Obstacle validation (invalid obstacle coordinates/dimensions)
    // -------------------------------------------------------------------------
    console.log('\n[Suite 9: Obstacle Validation]');
    const invalidObstacleRoom = new Room({
      name: 'Invalid Obstacle Room',
      width: 1000,
      height: 1000,
      obstacles: [
        { x: 50, y: 50, width: -10, height: 40, label: 'Bad Obstacle' },
      ],
    });
    const invalidObstacleErr = invalidObstacleRoom.validateSync();
    assert(
      invalidObstacleErr && invalidObstacleErr.errors['obstacles.0.width'] !== undefined,
      'Obstacle with negative width is rejected by subdocument validation'
    );

  } catch (err) {
    console.error('Unexpected test exception:', err);
    failCount++;
  }

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passCount} Passed, ${failCount} Failed.`);
  console.log('------------------------------------------------------\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('All Room model persistence and validation tests passed successfully!\n');
    process.exit(0);
  }
}

runRoomModelTests();
