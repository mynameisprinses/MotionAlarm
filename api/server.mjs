import { app } from './app.mjs';
import { testing } from './config.mjs';

const port = Number(process.env.PORT || (testing ? 3001 : 3000));
const server = app.listen(port, () => console.log(`MotionAlarm API: http://localhost:${port}/api`));
server.headersTimeout = 20000;
server.requestTimeout = 30000;

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
