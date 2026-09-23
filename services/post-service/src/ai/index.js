// Domínio da inteligência artificial (T23). Fonte: Apresentação
// Institucional, slide 23; decisão 6 de decisoes-de-implementacao.md.
// As rotas ficam em src/routes/ai.js.

module.exports = {
  ...require('./constants'),
  ...require('./config'),
  ...require('./budget'),
  ...require('./model'),
  ...require('./prompts'),
  ...require('./redaction'),
  ...require('./service'),
  store: require('./store'),
};
