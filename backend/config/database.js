const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000 });

    await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
    logger.info('MongoDB connected and model indexes initialized');

    // Log MongoDB connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('MongoDB connection or index initialization failed');
    throw new Error('Database initialization failed');
  }
};

module.exports = connectDB;
