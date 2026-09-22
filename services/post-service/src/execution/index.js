// Execução, evidências antes/depois e acompanhamento (T17): domínio puro
// (vocabulário e validação). As rotas estão em src/routes/execution.js; o
// acesso ao banco, em src/execution/store.js; o schema é a migração
// post-service/014-execution.sql.

module.exports = {
  ...require('./constants'),
  ...require('./validation'),
};
