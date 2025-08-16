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

import datetime as dt
import time
from collections import defaultdict, Counter
from dataclasses import dataclass
from itertools import product

# Configurações padrão da estratégia
DIAS_PARA_BACKTEST_DEFAULT = 20
DIAS_PREDOMINANCIA_DEFAULT = 4
PCT_PREDOMINANCIA_DEFAULT = 0.80
HORAS_FUTURAS_PARA_PREVER_DEFAULT = 24
INTERVALO_PREDICAO_MINUTOS_DEFAULT = 5  # dataset de 5m
PIVOT_WINDOW_DEFAULT = 2
DISTANCIA_AGRUPAMENTO_PERCENTUAL_DEFAULT = 0.001  # 0.1%
TOLERANCIA_ZONA_PERCENTUAL_DEFAULT = 0.001  # 0.1%
CONFLUENCIA_STEPS_DEFAULT = 2  # usar 2 por padrão para maior cobertura
HORAS_HISTORICAS_PARA_ANALISAR_DEFAULT = 24
TOP_K_PARES_DEFAULT = 5
MIN_ACC_HIST_DEFAULT = 0.60
MIN_SINAIS_HIST_DEFAULT = 3
VOL_TOL_K_DEFAULT = 0.50
MIN_ZONE_STRENGTH_COUNT_DEFAULT = 2
MIN_PRED_OCCURRENCES_DEFAULT = 3
ZONE_MIN_PCT_DEFAULT = 0.002  # 0.2%
ZONE_MAX_PCT_DEFAULT = 0.005  # 0.5%


@dataclass
class Settings:
    dias_para_backtest: int = DIAS_PARA_BACKTEST_DEFAULT
    dias_predominancia: int = DIAS_PREDOMINANCIA_DEFAULT
    pct_predominancia: float = PCT_PREDOMINANCIA_DEFAULT
    horas_futuras_para_prever: int = HORAS_FUTURAS_PARA_PREVER_DEFAULT
    intervalo_predicao_minutos: int = INTERVALO_PREDICAO_MINUTOS_DEFAULT
    pivot_window: int = PIVOT_WINDOW_DEFAULT
    distancia_agrupamento_percentual: float = DISTANCIA_AGRUPAMENTO_PERCENTUAL_DEFAULT
    tolerancia_zona_percentual: float = TOLERANCIA_ZONA_PERCENTUAL_DEFAULT
    confluencia_steps: int = CONFLUENCIA_STEPS_DEFAULT
    horas_historicas_para_analisar: int = HORAS_HISTORICAS_PARA_ANALISAR_DEFAULT
    top_k_pares: int = TOP_K_PARES_DEFAULT
    min_acc_hist: float = MIN_ACC_HIST_DEFAULT
    min_sinais_hist: int = MIN_SINAIS_HIST_DEFAULT
    vol_tol_k: float = VOL_TOL_K_DEFAULT
    min_zone_strength_count: int = MIN_ZONE_STRENGTH_COUNT_DEFAULT
    min_pred_occurrences: int = MIN_PRED_OCCURRENCES_DEFAULT
    zone_min_pct: float = ZONE_MIN_PCT_DEFAULT
    zone_max_pct: float = ZONE_MAX_PCT_DEFAULT


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


def to_utc_datetime(epoch_seconds: int) -> dt.datetime:
    return dt.datetime.fromtimestamp(epoch_seconds, dt.timezone.utc)


def load_candles_dict(path: str) -> Dict[str, List[Dict[str, Any]]]:
    with open(path, "rb") as f:
        data = pickle.load(f)
    if not isinstance(data, dict):
        raise ValueError("candles_data.pkl deve conter um dict {symbol: list[candle_dict]}.")
    return data


def symbol_to_df(candles: List[Dict[str, Any]]):
    # evita dependência obrigatória de pandas: usamos se disponível
    if pd is None:
        # estrutura simples baseada em listas mantendo índices paralelos
        times = [to_utc_datetime(c["from"]) for c in candles]
        opens = [c["open"] for c in candles]
        highs = [c.get("max", c.get("high", c["open"])) for c in candles]
        lows = [c.get("min", c.get("low", c["open"])) for c in candles]
        closes = [c["close"] for c in candles]
        price_by_time = {t: (o, c) for t, o, c in zip(times, opens, closes)}
        return {
            "time": times,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "_price_by_time": price_by_time,
        }
    # via pandas
    records = []
    for c in candles:
        records.append(
            {
                "time": to_utc_datetime(c["from"]),
                "open": c["open"],
                "high": c.get("max", c.get("high", c["open"])) ,
                "low": c.get("min", c.get("low", c["open"])) ,
                "close": c["close"],
            }
        )
    df = pd.DataFrame.from_records(records)  # type: ignore[attr-defined]
    df = df.sort_values("time").reset_index(drop=True)  # type: ignore[assignment]
    df = df.set_index("time")  # type: ignore[assignment]
    return df


def get_unique_days(df_or_dict) -> List[dt.date]:
    if pd is None or not hasattr(df_or_dict, "index"):
        times = df_or_dict["time"]
        return sorted(list({t.date() for t in times}))
    idx = df_or_dict.index
    return sorted(list({t.date() for t in idx}))


def slice_day(df_or_dict, day: dt.date):
    start = dt.datetime.combine(day, dt.time(0, 0, tzinfo=dt.timezone.utc))
    end = start + dt.timedelta(days=1)
    if pd is None or not hasattr(df_or_dict, "loc"):
        times = df_or_dict["time"]
        mask = [(t >= start and t < end) for t in times]
        out: Dict[str, Any] = {}
        for k, v in df_or_dict.items():
            if k == "_price_by_time":
                price_map = df_or_dict["_price_by_time"]
                out[k] = {times[i]: price_map[times[i]] for i, m in enumerate(mask) if m and times[i] in price_map}
            else:
                out[k] = [v[i] for i, m in enumerate(mask) if m]
        return out
    return df_or_dict.loc[(df_or_dict.index >= start) & (df_or_dict.index < end)]


def slice_days_back(df_or_dict, until_day: dt.date, num_days: int):
    end = dt.datetime.combine(until_day + dt.timedelta(days=1), dt.time(0, 0, tzinfo=dt.timezone.utc))
    start = end - dt.timedelta(days=num_days)
    if pd is None or not hasattr(df_or_dict, "loc"):
        times = df_or_dict["time"]
        mask = [(t >= start and t < end) for t in times]
        out: Dict[str, Any] = {}
        for k, v in df_or_dict.items():
            if k == "_price_by_time":
                price_map = df_or_dict["_price_by_time"]
                out[k] = {times[i]: price_map[times[i]] for i, m in enumerate(mask) if m and times[i] in price_map}
            else:
                out[k] = [v[i] for i, m in enumerate(mask) if m]
        return out
    return df_or_dict.loc[(df_or_dict.index >= start) & (df_or_dict.index < end)]


def iter_times_in_day(day: dt.date, step_minutes: int) -> List[dt.datetime]:
    start = dt.datetime.combine(day, dt.time(0, 0, tzinfo=dt.timezone.utc))
    times = []
    for i in range(0, 24 * 60, step_minutes):
        times.append(start + dt.timedelta(minutes=i))
    return times


def iter_times_in_window(end_time: dt.datetime, hours: int, step_minutes: int) -> List[dt.datetime]:
    start = end_time - dt.timedelta(hours=hours)
    times = []
    t = dt.datetime(start.year, start.month, start.day, start.hour, (start.minute // step_minutes) * step_minutes, tzinfo=start.tzinfo)
    while t <= end_time:
        times.append(t)
        t += dt.timedelta(minutes=step_minutes)
    return times


def detect_pivots(df_or_dict, pivot_window: int) -> Tuple[List[float], List[float]]:
    highs: List[float]
    lows: List[float]
    if pd is None or not hasattr(df_or_dict, "iloc"):
        highs = df_or_dict["high"]
        lows = df_or_dict["low"]
    else:
        highs = df_or_dict["high"].tolist()
        lows = df_or_dict["low"].tolist()
    n = len(highs)
    res_levels: List[float] = []
    sup_levels: List[float] = []
    w = pivot_window
    for i in range(w, n - w):
        high = highs[i]
        low = lows[i]
        left_highs = highs[i - w : i]
        right_highs = highs[i + 1 : i + 1 + w]
        left_lows = lows[i - w : i]
        right_lows = lows[i + 1 : i + 1 + w]
        if high > max(left_highs) and high > max(right_highs):
            res_levels.append(high)
        if low < min(left_lows) and low < min(right_lows):
            sup_levels.append(low)
    return res_levels, sup_levels


def cluster_levels(levels: List[float], max_pct_dist: float) -> List[float]:
    if not levels:
        return []
    levels_sorted = sorted(levels)
    clusters: List[List[float]] = []
    current: List[float] = [levels_sorted[0]]
    for price in levels_sorted[1:]:
        mean_price = sum(current) / len(current)
        if abs(price - mean_price) / mean_price <= max_pct_dist:
            current.append(price)
        else:
            clusters.append(current)
            current = [price]
    clusters.append(current)
    # usar média como nível representativo
    return [sum(c) / len(c) for c in clusters]


def nearest_zone_type(prev_close: float, supports: List[float], resistances: List[float], tol_pct: float) -> Optional[str]:
    # considerar proximidade absoluta sem exigir lado (<= or >=)
    near_support_dists = [abs(prev_close - s) / s for s in supports if s != 0 and abs(prev_close - s) / s <= tol_pct]
    near_resist_dists = [abs(prev_close - r) / r for r in resistances if r != 0 and abs(prev_close - r) / r <= tol_pct]
    has_support = len(near_support_dists) > 0
    has_resist = len(near_resist_dists) > 0
    if has_support and not has_resist:
        return "support"
    if has_resist and not has_support:
        return "resistance"
    if has_support and has_resist:
        ds = min(near_support_dists)
        dr = min(near_resist_dists)
        return "support" if ds <= dr else "resistance"
    return None


def zone_type_by_band(prev_close: float, supports: List[float], resistances: List[float], min_pct: float, max_pct: float) -> Optional[str]:
    # Seleciona apenas zonas cuja distância percentual esteja entre [min_pct, max_pct]
    s_dists = [(abs(prev_close - s) / prev_close, s) for s in supports if prev_close != 0]
    r_dists = [(abs(prev_close - r) / prev_close, r) for r in resistances if prev_close != 0]
    s_in = [d for d in s_dists if d[0] >= min_pct and d[0] <= max_pct]
    r_in = [d for d in r_dists if d[0] >= min_pct and d[0] <= max_pct]
    if not s_in and not r_in:
        return None
    if s_in and not r_in:
        return "support"
    if r_in and not s_in:
        return "resistance"
    # ambos presentes: escolher a mais próxima
    best_s = min(s_in, key=lambda x: x[0])
    best_r = min(r_in, key=lambda x: x[0])
    return "support" if best_s[0] <= best_r[0] else "resistance"


def build_time_color_map(df_or_dict, days: List[dt.date]) -> Dict[str, str]:
    # retorna {"HH:MM": "CALL"|"PUT"} quando predominante >= pct, caso contrário não inclui a chave
    if not days:
        return {}
    # coletar candles desses dias
    if pd is None or not hasattr(df_or_dict, "index"):
        time_list = df_or_dict["time"]
        open_list = df_or_dict["open"]
        close_list = df_or_dict["close"]
        items = [(t, o, c) for t, o, c in zip(time_list, open_list, close_list) if t.date() in set(days)]
    else:
        sub = df_or_dict.loc[df_or_dict.index.map(lambda t: t.date() in set(days))]
        items = list(zip(sub.index.tolist(), sub["open"].tolist(), sub["close"].tolist()))
    by_hhmm: Dict[str, List[int]] = defaultdict(list)
    for t, o, c in items:
        if o == c:
            continue
        hhmm = t.strftime("%H:%M")
        color = 1 if c > o else -1
        by_hhmm[hhmm].append(color)
    result: Dict[str, str] = {}
    for hhmm, arr in by_hhmm.items():
        if not arr:
            continue
        # exigir ocorrências mínimas para evitar ruído
        if len(arr) < current_settings.min_pred_occurrences:
            continue
        pos = sum(1 for v in arr if v == 1)
        neg = sum(1 for v in arr if v == -1)
        total = pos + neg
        if total == 0:
            continue
        frac = max(pos, neg) / total
        if frac >= current_settings.pct_predominancia:
            result[hhmm] = "CALL" if pos >= neg else "PUT"
    return result


def temporal_confluence(direction_map: Dict[str, str], base_time: dt.datetime, steps: int, step_minutes: int) -> Optional[str]:
    dirs: List[str] = []
    for k in range(steps):
        t = base_time + dt.timedelta(minutes=step_minutes * k)
        hhmm = t.strftime("%H:%M")
        d = direction_map.get(hhmm)
        if d is None:
            return None
        dirs.append(d)
    # todas precisam concordar
    if all(d == "CALL" for d in dirs):
        return "CALL"
    if all(d == "PUT" for d in dirs):
        return "PUT"
    return None


def get_price_at(df_or_dict, t: dt.datetime) -> Optional[Tuple[float, float]]:
    if pd is None or not hasattr(df_or_dict, "loc"):
        price_map = df_or_dict.get("_price_by_time")
        if price_map is not None:
            return price_map.get(t)
        times = df_or_dict["time"]
        opens = df_or_dict["open"]
        closes = df_or_dict["close"]
        for i, tt in enumerate(times):
            if tt == t:
                return opens[i], closes[i]
        return None
    try:
        row = df_or_dict.loc[t]
        # pode retornar Series se índice único
        o = float(row["open"])  # type: ignore[index]
        c = float(row["close"])  # type: ignore[index]
        return o, c
    except KeyError:
        return None


def check_win(df_or_dict, t: dt.datetime, direction: str, step_minutes: int = 5) -> str:
    # G0 em t, se perder, G1 em t + step
    oc0 = get_price_at(df_or_dict, t)
    if oc0 is None:
        return "no_data"
    o0, c0 = oc0
    if direction == "CALL":
        if c0 > o0:
            return "win_g0"
    else:  # PUT
        if c0 < o0:
            return "win_g0"
    # G1
    t1 = t + dt.timedelta(minutes=step_minutes)
    oc1 = get_price_at(df_or_dict, t1)
    if oc1 is None:
        return "loss"
    o1, c1 = oc1
    if direction == "CALL":
        return "win_g1" if c1 > o1 else "loss"
    else:
        return "win_g1" if c1 < o1 else "loss"


def get_times_in_day(symbol_df, day: dt.date) -> List[dt.datetime]:
    if pd is None or not hasattr(symbol_df, "index"):
        return [t for t in symbol_df["time"] if t.date() == day]
    start = dt.datetime.combine(day, dt.time(0, 0, tzinfo=dt.timezone.utc))
    end = start + dt.timedelta(days=1)
    sub = symbol_df.loc[(symbol_df.index >= start) & (symbol_df.index < end)]
    return list(sub.index.tolist())


def get_times_between(symbol_df, start: dt.datetime, end: dt.datetime) -> List[dt.datetime]:
    if pd is None or not hasattr(symbol_df, "index"):
        return [t for t in symbol_df["time"] if t >= start and t <= end]
    sub = symbol_df.loc[(symbol_df.index >= start) & (symbol_df.index <= end)]
    return list(sub.index.tolist())


def find_prev_time_in_list(times: List[dt.datetime], t: dt.datetime) -> Optional[dt.datetime]:
    if not times:
        return None
    # assumir times ordenado
    # buscar índice de t e retornar anterior
    try:
        idx = times.index(t)
        if idx > 0:
            return times[idx - 1]
        return None
    except ValueError:
        # se t não estiver na lista, retorna o maior < t
        before = [tt for tt in times if tt < t]
        if not before:
            return None
        return before[-1]


def generate_signals_for_day(symbol_df, day: dt.date, settings: Settings, sr_supports: List[float], sr_resistances: List[float], direction_map: Dict[str, str]) -> List[Dict[str, Any]]:
    day_times = sorted(get_times_in_day(symbol_df, day))
    signals: List[Dict[str, Any]] = []
    for t in day_times:
        # usar o fechamento da vela anterior REAL disponível
        prev_t = find_prev_time_in_list(day_times, t)
        prev_oc = get_price_at(symbol_df, prev_t)
        if prev_oc is None:
            continue
        prev_close = prev_oc[1]
        zone_type = zone_type_by_band(prev_close, sr_supports, sr_resistances, settings.zone_min_pct, settings.zone_max_pct)
        if zone_type is None:
            continue
        conf = temporal_confluence(direction_map, t, settings.confluencia_steps, settings.intervalo_predicao_minutos)
        if conf is None:
            continue
        if conf == "CALL" and zone_type == "support":
            signals.append({"time": t, "direction": "CALL"})
        elif conf == "PUT" and zone_type == "resistance":
            signals.append({"time": t, "direction": "PUT"})
    return signals


def get_sr_cached(sym: str, symbol_df, ref_day: dt.date, settings: Settings) -> Tuple[List[float], List[float]]:
    key = (sym, ref_day.isoformat(), settings.pivot_window, settings.distancia_agrupamento_percentual, settings.dias_para_backtest)
    if key in _sr_cache:
        return _sr_cache[key]
    hist = slice_days_back(symbol_df, ref_day, settings.dias_para_backtest)
    res_levels, sup_levels = detect_pivots(hist, settings.pivot_window)
    res_c = cluster_levels(res_levels, settings.distancia_agrupamento_percentual)
    sup_c = cluster_levels(sup_levels, settings.distancia_agrupamento_percentual)
    _sr_cache[key] = (sup_c, res_c)
    return sup_c, res_c


def cluster_levels_with_counts(levels: List[float], max_pct_dist: float) -> List[Tuple[float, int]]:
    if not levels:
        return []
    levels_sorted = sorted(levels)
    clusters: List[List[float]] = []
    current: List[float] = [levels_sorted[0]]
    for price in levels_sorted[1:]:
        mean_price = sum(current) / len(current)
        if abs(price - mean_price) / mean_price <= max_pct_dist:
            current.append(price)
        else:
            clusters.append(current)
            current = [price]
    clusters.append(current)
    return [(sum(c) / len(c), len(c)) for c in clusters]


def get_sr_cached_counts(sym: str, symbol_df, ref_day: dt.date, settings: Settings) -> Tuple[List[Tuple[float, int]], List[Tuple[float, int]]]:
    key = (sym, ref_day.isoformat(), settings.pivot_window, settings.distancia_agrupamento_percentual, settings.dias_para_backtest)
    if key in _sr_counts_cache:
        return _sr_counts_cache[key]
    hist = slice_days_back(symbol_df, ref_day, settings.dias_para_backtest)
    res_levels, sup_levels = detect_pivots(hist, settings.pivot_window)
    res_c = cluster_levels_with_counts(res_levels, settings.distancia_agrupamento_percentual)
    sup_c = cluster_levels_with_counts(sup_levels, settings.distancia_agrupamento_percentual)
    _sr_counts_cache[key] = (sup_c, res_c)
    return sup_c, res_c


def compute_median_range(symbol_df, ref_day: dt.date, settings: Settings) -> float:
    hist = slice_days_back(symbol_df, ref_day, settings.dias_para_backtest)
    ranges: List[float] = []
    if pd is None or not hasattr(hist, "index"):
        highs = hist["high"]
        lows = hist["low"]
        for h, l in zip(highs, lows):
            ranges.append(max(0.0, float(h) - float(l)))
    else:
        diff = (hist["high"] - hist["low"]).astype(float)  # type: ignore[index]
        ranges = diff.tolist()
    ranges = [r for r in ranges if r is not None]
    if not ranges:
        return 0.0
    ranges_sorted = sorted(ranges)
    mid = len(ranges_sorted) // 2
    if len(ranges_sorted) % 2 == 1:
        return float(ranges_sorted[mid])
    return float((ranges_sorted[mid - 1] + ranges_sorted[mid]) / 2)


def get_all_times(symbol_df) -> List[dt.datetime]:
    if pd is None or not hasattr(symbol_df, "index"):
        return list(symbol_df["time"])  # type: ignore[return-value]
    return list(symbol_df.index.tolist())


def compute_sma(values: List[float], period: int) -> Optional[float]:
    if len(values) < period or period <= 0:
        return None
    window = values[-period:]
    return sum(window) / float(period)


def slope_by_sma(symbol_df, t: dt.datetime, period: int) -> Optional[float]:
    times = get_all_times(symbol_df)
    if not times:
        return None
    # localizar posição do candle imediatamente anterior a t
    try:
        idx = times.index(t)
    except ValueError:
        times_before = [tt for tt in times if tt < t]
        if not times_before:
            return None
        idx = len(times_before)
    idx_prev = idx - 1
    idx_prev2 = idx - 2
    if idx_prev < period or idx_prev2 < period - 1:
        return None
    # coletar closes
    if pd is None or not hasattr(symbol_df, "index"):
        closes = symbol_df["close"]
    else:
        closes = symbol_df["close"].tolist()
    sma_now = compute_sma(closes[: idx_prev + 1], period)
    sma_prev = compute_sma(closes[: idx_prev2 + 1], period)
    if sma_now is None or sma_prev is None:
        return None
    return float(sma_now - sma_prev)


def nearest_zone_type_abs(prev_close: float, supports: List[float], resistances: List[float], tol_abs: float) -> Optional[str]:
    near_support = [abs(prev_close - s) for s in supports if abs(prev_close - s) <= tol_abs]
    near_resist = [abs(prev_close - r) for r in resistances if abs(prev_close - r) <= tol_abs]
    has_support = len(near_support) > 0
    has_resist = len(near_resist) > 0
    if has_support and not has_resist:
        return "support"
    if has_resist and not has_support:
        return "resistance"
    if has_support and has_resist:
        return "support" if min(near_support) <= min(near_resist) else "resistance"
    return None


def get_time_map_cached(sym: str, symbol_df, ref_day: dt.date, settings: Settings) -> Dict[str, str]:
    key = (sym, ref_day.isoformat(), settings.dias_predominancia, settings.pct_predominancia)
    if key in _time_map_cache:
        return _time_map_cache[key]
    days = []
    for i in range(settings.dias_predominancia, 0, -1):
        days.append(ref_day - dt.timedelta(days=i))
    mp = build_time_color_map(symbol_df, days)
    _time_map_cache[key] = mp
    return mp


def compute_symbol_hist_performance(sym: str, symbol_df, ref_day: dt.date, settings: Settings) -> Dict[str, Any]:
    # janela: últimas HORAS_HISTORICAS_PARA_ANALISAR horas até o final de ref_day (23:59)
    end_time = dt.datetime.combine(ref_day, dt.time(23, 55, tzinfo=dt.timezone.utc))
    start_time = end_time - dt.timedelta(hours=settings.horas_historicas_para_analisar)
    times = sorted(get_times_between(symbol_df, start_time, end_time))
    # preparar S/R até ref_day e mapa temporal até ref_day (usando dias anteriores a ref_day)
    sup_counts, res_counts = get_sr_cached_counts(sym, symbol_df, ref_day, settings)
    supports = [p for (p, c) in sup_counts if c >= settings.min_zone_strength_count]
    resistances = [p for (p, c) in res_counts if c >= settings.min_zone_strength_count]
    direction_map = get_time_map_cached(sym, symbol_df, ref_day, settings)
    wins = 0
    losses = 0
    signals_count = 0
    for t in times:
        # sinal seria gerado para t se zona + confluência passarem
        prev_t = find_prev_time_in_list(times, t)
        prev_oc = get_price_at(symbol_df, prev_t)
        if prev_oc is None:
            continue
        prev_close = prev_oc[1]
        zone_type = zone_type_by_band(prev_close, supports, resistances, settings.zone_min_pct, settings.zone_max_pct)
        if zone_type is None:
            continue
        conf = temporal_confluence(direction_map, t, settings.confluencia_steps, settings.intervalo_predicao_minutos)
        if conf is None:
            continue
        if (conf == "CALL" and zone_type != "support") or (conf == "PUT" and zone_type != "resistance"):
            continue
        # filtro direcional: cor do candle anterior e slope da SMA
        prev_open, prev_close_val = prev_oc
        slope = slope_by_sma(symbol_df, t, period=20) or 0.0
        if conf == "CALL":
            if not (prev_close_val < prev_open and slope >= 0):
                continue
        else:
            if not (prev_close_val > prev_open and slope <= 0):
                continue
        # passou critérios -> sinal
        signals_count += 1
        outcome = check_win(symbol_df, t, conf, settings.intervalo_predicao_minutos)
        if outcome in ("win_g0", "win_g1"):
            wins += 1
        elif outcome != "no_data":
            losses += 1
    evaluated = wins + losses
    acc = (wins / evaluated) if evaluated > 0 else 0.0
    return {"signals": signals_count, "evaluated": evaluated, "wins": wins, "losses": losses, "accuracy": acc}


def select_symbols_by_hist(candles_dict: Dict[str, List[Dict[str, Any]]], ref_day: dt.date, settings: Settings) -> List[str]:
    scores: List[Tuple[str, float, int]] = []  # (symbol, acc, evaluated)
    for sym, arr in candles_dict.items():
        perf = compute_symbol_hist_performance(sym, symbol_to_df(arr), ref_day, settings)
        if perf["evaluated"] >= settings.min_sinais_hist and perf["accuracy"] >= settings.min_acc_hist:
            scores.append((sym, perf["accuracy"], perf["evaluated"]))
    scores.sort(key=lambda x: (x[1], x[2]), reverse=True)
    selected = [s for s, _, _ in scores[: settings.top_k_pares]]
    return selected


def run_backtest(candles_dict: Dict[str, List[Dict[str, Any]]], settings: Settings, start_day: dt.date, num_days: int = 10) -> Dict[str, Any]:
    # validar que temos o dia start_day e o dia seguinte
    results_by_day: List[Dict[str, Any]] = []
    for offset in range(0, num_days):
        ref_day = start_day - dt.timedelta(days=offset)  # ex: 14, 13, 12, ...
        clear_caches()
        pred_day = ref_day + dt.timedelta(days=1)
        # selecionar pares por desempenho histórico anterior a ref_day
        selected_symbols = select_symbols_by_hist(candles_dict, ref_day, settings)
        if not selected_symbols:
            selected_symbols = list(candles_dict.keys())
        symbol_to_series = {sym: symbol_to_df(candles_dict[sym]) for sym in selected_symbols}
        day_results = {"ref_day": ref_day.isoformat(), "pred_day": pred_day.isoformat(), "per_symbol": {}, "totals": {}, "selected_symbols": selected_symbols}
        total_signals = 0
        total_wins = 0
        total_losses = 0
        for sym, series in symbol_to_series.items():
            # preparar S/R a partir de até ref_day (sem ver pred_day)
            sup_counts, res_counts = get_sr_cached_counts(sym, series, ref_day, settings)
            supports = [p for (p, c) in sup_counts if c >= settings.min_zone_strength_count]
            resistances = [p for (p, c) in res_counts if c >= settings.min_zone_strength_count]
            # mapa temporal baseado nos últimos N dias antes de pred_day
            direction_map = get_time_map_cached(sym, series, pred_day, settings)
            # gerar sinais para pred_day
            signals = generate_signals_for_day(series, pred_day, settings, supports, resistances, direction_map)
            # checar wins
            wins = 0
            losses = 0
            evaluated = 0
            details = []
            for sig in signals:
                outcome = check_win(series, sig["time"], sig["direction"], settings.intervalo_predicao_minutos)
                if outcome == "no_data":
                    continue
                evaluated += 1
                if outcome in ("win_g0", "win_g1"):
                    wins += 1
                else:
                    losses += 1
                details.append({"time": sig["time"].strftime("%Y-%m-%d %H:%M"), "direction": sig["direction"], "outcome": outcome})
            acc = (wins / evaluated) if evaluated > 0 else 0.0
            day_results["per_symbol"][sym] = {
                "signals": len(signals),
                "evaluated": evaluated,
                "wins": wins,
                "losses": losses,
                "accuracy": acc,
                "details_sample": details[:5],
            }
            total_signals += len(signals)
            total_wins += wins
            total_losses += losses
        day_acc = (total_wins / (total_wins + total_losses)) if (total_wins + total_losses) > 0 else 0.0
        day_results["totals"] = {
            "signals": total_signals,
            "wins": total_wins,
            "losses": total_losses,
            "accuracy": day_acc,
        }
        results_by_day.append(day_results)
    # média
    valid_days = [d for d in results_by_day if d["totals"]["signals"] > 0]
    avg_acc = sum(d["totals"]["accuracy"] for d in valid_days) / len(valid_days) if valid_days else 0.0
    return {"settings": settings.__dict__, "days": results_by_day, "avg_accuracy": avg_acc}


def evaluate_day(candles_dict: Dict[str, List[Dict[str, Any]]], settings: Settings, ref_day: dt.date) -> Dict[str, Any]:
    # selecionar pares pelo desempenho histórico (sem olhar o futuro)
    clear_caches()
    selected_symbols = select_symbols_by_hist(candles_dict, ref_day, settings)
    if not selected_symbols:
        # fallback: usar todos para evitar dia sem sinais
        selected_symbols = list(candles_dict.keys())
    symbol_to_series = {sym: symbol_to_df(candles_dict[sym]) for sym in selected_symbols}
    pred_day = ref_day + dt.timedelta(days=1)
    total_signals = 0
    total_wins = 0
    total_losses = 0
    per_symbol = {}
    for sym, series in symbol_to_series.items():
        supports, resistances = get_sr_cached(sym, series, ref_day, settings)
        direction_map = get_time_map_cached(sym, series, pred_day, settings)
        signals = generate_signals_for_day(series, pred_day, settings, supports, resistances, direction_map)
        wins = 0
        losses = 0
        evaluated = 0
        for sig in signals:
            outcome = check_win(series, sig["time"], sig["direction"], settings.intervalo_predicao_minutos)
            if outcome == "no_data":
                continue
            evaluated += 1
            if outcome in ("win_g0", "win_g1"):
                wins += 1
            else:
                losses += 1
        acc = (wins / evaluated) if evaluated > 0 else 0.0
        per_symbol[sym] = {
            "signals": len(signals),
            "evaluated": evaluated,
            "wins": wins,
            "losses": losses,
            "accuracy": acc,
        }
        total_signals += len(signals)
        total_wins += wins
        total_losses += losses
    day_acc = (total_wins / (total_wins + total_losses)) if (total_wins + total_losses) > 0 else 0.0
    return {
        "ref_day": ref_day,
        "pred_day": pred_day,
        "per_symbol": per_symbol,
        "selected_symbols": selected_symbols,
        "totals": {
            "signals": total_signals,
            "wins": total_wins,
            "losses": total_losses,
            "accuracy": day_acc,
            "evaluated": (total_wins + total_losses),
        },
    }


def calibrate_config(candles_dict: Dict[str, List[Dict[str, Any]]], base_ref_day: dt.date, min_acc: float, initial: Settings) -> Settings:
    # busca em grade usando APENAS o desempenho de base_ref_day -> base_ref_day+1
    pct_pred_list = [0.70, 0.75, 0.80, 0.85]
    dias_pred_list = [3, 4, 5]
    pivot_window_list = [1, 2, 3]
    cluster_pct_list = [0.0005, 0.001, 0.002]
    tol_zone_list = [0.0005, 0.001, 0.002]
    conf_steps_list = [2, 3]
    top_k_list = [3, 5, 7]
    min_acc_hist_list = [0.60, 0.70, 0.80]
    min_sinais_hist_list = [3, 5]
    vol_tol_k_list = [0.5, 0.8, 1.0]
    min_zone_strength_list = [1, 2]
    min_pred_occ_list = [2, 3, 4]
    best = None
    best_score = (-1.0, -1)  # (accuracy, evaluated)
    for pct in pct_pred_list:
        for dp in dias_pred_list:
            for pw in pivot_window_list:
                for cp in cluster_pct_list:
                    for tz in tol_zone_list:
                        for cs in conf_steps_list:
                            for tk in top_k_list:
                                for mah in min_acc_hist_list:
                                    for msh in min_sinais_hist_list:
                                        for vk in vol_tol_k_list:
                                            for zc in min_zone_strength_list:
                                                for mpo in min_pred_occ_list:
                                                    cand = Settings(
                                                        dias_para_backtest=initial.dias_para_backtest,
                                                        dias_predominancia=dp,
                                                        pct_predominancia=pct,
                                                        horas_futuras_para_prever=initial.horas_futuras_para_prever,
                                                        intervalo_predicao_minutos=initial.intervalo_predicao_minutos,
                                                        pivot_window=pw,
                                                        distancia_agrupamento_percentual=cp,
                                                        tolerancia_zona_percentual=tz,
                                                        confluencia_steps=cs,
                                                        horas_historicas_para_analisar=initial.horas_historicas_para_analisar,
                                                        top_k_pares=tk,
                                                        min_acc_hist=mah,
                                                        min_sinais_hist=msh,
                                                        vol_tol_k=vk,
                                                        min_zone_strength_count=zc,
                                                        min_pred_occurrences=mpo,
                                                    )
                                                    res = evaluate_day(candles_dict, cand, base_ref_day)
                                                    acc = res["totals"]["accuracy"]
                                                    evaluated = res["totals"]["evaluated"]
                                                    score = (acc, evaluated)
                                                    if score > best_score:
                                                        best_score = score
                                                        best = cand
                                                    # early stop if meets min_acc and enough evals
                                                    if acc >= min_acc and evaluated > 0:
                                                        return cand
    return best or initial


def run_autotune_consistency(candles_dict: Dict[str, List[Dict[str, Any]]], start_day: dt.date, num_days: int, min_acc: float, max_resets: int = 5) -> Dict[str, Any]:
    settings = current_settings
    days_seq = [start_day - dt.timedelta(days=i) for i in range(num_days)]
    resets = 0
    history_runs: List[Dict[str, Any]] = []
    while resets <= max_resets:
        run_days: List[Dict[str, Any]] = []
        ok_all = True
        for ref_day in days_seq:
            res = evaluate_day(candles_dict, settings, ref_day)
            run_days.append({
                "ref_day": res["ref_day"].isoformat(),
                "pred_day": res["pred_day"].isoformat(),
                "totals": res["totals"],
            })
            acc = res["totals"]["accuracy"]
            evaluated = res["totals"]["evaluated"]
            if evaluated == 0 or acc < min_acc:
                ok_all = False
                # calibrar com o dia anterior ao que falhou
                base_ref_day = ref_day - dt.timedelta(days=1)
                settings = calibrate_config(candles_dict, base_ref_day, min_acc, settings)
                resets += 1
                break
        history_runs.append({
            "settings": settings.__dict__,
            "days": run_days,
            "ok": ok_all,
        })
        if ok_all:
            avg_acc = sum(d["totals"]["accuracy"] for d in run_days) / len(run_days) if run_days else 0.0
            return {"final_settings": settings.__dict__, "days": run_days, "avg_accuracy": avg_acc, "resets": resets, "history": history_runs}
    # falhou em atingir consistência
    avg_acc = sum(d["totals"]["accuracy"] for d in history_runs[-1]["days"]) / len(history_runs[-1]["days"]) if history_runs and history_runs[-1]["days"] else 0.0
    return {"final_settings": settings.__dict__, "days": history_runs[-1]["days"] if history_runs else [], "avg_accuracy": avg_acc, "resets": resets, "history": history_runs, "failed": True}


def consistency_grid_search(candles_dict: Dict[str, List[Dict[str, Any]]], start_day: dt.date, num_days: int, min_acc: float, base: Settings) -> Optional[Dict[str, Any]]:
    days_seq = [start_day - dt.timedelta(days=i) for i in range(num_days)]
    # grade moderada focada em alta precisão
    pct_pred_list = [0.80]
    dias_pred_list = [4]
    pivot_window_list = [2]
    cluster_pct_list = [0.002]
    tol_zone_list = [0.001]
    conf_steps_list = [3]
    top_k_list = [5]
    min_acc_hist_list = [0.70]
    min_sinais_hist_list = [3]

    for pct, dp, pw, cp, tz, cs, tk, mah, msh in product(
        pct_pred_list,
        dias_pred_list,
        pivot_window_list,
        cluster_pct_list,
        tol_zone_list,
        conf_steps_list,
        top_k_list,
        min_acc_hist_list,
        min_sinais_hist_list,
    ):
        clear_caches()
        cand = Settings(
            dias_para_backtest=base.dias_para_backtest,
            dias_predominancia=dp,
            pct_predominancia=pct,
            horas_futuras_para_prever=base.horas_futuras_para_prever,
            intervalo_predicao_minutos=base.intervalo_predicao_minutos,
            pivot_window=pw,
            distancia_agrupamento_percentual=cp,
            tolerancia_zona_percentual=tz,
            confluencia_steps=cs,
            horas_historicas_para_analisar=base.horas_historicas_para_analisar,
            top_k_pares=tk,
            min_acc_hist=mah,
            min_sinais_hist=msh,
        )
        all_ok = True
        day_outputs: List[Dict[str, Any]] = []
        for ref_day in days_seq:
            res = evaluate_day(candles_dict, cand, ref_day)
            acc = res["totals"]["accuracy"]
            if res["totals"]["evaluated"] == 0 or acc < min_acc:
                all_ok = False
                break
            day_outputs.append({
                "ref_day": res["ref_day"].isoformat(),
                "pred_day": res["pred_day"].isoformat(),
                "totals": res["totals"],
            })
        if all_ok and len(day_outputs) == num_days:
            avg_acc = sum(d["totals"]["accuracy"] for d in day_outputs) / len(day_outputs)
            return {"final_settings": cand.__dict__, "days": day_outputs, "avg_accuracy": avg_acc}
    return None


# Instância global de settings usada por build_time_color_map
current_settings = Settings()

# Caches globais para acelerar
_sr_cache: Dict[Tuple[str, str, int, float, int], Tuple[List[float], List[float]]] = {}
_time_map_cache: Dict[Tuple[str, str, int, float], Dict[str, str]] = {}
_sr_counts_cache: Dict[Tuple[str, str, int, float, int], Tuple[List[Tuple[float, int]], List[Tuple[float, int]]]] = {}


def clear_caches() -> None:
    _sr_cache.clear()
    _time_map_cache.clear()
    _sr_counts_cache.clear()


def main() -> int:
    parser = argparse.ArgumentParser(description="Lê um arquivo .pkl de candles e resume seu conteúdo.")
    default_path = "/workspace/candles_data.pkl" if os.path.exists("/workspace/candles_data.pkl") else "candles_data.pkl"
    parser.add_argument("--path", "-p", default=default_path, help="Caminho do arquivo candles_data.pkl")
    parser.add_argument("--max-rows", type=int, default=5, help="Máximo de linhas para amostra exibida")
    parser.add_argument("--run-backtest", action="store_true", help="Executa o backtest de 10 dias (dia 14 para trás)")
    parser.add_argument("--auto-tune", action="store_true", help="Ativa autoajuste até manter consistência >= min-acc por 10 dias")
    parser.add_argument("--min-acc", type=float, default=0.85, help="Acurácia mínima por dia para considerar sucesso")
    parser.add_argument("--show", choices=["summary", "backtest"], default="backtest", help="Ação ao rodar")
    parser.add_argument("--pct-pred", type=float, default=PCT_PREDOMINANCIA_DEFAULT, help="Percentual de predominância temporal")
    parser.add_argument("--dias-pred", type=int, default=DIAS_PREDOMINANCIA_DEFAULT, help="Dias usados para predominância temporal")
    parser.add_argument("--dias-sr", type=int, default=DIAS_PARA_BACKTEST_DEFAULT, help="Dias usados para S/R")
    parser.add_argument("--pivot-win", type=int, default=PIVOT_WINDOW_DEFAULT, help="Janela de pivô (velas à esquerda/direita)")
    parser.add_argument("--cluster-pct", type=float, default=DISTANCIA_AGRUPAMENTO_PERCENTUAL_DEFAULT, help="Agrupamento de níveis S/R (percentual)")
    parser.add_argument("--tol-zone", type=float, default=TOLERANCIA_ZONA_PERCENTUAL_DEFAULT, help="Tolerância para zona ativa (percentual)")
    parser.add_argument("--conf-steps", type=int, default=CONFLUENCIA_STEPS_DEFAULT, help="Passos na confluência temporal (ex.: 3 = g0,g1,g2)")
    parser.add_argument("--h-fut", type=int, default=HORAS_FUTURAS_PARA_PREVER_DEFAULT, help="Horas futuras para prever")
    parser.add_argument("--step-min", type=int, default=INTERVALO_PREDICAO_MINUTOS_DEFAULT, help="Intervalo da predição em minutos")
    parser.add_argument("--h-hist", type=int, default=HORAS_HISTORICAS_PARA_ANALISAR_DEFAULT, help="Horas históricas para seleção de pares")
    parser.add_argument("--top-k", type=int, default=TOP_K_PARES_DEFAULT, help="Top-K pares por desempenho histórico")
    parser.add_argument("--min-acc-hist", type=float, default=MIN_ACC_HIST_DEFAULT, help="Acurácia mínima histórica para considerar o par")
    parser.add_argument("--min-sinais-hist", type=int, default=MIN_SINAIS_HIST_DEFAULT, help="Mínimo de sinais históricos avaliados para considerar o par")
    parser.add_argument("--vol-tol-k", type=float, default=VOL_TOL_K_DEFAULT, help="Fator da tolerância absoluta baseada em volatilidade mediana")
    parser.add_argument("--min-zone-strength-count", type=int, default=MIN_ZONE_STRENGTH_COUNT_DEFAULT, help="Contagem mínima de pivôs no cluster da zona")
    parser.add_argument("--min-pred-occ", type=int, default=MIN_PRED_OCCURRENCES_DEFAULT, help="Ocorrências mínimas para aceitar predominância de horário")
    parser.add_argument("--zone-min-pct", type=float, default=ZONE_MIN_PCT_DEFAULT, help="Distância mínima da zona em % (ex.: 0.002=0.2%)")
    parser.add_argument("--zone-max-pct", type=float, default=ZONE_MAX_PCT_DEFAULT, help="Distância máxima da zona em % (ex.: 0.005=0.5%)")
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

    # Modo backtest
    if args.auto_tune or args.run_backtest or args.show == "backtest":
        if not isinstance(obj, dict):
            print("O arquivo não está no formato esperado {symbol: list[dict]} para o backtest.")
            return 4
        global current_settings
        current_settings = Settings(
            dias_para_backtest=args.dias_sr,
            dias_predominancia=args.dias_pred,
            pct_predominancia=args.pct_pred,
            horas_futuras_para_prever=args.h_fut,
            intervalo_predicao_minutos=args.step_min,
            pivot_window=args.pivot_win,
            distancia_agrupamento_percentual=args.cluster_pct,
            tolerancia_zona_percentual=args.tol_zone,
            confluencia_steps=args.conf_steps,
            horas_historicas_para_analisar=args.h_hist,
            top_k_pares=args.top_k,
            min_acc_hist=args.min_acc_hist,
            min_sinais_hist=args.min_sinais_hist,
            vol_tol_k=args.vol_tol_k,
            min_zone_strength_count=args.min_zone_strength_count,
            min_pred_occurrences=args.min_pred_occ,
            zone_min_pct=args.zone_min_pct,
            zone_max_pct=args.zone_max_pct,
        )

        candles_dict = obj
        # determinar o dia 14 mais recente presente no dataset e que possua o dia seguinte disponível
        # vamos usar o primeiro símbolo para o calendário
        any_sym = next(iter(candles_dict.keys()))
        series = symbol_to_df(candles_dict[any_sym])
        days = get_unique_days(series)
        # procurar última ocorrência de dia=14 que tenha day+1 presente
        start_day = None
        day_set = set(days)
        for d in reversed(days):
            if d.day == 14 and (d + dt.timedelta(days=1)) in day_set:
                start_day = d
                break
        if start_day is None:
            # fallback: usar penúltimo dia disponível
            if len(days) >= 2:
                start_day = days[-2]
            else:
                print("Dias insuficientes para backtest.")
                return 5

        if args.auto_tune:
            print_section(f"Auto-tune + Backtest (início no dia {start_day.isoformat()}, 10 dias)")
            # 1) tentativa de busca global por uma única configuração consistente
            global_search = consistency_grid_search(candles_dict, start_day, num_days=10, min_acc=args.min_acc, base=current_settings)
            if global_search is not None:
                print("Configurações finais (busca global):")
                for k, v in global_search["final_settings"].items():
                    print(f"  - {k}: {v}")
                print_section("Resultados por dia")
                for day_res in global_search["days"]:
                    acc = day_res["totals"]["accuracy"]
                    print(f"Dia {day_res['ref_day']} -> {day_res['pred_day']}: sinais={day_res['totals']['signals']} acurácia={acc*100:.2f}%")
                print_section("Resumo")
                print(f"Acurácia média (10 dias): {global_search['avg_accuracy']*100:.2f}% | resets: 0")
                print("Status:", "CONSISTENTE")
                return 0
            tuned = run_autotune_consistency(candles_dict, start_day, num_days=10, min_acc=args.min_acc, max_resets=6)
            print("Configurações finais:")
            for k, v in tuned["final_settings"].items():
                print(f"  - {k}: {v}")
            print_section("Resultados por dia")
            all_ok = True
            for day_res in tuned["days"]:
                acc = day_res["totals"]["accuracy"]
                print(f"Dia {day_res['ref_day']} -> {day_res['pred_day']}: sinais={day_res['totals']['signals']} acurácia={acc*100:.2f}%")
                if acc < args.min_acc or day_res["totals"]["evaluated"] == 0:
                    all_ok = False
            print_section("Resumo")
            print(f"Acurácia média (10 dias): {tuned['avg_accuracy']*100:.2f}% | resets: {tuned['resets']}")
            print("Status:", "CONSISTENTE" if all_ok and len(tuned["days"]) == 10 else "NÃO CONSISTENTE")
            return 0
        else:
            print_section(f"Backtest (início no dia {start_day.isoformat()}, 10 dias para trás)")
            t0 = time.monotonic()
            result = run_backtest(candles_dict, current_settings, start_day, num_days=10)
            elapsed = time.monotonic() - t0
            # imprimir resultados resumidos
            print("Configurações:")
            for k, v in result["settings"].items():
                print(f"  - {k}: {v}")
            print_section("Resultados por dia")
            consistent = True
            for day_res in result["days"]:
                acc = day_res["totals"]["accuracy"]
                print(f"Dia {day_res['ref_day']} -> {day_res['pred_day']}: sinais={day_res['totals']['signals']} acurácia={acc*100:.2f}%")
                if acc < args.min_acc:
                    consistent = False
            print_section("Resumo")
            print(f"Acurácia média (10 dias): {result['avg_accuracy']*100:.2f}%")
            print(f"Tempo total: {elapsed:.2f}s")
            if consistent:
                print("Status: CONSISTENTE (todos os dias acima do alvo)")
                return 0
            else:
                print("Status: FALHOU em manter a consistência >= alvo (sem ajuste automático nesta execução)")
                return 0

    # Caso contrário, mostrar resumo do conteúdo (modo antigo)
    print_section("Objeto raiz")
    print(f"Tipo: {type(obj).__name__}")

    try:
        if pd is not None and hasattr(obj, "__class__") and obj.__class__.__name__ == "DataFrame":
            summarize_dataframe(obj, max_rows=args.max_rows)  # type: ignore[arg-type]
        elif isinstance(obj, dict):
            summarize_mapping(obj, max_items=5, max_rows=args.max_rows)
        elif isinstance(obj, (list, tuple)):
            summarize_sequence(obj, max_items=3, max_rows=args.max_rows)
        else:
            print("Resumo genérico do objeto:")
            for attr in ["keys", "__len__", "shape", "columns"]:
                try:
                    val = getattr(obj, attr)
                    if callable(val):
                        val = val()
                    print(f"  - {attr}: {safe_repr(val)}")
                except Exception:
                    pass
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