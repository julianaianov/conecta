// Processo de Conexão (T-05-01): domínio puro (vocabulário, máquina de estados
// e validação). O acesso ao banco fica em ./store.js; o schema é a migração
// post-service/026-connection-processes.sql.

module.exports = {
  ...require('./constants'),
  ...require('./state-machine'),
  ...require('./validation'),
  // Comunicação do processo (T-05-02, migração 027).
  ...require('./communication'),
};
