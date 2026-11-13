const { createApp } = require('./app');
const { startScheduler } = require('./mantra');

const port = process.env.PORT || 3000;

createApp().listen(port, () => {
  console.log(`Listening on port ${port}`);
  startScheduler();
});
