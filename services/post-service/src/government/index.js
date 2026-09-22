// Área de governo e gestão pública (T22): domínio puro (vocabulário dos 10
// indicadores, período, priorização de áreas, exportação e validação da
// divulgação de ações). O acesso ao banco fica em ./store.js, o cache curto em
// ./cache.js e o relatório em PDF em ./pdf.js; o schema é a migração
// post-service/019-government-indicators.sql.

module.exports = {
  ...require('./constants'),
  ...require('./indicators'),
  ...require('./actions'),
  ...require('./cache'),
};
