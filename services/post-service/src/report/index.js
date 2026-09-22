// Denúncia de conteúdo e de perfil (T6.3): domínio puro (vocabulário e
// validação). As rotas estão em src/routes/reports.js; o acesso ao banco, em
// src/report/store.js; o schema é a migração post-service/018-content-reports.sql.

module.exports = {
  ...require('./constants'),
  ...require('./validation'),
};
