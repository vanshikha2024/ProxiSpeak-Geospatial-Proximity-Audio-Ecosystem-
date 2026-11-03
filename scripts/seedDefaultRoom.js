import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Room from '../src/models/Room.js';
import { validateRoomLayout } from '../src/utils/obstacleValidation.js';

/**
 * Default Virtual Office Layout Specification
 * High-fidelity virtual office layout with functional zones:
 * - Spawn reception zone (x: 150, y: 150)
 * - Conference room wall (acoustic barrier)
 * - Main workstation desk
 * - Break room lounge furniture
 * - Executive standing desk
 */
export const DEFAULT_OFFICE_DATA = {
  name: 'Default Office',
  description: 'ProxiSpeak virtual office',
  width: 1920,
  height: 1080,
  audioRadius: 100,
  capacity: 50,
  spawnPoint: {
    x: 150,
    y: 150,
  },
  obstacles: [
    {
      x: 400,
      y: 200,
      width: 30,
      height: 350,
      label: 'North Conference Wall',
      blocksSound: true,
      soundAttenuation: 1.0,
      blocksMovement: true,
    },
    {
      x: 550,
      y: 300,
      width: 150,
      height: 80,
      label: 'Main Workstation Desk',
      blocksSound: false,
      blocksMovement: true,
    },
    {
      x: 900,
      y: 500,
      width: 220,
      height: 90,
      label: 'Lounge Couch & Coffee Table',
      blocksSound: false,
      blocksMovement: true,
    },
    {
      x: 1300,
      y: 300,
      width: 160,
      height: 80,
      label: 'Executive Standing Desk',
      blocksSound: false,
      blocksMovement: true,
    },
  ],
};

/**
 * Idempotently seeds the Default Virtual Office into MongoDB.
 *
 * @param {object} [options={}] - Seeding options
 * @param {boolean} [options.disconnect=true] - Whether to close DB connection after completion
 * @returns {Promise<object>} The seeded or updated Room document
 */
export async function seedDefaultRoom(options = {}) {
  const shouldDisconnect = options.disconnect === true;

  try {
    // 1. Establish database connection if not already active
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
      if (mongoose.connection.readyState !== 1) {
        throw new Error(
          'Failed to connect to MongoDB. Ensure your MongoDB server is running and MONGODB_URI is accessible.'
        );
      }
    }

    // 2. Validate layout integrity before persisting
    const validation = validateRoomLayout(DEFAULT_OFFICE_DATA, { requireName: true });
    if (!validation.isValid) {
      throw new Error(`Default room layout validation failed: ${validation.errors.join('; ')}`);
    }

    // 3. Idempotent upsert by stable identifier (name: 'Default Office')
    const query = { name: DEFAULT_OFFICE_DATA.name };
    const update = {
      $set: {
        name: DEFAULT_OFFICE_DATA.name,
        description: DEFAULT_OFFICE_DATA.description,
        width: DEFAULT_OFFICE_DATA.width,
        height: DEFAULT_OFFICE_DATA.height,
        dimensions: {
          width: DEFAULT_OFFICE_DATA.width,
          height: DEFAULT_OFFICE_DATA.height,
        },
        audioRadius: DEFAULT_OFFICE_DATA.audioRadius,
        capacity: DEFAULT_OFFICE_DATA.capacity,
        spawnPoint: DEFAULT_OFFICE_DATA.spawnPoint,
        obstacles: DEFAULT_OFFICE_DATA.obstacles,
        isPrivate: false,
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    };

    const room = await Room.findOneAndUpdate(query, update, {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });

    console.log(`[Seed] Default office ready in database: "${room.name}" (ID: ${room._id})`);
    return room;
  } catch (error) {
    console.error(`[Seed Error] ${error.message}`);
    throw error;
  } finally {
    if (shouldDisconnect && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[Seed] Database connection closed.');
    }
  }
}

// Direct CLI execution handler
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('seedDefaultRoom.js') ||
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/seedDefaultRoom.js'));

if (isDirectRun) {
  seedDefaultRoom({ disconnect: true })
    .then((room) => {
      console.log(`[Seed Success] Default office "${room.name}" seeded successfully.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Fatal]', err.message);
      process.exit(1);
    });
}

export default seedDefaultRoom;
