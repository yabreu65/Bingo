const mongoose = require('mongoose');

// Read-only readiness: no probe records, index creation, or credential disclosure.
async function isDatabaseReady(connection = mongoose.connection) {
  if (connection.readyState !== 1 || !connection.db) return false;
  try {
    const options = { timeoutMS: 1500, maxTimeMS: 1000 };
    const hello = await connection.db.command({ hello: 1 }, options);
    if (!(hello.isWritablePrimary || hello.msg === 'isdbgrid') ||
        !(hello.setName || hello.msg === 'isdbgrid')) return false;
    await connection.db.command({ ping: 1 }, options);
    const players = await connection.db.collection('players').listIndexes(options).toArray();
    const rooms = await connection.db.collection('rooms').listIndexes(options).toArray();
    const hasUnique = (indexes, keys, partial) => indexes.some(index => {
      if (!index.unique || index.sparse || index.collation ||
          Object.keys(index.key).length !== keys.length || !keys.every(key => index.key[key] === 1)) return false;
      // Keys alone do not prove that legitimate values participate in uniqueness.
      const actual = index.partialFilterExpression;
      if (!partial) return !actual;
      const [field, type] = partial;
      return actual && Object.keys(actual).length === 1 && actual[field] &&
        Object.keys(actual[field]).length === 1 && actual[field].$type === type;
    });
    return hasUnique(players, ['room', 'admissionTokenHash'], ['admissionTokenHash', 'string']) &&
      hasUnique(players, ['room', 'cardNumber'], ['cardNumber', 'number']) && hasUnique(rooms, ['code']);
  } catch { return false; }
}

module.exports = { isDatabaseReady };
