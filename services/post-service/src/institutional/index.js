// Atuação institucional do Poder Público (T13): domínio puro (vocabulário,
// máquina de estados, validação e gate). O acesso ao banco fica em ./store.js;
// o schema é a migração post-service/010-institutional-tracks.sql. Encaminhamentos
// (T14): ./forwardings.js, migração 011-forwardings.sql.

module.exports = {
  ...require('./constants'),
  ...require('./state-machine'),
  ...require('./validation'),
  ...require('./gate'),
  ...require('./forwardings'),
  ...require('./competence'),
};
