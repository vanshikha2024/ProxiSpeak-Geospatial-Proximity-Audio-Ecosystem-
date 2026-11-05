import http from 'http';
import app from '../src/app.js';
import {
  validateRoomLayout,
  validateObstacle,
  validateSpawnPoint,
  validateRoomDimensions,
  isPointInsideObstacle,
} from '../src/utils/obstacleValidation.js';
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

async function runObstacleValidationTests() {
  console.log('\n======================================================');
  console.log(' ProxiSpeak Week 4: Layout & Obstacle Validation Tests');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Test Case 1: Valid room with one obstacle
    // -------------------------------------------------------------------------
    console.log('[Test 1: Valid room with one obstacle]');
    const validOneObsLayout = {
      name: 'Focus Room 1',
      width: 1200,
      height: 800,
      spawnPoint: { x: 100, y: 100 },
      obstacles: [
        {
          x: 400,
          y: 300,
          width: 160,
          height: 80,
          label: 'Executive Standing Desk',
        },
      ],
    };
    const res1 = validateRoomLayout(validOneObsLayout);
    assert(res1.isValid === true, 'Single-obstacle layout is valid');
    assert(res1.errors.length === 0, 'No validation errors produced');

    // -------------------------------------------------------------------------
    // Test Case 2: Valid room with multiple obstacles
    // -------------------------------------------------------------------------
    console.log('\n[Test 2: Valid room with multiple obstacles]');
    const validMultiObsLayout = {
      name: 'Central Engineering Floor',
      width: 1920,
      height: 1080,
      spawnPoint: { x: 50, y: 50 },
      obstacles: [
        {
          x: 200,
          y: 200,
          width: 300,
          height: 120,
          label: 'Conference Table',
          blocksSound: false,
          blocksMovement: true,
        },
        {
          x: 700,
          y: 100,
          width: 40,
          height: 400,
          label: 'Acoustic Partition Wall',
          blocksSound: true,
          soundAttenuation: 0.9,
          blocksMovement: true,
        },
        {
          x: 1200,
          y: 600,
          width: 200,
          height: 100,
          label: 'Hot Desks Pod',
          blocksSound: false,
          blocksMovement: true,
        },
      ],
    };
    const res2 = validateRoomLayout(validMultiObsLayout);
    assert(res2.isValid === true, 'Multi-obstacle layout is valid');
    assert(res2.errors.length === 0, 'No validation errors for 3 valid obstacles');

    // -------------------------------------------------------------------------
    // Test Case 3: Obstacle outside room boundaries
    // -------------------------------------------------------------------------
    console.log('\n[Test 3: Obstacle outside room boundaries]');
    // 3a. Obstacle extends past room width (x + width > roomWidth)
    const outsideWidthLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: 900, y: 100, width: 200, height: 50, label: 'Protruding Desk' },
      ],
    };
    const res3a = validateRoomLayout(outsideWidthLayout);
    assert(res3a.isValid === false, 'Obstacle extending beyond room width is rejected');
    assert(
      res3a.errors.some((e) => e.includes('extends outside room width')),
      'Error message identifies width boundary violation'
    );

    // 3b. Obstacle extends past room height (y + height > roomHeight)
    const outsideHeightLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: 100, y: 750, width: 100, height: 100, label: 'Tall Wall' },
      ],
    };
    const res3b = validateRoomLayout(outsideHeightLayout);
    assert(res3b.isValid === false, 'Obstacle extending beyond room height is rejected');
    assert(
      res3b.errors.some((e) => e.includes('extends outside room height')),
      'Error message identifies height boundary violation'
    );

    // -------------------------------------------------------------------------
    // Test Case 4: Negative obstacle position
    // -------------------------------------------------------------------------
    console.log('\n[Test 4: Negative obstacle position]');
    // 4a. Negative x
    const negXLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: -50, y: 100, width: 100, height: 100, label: 'Off-grid Left' },
      ],
    };
    const res4a = validateRoomLayout(negXLayout);
    assert(res4a.isValid === false, 'Negative obstacle x coordinate is rejected');
    assert(
      res4a.errors.some((e) => e.includes('x coordinate cannot be negative')),
      'Error message flags negative x coordinate'
    );

    // 4b. Negative y
    const negYLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: 100, y: -25, width: 100, height: 100, label: 'Off-grid Top' },
      ],
    };
    const res4b = validateRoomLayout(negYLayout);
    assert(res4b.isValid === false, 'Negative obstacle y coordinate is rejected');
    assert(
      res4b.errors.some((e) => e.includes('y coordinate cannot be negative')),
      'Error message flags negative y coordinate'
    );

    // -------------------------------------------------------------------------
    // Test Case 5: Zero obstacle width
    // -------------------------------------------------------------------------
    console.log('\n[Test 5: Zero obstacle width]');
    const zeroWidthLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: 100, y: 100, width: 0, height: 100, label: 'Zero Width Wall' },
      ],
    };
    const res5 = validateRoomLayout(zeroWidthLayout);
    assert(res5.isValid === false, 'Obstacle with width 0 is rejected');
    assert(
      res5.errors.some((e) => e.includes('width must be a positive number')),
      'Error message requires positive width'
    );

    // -------------------------------------------------------------------------
    // Test Case 6: Negative obstacle height
    // -------------------------------------------------------------------------
    console.log('\n[Test 6: Negative obstacle height]');
    const negHeightLayout = {
      width: 1000,
      height: 800,
      obstacles: [
        { x: 100, y: 100, width: 100, height: -30, label: 'Inverted Height' },
      ],
    };
    const res6 = validateRoomLayout(negHeightLayout);
    assert(res6.isValid === false, 'Obstacle with negative height is rejected');
    assert(
      res6.errors.some((e) => e.includes('height must be a positive number')),
      'Error message requires positive height'
    );

    // -------------------------------------------------------------------------
    // Test Case 7: Spawn point inside obstacle
    // -------------------------------------------------------------------------
    console.log('\n[Test 7: Spawn point inside obstacle]');
    const spawnInsideLayout = {
      width: 1000,
      height: 800,
      spawnPoint: { x: 250, y: 220 },
      obstacles: [
        {
          x: 200,
          y: 200,
          width: 200,
          height: 100,
          label: 'Conference Table',
        },
      ],
    };
    const res7 = validateRoomLayout(spawnInsideLayout);
    assert(res7.isValid === false, 'Spawn point located inside obstacle is rejected');
    assert(
      res7.errors.some((e) => e.includes('cannot be inside obstacle "Conference Table"')),
      'Error message specifically notes spawn point entrapment'
    );

    // Boundary touching spawn point
    const spawnBoundaryLayout = {
      width: 1000,
      height: 800,
      spawnPoint: { x: 200, y: 200 },
      obstacles: [
        {
          x: 200,
          y: 200,
          width: 100,
          height: 100,
          label: 'Corner Desk',
        },
      ],
    };
    const res7b = validateRoomLayout(spawnBoundaryLayout);
    assert(res7b.isValid === false, 'Spawn point touching obstacle corner/boundary is rejected');

    // -------------------------------------------------------------------------
    // Test Case 8: Spawn point outside room
    // -------------------------------------------------------------------------
    console.log('\n[Test 8: Spawn point outside room]');
    // 8a. Spawn x > roomWidth
    const spawnOutsideWidth = {
      width: 1000,
      height: 800,
      spawnPoint: { x: 1200, y: 400 },
    };
    const res8a = validateRoomLayout(spawnOutsideWidth);
    assert(res8a.isValid === false, 'Spawn point with x > room width is rejected');
    assert(
      res8a.errors.some((e) => e.includes('outside room bounds')),
      'Error message flags spawn point outside room width'
    );

    // 8b. Spawn y > roomHeight
    const spawnOutsideHeight = {
      width: 1000,
      height: 800,
      spawnPoint: { x: 500, y: 950 },
    };
    const res8b = validateRoomLayout(spawnOutsideHeight);
    assert(res8b.isValid === false, 'Spawn point with y > room height is rejected');

    // 8c. Negative spawn coordinate
    const spawnNegative = {
      width: 1000,
      height: 800,
      spawnPoint: { x: -10, y: 400 },
    };
    const res8c = validateRoomLayout(spawnNegative);
    assert(res8c.isValid === false, 'Negative spawn coordinate is rejected');

    // -------------------------------------------------------------------------
    // Test Case 9: Invalid room dimensions
    // -------------------------------------------------------------------------
    console.log('\n[Test 9: Invalid room dimensions]');
    // 9a. Width 0
    const zeroRoomW = { width: 0, height: 800 };
    assert(validateRoomLayout(zeroRoomW).isValid === false, 'Room width 0 is rejected');

    // 9b. Width negative
    const negRoomW = { width: -100, height: 800 };
    assert(validateRoomLayout(negRoomW).isValid === false, 'Negative room width is rejected');

    // 9c. Height 0
    const zeroRoomH = { width: 1000, height: 0 };
    assert(validateRoomLayout(zeroRoomH).isValid === false, 'Room height 0 is rejected');

    // 9d. Height negative
    const negRoomH = { width: 1000, height: -200 };
    assert(validateRoomLayout(negRoomH).isValid === false, 'Negative room height is rejected');

    // 9e. Non-numeric
    const nonNumRoom = { width: 'invalid', height: 800 };
    assert(validateRoomLayout(nonNumRoom).isValid === false, 'Non-numeric room dimension is rejected');

    // -------------------------------------------------------------------------
    // Test Case 10: Valid layout successfully passing validation
    // -------------------------------------------------------------------------
    console.log('\n[Test 10: Valid layout successfully passing validation]');
    const completeValidLayout = {
      name: 'Auditorium Alpha',
      width: 2560,
      height: 1440,
      audioRadius: 200,
      capacity: 80,
      spawnPoint: { x: 100, y: 720 },
      obstacles: [
        {
          x: 400,
          y: 200,
          width: 80,
          height: 1000,
          label: 'Stage Left Partition',
          blocksSound: true,
        },
        {
          x: 2000,
          y: 200,
          width: 80,
          height: 1000,
          label: 'Stage Right Partition',
          blocksSound: true,
        },
      ],
    };
    const res10 = validateRoomLayout(completeValidLayout, { requireName: true });
    assert(res10.isValid === true, 'Complete office layout payload passes validation');
    assert(res10.errors.length === 0, 'No errors in valid complete layout');

    // -------------------------------------------------------------------------
    // Test Case 11: Missing obstacle properties & malformed data
    // -------------------------------------------------------------------------
    console.log('\n[Test 11: Malformed data & missing properties]');
    // Missing label
    const missingLabelObs = {
      width: 1000,
      height: 800,
      obstacles: [{ x: 100, y: 100, width: 50, height: 50 }],
    };
    const res11a = validateRoomLayout(missingLabelObs);
    assert(res11a.isValid === false, 'Obstacle without label is rejected');
    assert(
      res11a.errors.some((e) => e.includes('non-empty string label')),
      'Error message identifies missing obstacle label'
    );

    // Missing coordinates
    const missingCoordsObs = {
      width: 1000,
      height: 800,
      obstacles: [{ label: 'Floating Object', width: 50, height: 50 }],
    };
    const res11b = validateRoomLayout(missingCoordsObs);
    assert(res11b.isValid === false, 'Obstacle without x/y coordinates is rejected');

    // Malformed layout payloads
    assert(validateRoomLayout(null).isValid === false, 'null payload is safely rejected');
    assert(validateRoomLayout(undefined).isValid === false, 'undefined payload is safely rejected');
    assert(validateRoomLayout('string').isValid === false, 'string payload is safely rejected');
    assert(validateRoomLayout([1, 2, 3]).isValid === false, 'array payload is safely rejected');

    // -------------------------------------------------------------------------
    // Test Case 12: Invalid audioRadius and capacity
    // -------------------------------------------------------------------------
    console.log('\n[Test 12: Invalid audioRadius and capacity]');
    const badAudio = { width: 1000, height: 800, audioRadius: -10 };
    assert(validateRoomLayout(badAudio).isValid === false, 'Negative audio radius is rejected');

    const badCapacity = { width: 1000, height: 800, capacity: 0 };
    assert(validateRoomLayout(badCapacity).isValid === false, 'Zero capacity is rejected');

    // -------------------------------------------------------------------------
    // Test Case 13: Server safety (HTTP validation does not crash server)
    // -------------------------------------------------------------------------
    console.log('\n[Test 13: Server safety & HTTP validation error response]');
    const TEST_PORT = 5057;
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(TEST_PORT, resolve));

    try {
      // 13a. POST invalid layout (obstacle outside room) returns 400
      const postInvalidRes = await fetch(`http://localhost:${TEST_PORT}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Geometry Office',
          width: 500,
          height: 500,
          obstacles: [
            { x: 450, y: 100, width: 200, height: 50, label: 'Wall Out of Bounds' },
          ],
        }),
      });
      const postInvalidData = await postInvalidRes.json();
      assert(postInvalidRes.status === 400, 'HTTP POST with out-of-bounds obstacle returns 400');
      assert(postInvalidData.success === false, 'Response indicates failure (success: false)');
      assert(
        Array.isArray(postInvalidData.errors) && postInvalidData.errors.length > 0,
        'Response contains descriptive validation error messages'
      );

      // 13b. POST with spawn point trapped inside obstacle returns 400
      const postTrappedRes = await fetch(`http://localhost:${TEST_PORT}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Trapped Office',
          width: 1000,
          height: 1000,
          spawnPoint: { x: 150, y: 150 },
          obstacles: [
            { x: 100, y: 100, width: 100, height: 100, label: 'Brick Wall' },
          ],
        }),
      });
      const postTrappedData = await postTrappedRes.json();
      assert(postTrappedRes.status === 400, 'HTTP POST with spawn point inside obstacle returns 400');
      assert(
        postTrappedData.errors.some((e) => e.includes('cannot be inside obstacle "Brick Wall"')),
        'Error confirms avatar cannot spawn inside obstacle'
      );

      // 13c. Malformed JSON / empty body returns 400 without crashing
      const postEmptyRes = await fetch(`http://localhost:${TEST_PORT}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert(postEmptyRes.status === 400, 'HTTP POST with empty body returns 400 without crashing');

      // 13d. Server health check remains 200 OK after handling invalid requests
      const healthCheck = await fetch(`http://localhost:${TEST_PORT}/health`);
      const healthData = await healthCheck.json();
      assert(
        healthCheck.status === 200 && healthData.status === 'ok',
        'Server remains healthy and responsive after processing validation rejections'
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

  } catch (err) {
    console.error('Unexpected test exception:', err);
    failCount++;
  }

  console.log('\n------------------------------------------------------');
  console.log(`Results: ${passCount} Passed, ${failCount} Failed.`);
  console.log('------------------------------------------------------\n');

  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    console.log('All layout and obstacle validation tests passed successfully!\n');
    process.exitCode = 0;
  }
}

runObstacleValidationTests();
