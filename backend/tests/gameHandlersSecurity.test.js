jest.mock('../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../models/Player', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/Game', () => ({ findById: jest.fn() }));
jest.mock('../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), logGameEvent: jest.fn()
}));
jest.mock('../socket/utils/roomTimer', () => ({
  roomTimers: {},
  recordNumberCall: jest.fn(),
  getNextSongId: jest.fn(),
  getIntervalMs: jest.fn(),
  ensureWatchdog: jest.fn(),
  createRoomInterval: jest.fn(),
  clearRoomInterval: jest.fn()
}));

const Room = require('../models/Room');
const roomTimer = require('../socket/utils/roomTimer');
const { scheduleRoomInterval } = require('../socket/handlers/gameHandlers');

describe('game handler failure boundaries', () => {
  afterEach(() => jest.clearAllMocks());

  test('clears the timer and returns when asked to schedule a deleted room', async () => {
    const query = { populate: jest.fn().mockResolvedValue(null) };
    Room.findOne.mockReturnValue(query);

    await expect(scheduleRoomInterval({ to: jest.fn() }, 'ROOMA1')).resolves.toBeUndefined();

    expect(Room.findOne).toHaveBeenCalledWith({ code: 'ROOMA1' });
    expect(roomTimer.clearRoomInterval).toHaveBeenCalledWith('ROOMA1');
    expect(roomTimer.createRoomInterval).not.toHaveBeenCalled();
    expect(roomTimer.getIntervalMs).not.toHaveBeenCalled();
  });
});
