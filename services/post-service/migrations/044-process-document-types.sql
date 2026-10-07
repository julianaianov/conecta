-- Migração 044: tipos de documento do Processo de Conexão alinhados aos
-- módulos da demanda (Modelo de Conexão §17, §23 a §25 e §29).
--
-- A 029 criou `connection_process_document_type` só com os exemplos do §17 e
-- os documentos do §20. Os documentos possíveis dos casos de aplicação (§23
-- Obra, §24 Restinga, §25 Projeto Social) existiam apenas como documentos da
-- demanda (migração 032), que só mudam em rascunho ou devolvida; o que vem
-- depois da conexão (documentação institucional, documento do imóvel,
-- projeto arquitetônico, ART/RRT, plano de recuperação, plano de
-- monitoramento, relatório ambiental, plano de trabalho, plano de ação,
-- metodologia, equipe e público-alvo) não tinha tipo. Plano de execução e
-- contrato já existem desde a 029.
--
-- Espelhos: src/process/documents.js (DOCUMENT_TYPES e rótulos), portal
-- src/lib/app/process-documents.ts; test/process-documents-routes.test.js e
-- src/lib/app/process-documents.test.mjs conferem.
--
-- Idempotente (ADD VALUE IF NOT EXISTS). O valor novo não é usado nesta
-- transação: o código só o grava depois do deploy.

ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'documentacao_institucional';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'documento_do_imovel';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'projeto_arquitetonico';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'art_rrt';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'plano_de_recuperacao';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'plano_de_monitoramento';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'relatorio_ambiental';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'plano_de_trabalho';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'plano_de_acao';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'metodologia';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'equipe';
ALTER TYPE connection_process_document_type ADD VALUE IF NOT EXISTS 'publico_alvo';
