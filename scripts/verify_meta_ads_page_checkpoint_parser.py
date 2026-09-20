#!/usr/bin/env python3
"""Optional development check using pglast 7.x (PostgreSQL 17); no DB calls.

Not a dependency of the standalone Mac runner. Parsing does not resolve catalog
objects, privileges, variable/column ambiguity, or prove runtime semantics.
"""
import json
from pathlib import Path

from pglast import parser


def verify(sql):
    parser.parse_sql_json(sql)
    blocks = json.loads(parser.parse_plpgsql_json(sql))
    assert len(blocks) == 4  # Object/dependency guard plus three RPC functions.
    expressions = 0

    def walk(value):
        nonlocal expressions
        if isinstance(value, dict):
            if "PLpgSQL_expr" in value:
                expr = value["PLpgSQL_expr"]
                query, mode = expr["query"], expr["parseMode"]
                if mode == 2:
                    query = "SELECT " + query
                elif mode == 3:
                    assert ":=" in query
                    query = "SELECT " + query.split(":=", 1)[1]
                else:
                    assert mode == 0, f"UNSUPPORTED_PARSE_MODE:{mode}"
                parser.parse_sql_json(query)
                expressions += 1
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(blocks)
    return expressions


def main():
    version = parser.get_postgresql_version()
    assert version[0] == 17, f"POSTGRES_PARSER_VERSION:{version}"
    sql = (Path(__file__).parent / "sql/create-meta-ads-page-checkpoint-contract.sql").read_text()
    expressions = verify(sql)
    rejected = 0
    for start in (
        "value<(CASE WHEN k='maxRetries'",
        "value>(CASE k WHEN 'pageSize'",
        "jsonb_array_length(cur->k)<>(CASE WHEN k='seenRows'",
    ):
        assert sql.count(start) == 1
        offset = sql.index(start)
        end = sql.index("END)", offset) + len("END)")
        original = sql[offset:end]
        mutation = original.replace("(CASE", "CASE", 1)[:-1]
        try:
            verify(sql.replace(original, mutation, 1))
        except parser.ParseError:
            rejected += 1
        else:
            raise AssertionError(f"INVALID_CASE_ACCEPTED:{start}")
    print(json.dumps({"parser": "PASS", "postgresql_parser_version": version,
                      "functions": 3, "guard_blocks": 1,
                      "embedded_expressions": expressions, "mutation_rejections": rejected,
                      "db_executions": 0, "runtime_semantics": "NOT_TESTED"}))


if __name__ == "__main__":
    main()
