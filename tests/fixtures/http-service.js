'use strict';
const { randomInt } = require('node:crypto');

// Fetch rejects several low service ports (including 6000/6667/10080). Ask the
// real test service to bind in a safe high range, retrying only genuine collisions.
// This avoids a reserve/release race and does not alter production port policy.
async function listenLocalService(create, pickPort = () => randomInt(20000, 65000)) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const service = create(pickPort());
    try {
      const address = await service.listen();
      return { service, address, base: 'http://127.0.0.1:' + address.port };
    } catch (error) {
      await service.close();
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw Error('Could not bind an isolated safe HTTP test port after 40 attempts');
}

module.exports = { listenLocalService };
