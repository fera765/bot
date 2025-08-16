#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import pickle
import sys
from typing import Any, Dict, Iterable, List, Optional, Tuple

# pandas é opcional, mas melhora muito a análise de DataFrames
try:
    import pandas as pd  # type: ignore
except Exception:
    pd = None  # type: ignore


def human_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024.0:
            return f"{size:,.2f} {unit}".replace(",", "_").replace("_", ".")
        size /= 1024.0
    return f"{size:,.2f} PB".replace(",", "_").replace("_", ".")


def print_section(title: str) -> None:
    print(f"\n== {title} ==")


def safe_repr(value: Any, max_len: int = 200) -> str:
    try:
        s = repr(value)
    except Exception:
        s = f"<{type(value).__name__}>"
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def normalize_name(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def find_time_columns(df: "pd.DataFrame") -> List[str]:  # type: ignore[name-defined]
    candidates = set([
        "time",
        "timestamp",
        "open_time",
        "close_time",
        "datetime",
        "date",
        "dt",
        "ts",
    ])
    time_cols: List[str] = []
    for col in df.columns:
        col_norm = normalize_name(str(col))
        if col_norm in candidates:
            time_cols.append(col)
    # incluir colunas com dtype datetime
    try:
        for col in df.columns:
            dtype = df[col].dtype
            if str(dtype).startswith("datetime64"):
                if col not in time_cols:
                    time_cols.append(col)
    except Exception:
        pass
    return time_cols


def detect_ohlc_columns(df: "pd.DataFrame") -> List[str]:  # type: ignore[name-defined]
    known = ["open", "high", "low", "close", "volume", "vwap"]
    present: List[str] = []
    names = {normalize_name(str(c)): str(c) for c in df.columns}
    for key in known:
        if key in names:
            present.append(names[key])
    return present


def summarize_dataframe(df: "pd.DataFrame", max_rows: int = 5) -> None:  # type: ignore[name-defined]
    print_section("Resumo do DataFrame")
    try:
        shape = df.shape
        print(f"Shape (linhas, colunas): {shape}")
    except Exception:
        pass

    # Colunas
    try:
        cols = list(df.columns)
        if len(cols) <= 40:
            print(f"Colunas ({len(cols)}): {cols}")
        else:
            head_cols = cols[:20]
            tail_cols = cols[-20:]
            print(f"Colunas ({len(cols)}): {head_cols} ... {tail_cols}")
    except Exception:
        pass

    # Dtypes
    try:
        dtype_counts = df.dtypes.value_counts()
        print("Tipos de dados (contagem):")
        for dtype, count in dtype_counts.items():
            print(f"  - {dtype}: {count}")
    except Exception:
        pass

    # Index
    try:
        print(f"Index: {type(df.index).__name__}")
        if str(getattr(df.index, "dtype", "")).startswith("datetime64"):
            print(f"  - Período no índice: {df.index.min()} -> {df.index.max()}")
    except Exception:
        pass

    # Colunas de tempo
    try:
        tcols = find_time_columns(df)
        if tcols:
            print("Colunas de tempo detectadas e seus intervalos:")
            for c in tcols:
                series = df[c]
                # tentar converter se necessário
                if not str(series.dtype).startswith("datetime64"):
                    try:
                        series = pd.to_datetime(series, errors="coerce")  # type: ignore[attr-defined]
                    except Exception:
                        series = None  # type: ignore[assignment]
                if series is not None:
                    try:
                        vmin = series.min()
                        vmax = series.max()
                        print(f"  - {c}: {vmin} -> {vmax}")
                    except Exception:
                        pass
        else:
            print("Nenhuma coluna de tempo óbvia detectada.")
    except Exception:
        pass

    # Colunas OHLC
    try:
        ohlc = detect_ohlc_columns(df)
        if ohlc:
            print(f"Colunas OHLC/relacionadas encontradas: {ohlc}")
    except Exception:
        pass

    # Memória
    try:
        mem = df.memory_usage(deep=True).sum()
        print(f"Uso de memória aproximado: {human_bytes(int(mem))}")
    except Exception:
        pass

    # Missing values
    try:
        na_counts = df.isna().sum()
        total_na = int(na_counts.sum())
        if total_na > 0:
            print(f"Valores ausentes (total): {total_na}")
            top_na = na_counts.sort_values(ascending=False)
            print("Top colunas com ausentes:")
            shown = 0
            for col, val in top_na.items():
                if val > 0:
                    print(f"  - {col}: {int(val)}")
                    shown += 1
                    if shown >= 10:
                        break
        else:
            print("Sem valores ausentes.")
    except Exception:
        pass

    # Coluna símbolo/ativo
    try:
        for sym_col in ["symbol", "ticker", "asset"]:
            if sym_col in df.columns:
                nunique = df[sym_col].nunique(dropna=True)
                print(f"Coluna '{sym_col}' detectada: {nunique} valores únicos")
                if nunique <= 10:
                    uniques = df[sym_col].dropna().unique().tolist()
                    print(f"  Valores: {uniques}")
                break
    except Exception:
        pass

    # Amostra
    try:
        with pd.option_context(  # type: ignore[attr-defined]
            "display.max_rows",
            max_rows,
            "display.max_columns",
            20,
            "display.width",
            120,
        ):
            print_section(f"Amostra (head {max_rows})")
            print(df.head(max_rows))
    except Exception:
        pass


def summarize_mapping(d: Dict[Any, Any], max_items: int = 5, max_rows: int = 5) -> None:
    print_section("Resumo do dicionário")
    keys = list(d.keys())
    print(f"Total de chaves: {len(keys)}")
    show_keys = keys[:max_items]
    print(f"Chaves (primeiras {len(show_keys)}): {show_keys}")

    for k in show_keys:
        v = d[k]
        vtype = type(v).__name__
        print_section(f"Chave: {safe_repr(k)} (tipo: {vtype})")
        if pd is not None and hasattr(v, "__class__") and v.__class__.__name__ == "DataFrame":
            summarize_dataframe(v, max_rows=max_rows)  # type: ignore[arg-type]
        elif isinstance(v, dict):
            print(f"Sub-dict com {len(v)} chaves")
        elif isinstance(v, (list, tuple)):
            print(f"Sequência com {len(v)} itens. Tipo do primeiro: {type(v[0]).__name__ if len(v) else 'vazio'}")
        else:
            print(f"Valor: {safe_repr(v, 300)}")


def summarize_sequence(seq: Iterable[Any], max_items: int = 3, max_rows: int = 5) -> None:
    seq = list(seq)
    print_section("Resumo da sequência (list/tuple)")
    print(f"Tamanho: {len(seq)}")
    if not seq:
        return
    first = seq[0]
    print(f"Tipo do primeiro item: {type(first).__name__}")
    if pd is not None and hasattr(first, "__class__") and first.__class__.__name__ == "DataFrame":
        summarize_dataframe(first, max_rows=max_rows)  # type: ignore[arg-type]
        return
    if isinstance(first, dict):
        keys = list(first.keys())
        print(f"Chaves do primeiro item: {keys}")
    # mostrar amostra dos primeiros itens (resumo)
    print("Primeiros itens (resumo):")
    for i, item in enumerate(seq[:max_items]):
        print(f"  [{i}] {safe_repr(item, 300)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Lê um arquivo .pkl de candles e resume seu conteúdo.")
    default_path = "/workspace/candles_data.pkl" if os.path.exists("/workspace/candles_data.pkl") else "candles_data.pkl"
    parser.add_argument("--path", "-p", default=default_path, help="Caminho do arquivo candles_data.pkl")
    parser.add_argument("--max-rows", type=int, default=5, help="Máximo de linhas para amostra exibida")
    args = parser.parse_args()

    path = args.path
    if not os.path.exists(path):
        print(f"Arquivo não encontrado: {path}")
        return 2

    print_section("Arquivo")
    try:
        size = os.path.getsize(path)
        print(f"Caminho: {os.path.abspath(path)}")
        print(f"Tamanho: {human_bytes(size)}")
    except Exception:
        print(f"Caminho: {os.path.abspath(path)}")

    # Carregar pickle
    obj: Any
    try:
        with open(path, "rb") as f:
            obj = pickle.load(f)
    except ModuleNotFoundError as e:
        missing = getattr(e, "name", None) or str(e)
        print("Falha ao carregar o pickle por módulo ausente.")
        print(f"Módulo ausente: {missing}")
        print("Dica: se o arquivo contém um pandas.DataFrame, instale com: pip install pandas")
        return 3
    except Exception as e:
        print(f"Erro ao carregar pickle: {e.__class__.__name__}: {e}")
        return 1

    # Tipo do objeto raiz
    print_section("Objeto raiz")
    print(f"Tipo: {type(obj).__name__}")

    # Despachar por tipo
    try:
        if pd is not None and hasattr(obj, "__class__") and obj.__class__.__name__ == "DataFrame":
            summarize_dataframe(obj, max_rows=args.max_rows)  # type: ignore[arg-type]
        elif isinstance(obj, dict):
            summarize_mapping(obj, max_items=5, max_rows=args.max_rows)
        elif isinstance(obj, (list, tuple)):
            summarize_sequence(obj, max_items=3, max_rows=args.max_rows)
        else:
            # fallback genérico
            print("Resumo genérico do objeto:")
            for attr in ["keys", "__len__", "shape", "columns"]:
                try:
                    val = getattr(obj, attr)
                    if callable(val):
                        val = val()
                    print(f"  - {attr}: {safe_repr(val)}")
                except Exception:
                    pass
            # tentativa de imprimir uma pequena amostra se indexável
            try:
                if hasattr(obj, "__getitem__") and hasattr(obj, "__len__") and len(obj) > 0:  # type: ignore[arg-type]
                    print("Amostra dos primeiros itens:")
                    for i in range(min(3, len(obj))):
                        try:
                            print(f"  [{i}] {safe_repr(obj[i], 300)}")  # type: ignore[index]
                        except Exception:
                            break
            except Exception:
                pass
    except Exception as e:
        print(f"Erro durante a sumarização: {e.__class__.__name__}: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())