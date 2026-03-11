module.exports = {
  // The URL of the hosted A House Divided game server (trailing slash stripped)
  GAME_URL: (process.env.AHD_GAME_URL || 'https://www.ahousedividedgame.com').replace(/\/$/, ''),

  // Window defaults
  WINDOW_WIDTH: 1280,
  WINDOW_HEIGHT: 800,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,

  // Auto-updater
  UPDATE_CHECK_INTERVAL: 60 * 60 * 1000, // 1 hour
};
