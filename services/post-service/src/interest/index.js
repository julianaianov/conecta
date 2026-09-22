// Interesse, participação, conexão e compatibilidade (T15): domínio puro e
// clientes. As rotas estão em src/routes/interests.js; o schema é a migração
// post-service/012-demand-interests.sql.

module.exports = {
  ...require('./constants'),
  ...require('./validation'),
  ...require('./compatibility'),
};
