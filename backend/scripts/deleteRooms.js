require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Room = require('../models/Room');
const Game = require('../models/Game');
const Player = require('../models/Player');

(async () => {
  try {
    await connectDB();

    const rooms = await Room.find({});
    if (rooms.length === 0) {
      console.log('No hay salas para borrar.');
      await mongoose.connection.close();
      process.exit(0);
    }

    const roomIds = rooms.map(r => r._id);
    const roomCodes = rooms.map(r => r.code);

    const gameDel = await Game.deleteMany({ room: { $in: roomIds } });
    const playerDel = await Player.deleteMany({ room: { $in: roomIds } });
    const roomDel = await Room.deleteMany({ _id: { $in: roomIds } });

    console.log('Eliminación completada:');
    console.log(`- Salas borradas: ${roomDel.deletedCount}`);
    console.log(`- Juegos borrados: ${gameDel.deletedCount}`);
    console.log(`- Jugadores borrados: ${playerDel.deletedCount}`);
    console.log('Códigos de salas eliminadas:', roomCodes.join(', '));

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error borrando salas:', err);
    try { await mongoose.connection.close(); } catch {}
    process.exit(1);
  }
})();
