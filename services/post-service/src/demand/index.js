// Domínio da demanda (T06): regras puras, sem banco nem HTTP. A API REST
// (T07) usa este módulo; o schema é a migração post-service/007-demands.sql.

module.exports = {
  ...require('./constants'),
  ...require('./finance'),
  ...require('./validation'),
  ...require('./state-machine'),
  ...require('./gate'),
};
