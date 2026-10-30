

# ProxiSpeak – Database Development

## 1. Overview

ProxiSpeak is a real-time virtual office collaboration platform built using the MERN stack, Socket.IO, WebRTC, and MongoDB. It allows users to interact through proximity-based audio, where voice volume dynamically adjusts as avatars move closer to or farther from each other in a shared 2D virtual workspace.

My responsibility in this project is **database development and integration**. I work on designing MongoDB schemas, developing Mongoose models, storing avatar positions, and managing persistent virtual office data.

## 2. My Responsibilities

- Designing MongoDB database schemas.
- Creating Mongoose models for users, positions, rooms, and obstacles.
- Connecting MongoDB with the Node.js and Express.js backend.
- Storing and updating avatar coordinates.
- Supporting proximity-based user detection.
- Implementing MongoDB queries for retrieving nearby users.
- Saving virtual office layouts and furniture obstacles.
- Maintaining data consistency and validation.
- Supporting backend integration and database testing.
- Documenting database changes and maintaining code on my individual GitHub branch.

## 3. Technologies Used

| Technology | Purpose |
|---|---|
| MongoDB | NoSQL database |
| Mongoose | Schema definition and database operations |
| Node.js | Backend runtime |
| Express.js | REST API development |
| Socket.IO | Real-time avatar movement |
| Redis Pub/Sub | Communication between multiple backend instances |
| Git and GitHub | Version control and collaboration |

## 4. Database Models

### User Model
Stores user information, including usernames, avatar details, and online status.

### Position Model
Stores avatar coordinates and associates each position with a user and virtual office room.

### Room Model
Stores virtual office room information, including room names, dimensions, and layout settings.

### Obstacle Model
Stores furniture and other obstacles within the virtual office, including their positions and dimensions.

### Message Model (Optional)
Stores chat messages if the messaging feature is implemented.

*Note: These models describe the planned database structure. The exact fields and implementation depend on the models present in the project repository.*

## 5. Week-Wise Database Development

### Week 1: Database Setup and Avatar Movement

- Configured MongoDB connectivity with the Node.js backend.
- Designed initial database schemas and Mongoose models.
- Worked on storing avatar coordinates.
- Supported real-time avatar movement through backend integration.
- Prepared the database structure for future proximity calculations.

### Week 2: Proximity Calculations

- Worked on retrieving users' saved positions.
- Supported proximity-based user detection using position data.
- Explored MongoDB geospatial queries for nearby-user searches.
- Prepared database queries to support proximity-based audio interactions.
- Supported the requirement to identify users within a 100-pixel radius.

### Week 3: Database and Backend Scaling

- Worked on preparing the database layer for multiple backend instances.
- Supported the integration of Redis Pub/Sub for scalable Socket.IO communication.
- Reviewed database query efficiency and indexing requirements.
- Worked on maintaining consistent position data across the application.
- Supported the backend's scalability requirements.

**Important:** Redis Pub/Sub and Socket.IO scaling are backend responsibilities. MongoDB stores persistent data; Redis supports communication between server instances.

### Week 4: Room Persistence

- Designed database structures for persistent virtual office layouts.
- Worked on storing furniture and obstacle information.
- Prepared models for obstacle coordinates and dimensions.
- Supported APIs for saving and retrieving room layouts.
- Worked on validating room and obstacle data.
- Prepared the database for future collision-detection integration.

## 6. Database Features

The database layer is designed to support:

- User data storage.
- Avatar position persistence.
- Room and layout management.
- Nearby-user queries.
- Furniture and obstacle persistence.
- Efficient data retrieval through appropriate indexes.
- Integration with real-time backend services.

## 7. Project Structure

The database-related files can be organized as follows:

```text
backend/
├── config/
│   └── db.js
├── models/
│   ├── User.js
│   ├── Position.js
│   ├── Room.js
│   ├── Obstacle.js
│   └── Message.js
├── routes/
│   ├── userRoutes.js
│   ├── positionRoutes.js
│   ├── roomRoutes.js
│   └── obstacleRoutes.js
├── controllers/
│   ├── userController.js
│   ├── positionController.js
│   └── roomController.js
├── .env
├── .gitignore
├── server.js
└── package.json
```

*This is a suggested structure. Keep the existing team repository's structure if it differs.*

## 8. GitHub Contribution

My database development work is maintained on my individual GitHub branch.

My contribution includes:

- Adding and updating database models.
- Improving schema validation.
- Updating database queries and indexes.
- Documenting database implementation.
- Testing database integration with the backend.
- Preparing changes for review and merging into the main branch.

## 9. Expected Outcome

The database component supports a persistent virtual office environment in which user positions and office layouts can be stored and retrieved efficiently. It provides the data layer needed for proximity calculations, real-time avatar interactions, and future application improvements.

## 10. Conclusion

My contribution focuses on developing a reliable and scalable MongoDB database layer for ProxiSpeak. Through schema design, Mongoose models, query optimization, and backend integration, I aim to support the application's real-time collaboration and proximity-based audio functionality.
