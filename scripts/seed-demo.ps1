# Insere dados demo do Recreio nos bancos (sem apagar dados existentes).
# Uso: .\scripts\seed-demo.ps1

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "Seeding auth_db..." -ForegroundColor Cyan
Get-Content "$root\services\auth-service\seed.sql" | docker exec -i conecta-auth-db-1 psql -U postgres -d auth_db

Write-Host "Seeding user_db..." -ForegroundColor Cyan
Get-Content "$root\services\user-service\seed.sql" | docker exec -i conecta-user-db-1 psql -U postgres -d user_db

Write-Host "Seeding post_db..." -ForegroundColor Cyan
Get-Content "$root\services\post-service\seed.sql" | docker exec -i conecta-post-db-1 psql -U postgres -d post_db

Write-Host "Demo data seeded! Login: maria@recreio.conecta / demo123" -ForegroundColor Green
