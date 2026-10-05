import { defineEndpoint } from '../shared/define-endpoint.js';

export default defineEndpoint({
  method: 'GET',
  summary: 'Health check',
  handle: () => ({ status: 'ok', timestamp: new Date().toISOString() }),
});
