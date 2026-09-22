// Apoio à demanda (T16): domínio puro (vocabulário e validação). As rotas
// estão em src/routes/supports.js; o acesso ao banco, em src/support/store.js;
// o schema é a migração post-service/013-support-modalities.sql.

module.exports = {
  ...require('./constants'),
  ...require('./validation'),
};
