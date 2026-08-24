# zycron Backend Python

Backend FastAPI criado para migracao incremental do NestJS legado em `apps/backend`.

Esta primeira fatia preserva o banco atual em MongoDB e os contratos de autenticacao:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /health`
- `GET /ready`
- `GET /api/health`

## Execucao local

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:create_app --factory --reload --port 8000
```

Use o MongoDB ja definido no `.env` da raiz:

```env
MONGODB_URI=mongodb+srv://app_production:senha-forte@cluster.mongodb.net/tecnoplus?retryWrites=true&w=majority
MONGODB_DATABASE=tecnoplus
JWT_SECRET=...
JWT_REFRESH_SECRET=...
```

## Testes e qualidade

```bash
pytest
ruff check .
mypy app
```

## Observacao arquitetural

O pedido original recomenda SQLAlchemy/Alembic, mas o sistema atual usa MongoDB
com colecoes Mongoose em producao. Para nao quebrar dados, IDs, indices e
contratos, esta fase usa Motor/PyMongo. Qualquer migracao para banco relacional
deve ser uma fase propria, com plano de dados, backfill, validacao e rollback.
