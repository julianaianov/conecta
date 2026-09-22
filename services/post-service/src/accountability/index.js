// Prestação de contas e prestação de resultados (T18): domínio puro
// (vocabulário, exigências e validação). As rotas estão em
// src/routes/accountability.js; o acesso ao banco, em
// src/accountability/store.js; o schema é a migração
// post-service/015-accountability.sql.

module.exports = {
  ...require('./constants'),
  ...require('./validation'),
};
