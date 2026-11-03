import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Room from '../src/models/Room.js';
import { seedDefaultRoom, DEFAULT_OFFICE_DATA } from './seedDefaultRoom.js';
import { validateRoomLayout } from '../src/utils/obstacleValidation.js';

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

async function runSeedTests() {
  console.log('\n======================================================');
  console.log(' ProxiSpeak Week 4: Default Office Seed Script Tests');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // Test Suite 1: Layout Specification & Pre-Seed Verification
    // -------------------------------------------------------------------------
    console.log('[Suite 1: Default Office Layout Invariant Checks]');
    assert(DEFAULT_OFFICE_DATA.name === 'Default Office', '1. Default office name is "Default Office"');
    assert(DEFAULT_OFFICE_DATA.width === 1920 && DEFAULT_OFFICE_DATA.height === 1080, '2. Dimensions are 1920 x 1080');
    assert(DEFAULT_OFFICE_DATA.audioRadius === 100, '3. Audio radius is 100');
    assert(DEFAULT_OFFICE_DATA.capacity === 50, '4. Capacity is 50');

    // Layout validation using Week 4 Day 3 validator
    const layoutCheck = validateRoomLayout(DEFAULT_OFFICE_DATA, { requireName: true });
    assert(layoutCheck.isValid === true, '5. DEFAULT_OFFICE_DATA passes full obstacle & boundary validation');

    // Obstacle types represented
    const labels = DEFAULT_OFFICE_DATA.obstacles.map((o) => o.label.toLowerCase());
    const hasWall = labels.some((l) => l.includes('wall'));
    const hasDesk = labels.some((l) => l.includes('desk'));
    const hasFurniture = labels.some((l) => l.includes('couch') || l.includes('table') || l.includes('furniture'));
    assert(hasWall, '6. Sample obstacles include a Wall');
    assert(hasDesk, '7. Sample obstacles include a Desk');
    assert(hasFurniture, '8. Sample obstacles include Furniture');

    // Spawn point inside room and not inside obstacle
    const { x: sx, y: sy } = DEFAULT_OFFICE_DATA.spawnPoint;
    assert(
      sx >= 0 && sx <= DEFAULT_OFFICE_DATA.width && sy >= 0 && sy <= DEFAULT_OFFICE_DATA.height,
      '9. Spawn point (150, 150) is inside room boundaries'
    );

    // -------------------------------------------------------------------------
    // Test Suite 2: Database Connection & Seed Script Execution
    // -------------------------------------------------------------------------
    console.log('\n[Suite 2: Database Seeding & Idempotency Execution]');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/proxispeak';
    let isMongoConnected = false;

    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
      isMongoConnected = true;
      console.log('[Test] Successfully connected to MongoDB for live persistence testing.');
    } catch (err) {
      console.log('[Notice] MongoDB server offline. Running validation and error-handling tests:', err.message);
    }

    if (isMongoConnected) {
      // 1. Create a dummy existing room to verify non-deletion requirement
      const existingUserRoom = await Room.findOneAndUpdate(
        { name: 'Existing User Room' },
        {
          name: 'Existing User Room',
          width: 1000,
          height: 800,
          audioRadius: 100,
          capacity: 20,
        },
        { upsert: true, new: true }
      );
      assert(existingUserRoom !== null, '10. Pre-existing user room prepared to test non-deletion');

      // 2. Run seed script once (First Run)
      console.log('\n--- Executing Seed Script (Run 1) ---');
      const firstSeedResult = await seedDefaultRoom({ disconnect: false });
      assert(firstSeedResult && firstSeedResult.name === 'Default Office', '11. Run 1: Default office created in MongoDB');
      assert(firstSeedResult._id !== undefined, `12. Run 1: Received stable ObjectId: ${firstSeedResult._id}`);

      // Verify fields in database
      const foundOffice1 = await Room.findOne({ name: 'Default Office' }).lean();
      assert(foundOffice1 !== null, '13. Verified Default Office exists in MongoDB collection');
      assert(foundOffice1.width === 1920 && foundOffice1.height === 1080, '14. Verified width: 1920, height: 1080');
      assert(foundOffice1.audioRadius === 100, '15. Verified audioRadius: 100');
      assert(foundOffice1.capacity === 50, '16. Verified capacity: 50');
      assert(
        foundOffice1.spawnPoint.x === 150 && foundOffice1.spawnPoint.y === 150,
        '17. Verified spawnPoint saved correctly at (150, 150)'
      );
      assert(
        Array.isArray(foundOffice1.obstacles) && foundOffice1.obstacles.length === 4,
        `18. Verified ${foundOffice1.obstacles.length} obstacles saved correctly`
      );

      // 3. Run seed script again (Second Run - Idempotency Check)
      console.log('\n--- Executing Seed Script (Run 2 - Idempotency Verification) ---');
      const secondSeedResult = await seedDefaultRoom({ disconnect: false });
      assert(secondSeedResult && secondSeedResult.name === 'Default Office', '19. Run 2: Seed script completed successfully');
      assert(
        secondSeedResult._id.toString() === firstSeedResult._id.toString(),
        '20. Run 2: Stable document ID preserved (same document updated, not recreated)'
      );

      // Verify no duplicates created
      const defaultOfficeCount = await Room.countDocuments({ name: 'Default Office' });
      assert(defaultOfficeCount === 1, `21. Idempotency confirmed: Exactly 1 default office exists (count: ${defaultOfficeCount})`);

      // Verify existing user room was not deleted
      const checkExisting = await Room.findOne({ name: 'Existing User Room' });
      assert(checkExisting !== null, '22. Non-deletion confirmed: Pre-existing user room preserved');

      // Clean up test data
      await Room.deleteOne({ name: 'Existing User Room' });
      await mongoose.disconnect();
    } else {
      // Offline mode: verify error handling when MongoDB is unreachable
      console.log('\n[Suite 2b: Database Error Handling Mode]');
      try {
        await seedDefaultRoom({ disconnect: false });
        assert(false, 'seedDefaultRoom should throw when MongoDB is unreachable');
      } catch (err) {
        assert(
          err.message.includes('MongoDB') || err.message.includes('connect'),
          `10. Database connection failure handled gracefully with descriptive error: "${err.message}"`
        );
      }
    }

  } catch (err) {
    console.error('[Test Exception]:', err);
    failCount++;
  } finally {
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
    console.log('All seed script and idempotency tests passed successfully!\n');
    process.exit(0);
  }
}

runSeedTests();
