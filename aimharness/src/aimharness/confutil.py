"""Helpers to map TOML dictionaries onto (nested) dataclasses."""

from __future__ import annotations

import dataclasses
import types
import typing
import warnings
from typing import Any, TypeVar

T = TypeVar("T")


def parse_color(value: Any) -> tuple[int, int, int]:
    """Accept '#rrggbb', 'rrggbb' or a 3-element sequence."""
    if isinstance(value, str):
        s = value.lstrip("#")
        if len(s) != 6:
            raise ValueError(f"invalid color {value!r}")
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    r, g, b = value
    return int(r), int(g), int(b)


def _coerce(tp: Any, value: Any, path: str) -> Any:
    origin = typing.get_origin(tp)
    args = typing.get_args(tp)

    if dataclasses.is_dataclass(tp):
        if not isinstance(value, dict):
            raise TypeError(f"{path}: expected table, got {type(value).__name__}")
        return from_dict(tp, value, path)
    if origin in (typing.Union, types.UnionType):
        if value is None and type(None) in args:
            return None
        for arg in args:
            if arg is type(None):
                continue
            try:
                return _coerce(arg, value, path)
            except (TypeError, ValueError):
                continue
        raise TypeError(f"{path}: cannot convert {value!r} to {tp}")
    if origin is tuple:
        if args and args[-1] is Ellipsis:
            return tuple(_coerce(args[0], v, path) for v in value)
        if len(value) != len(args):
            raise ValueError(f"{path}: expected {len(args)} values, got {len(value)}")
        return tuple(_coerce(a, v, path) for a, v in zip(args, value))
    if origin is list:
        if not isinstance(value, (list, tuple)):
            value = [value]
        return [_coerce(args[0], v, path) for v in value]
    if tp is float:
        if isinstance(value, bool):
            raise TypeError(f"{path}: expected number")
        return float(value)
    if tp is int:
        if isinstance(value, bool) or (isinstance(value, float) and not value.is_integer()):
            raise TypeError(f"{path}: expected integer")
        return int(value)
    if tp is bool:
        if not isinstance(value, bool):
            raise TypeError(f"{path}: expected true/false")
        return value
    if tp is str:
        return str(value)
    return value


def from_dict(cls: type[T], data: dict[str, Any], path: str = "") -> T:
    """Build dataclass ``cls`` from ``data``; missing keys keep their defaults."""
    hints = typing.get_type_hints(cls)
    known = {f.name for f in dataclasses.fields(cls)}
    kwargs = {}
    for key, value in data.items():
        if key not in known:
            warnings.warn(f"unknown config key '{path}{key}' ignored", stacklevel=2)
            continue
        kwargs[key] = _coerce(hints[key], value, f"{path}{key}")
    return cls(**kwargs)


def to_dict(obj: Any) -> Any:
    """JSON-friendly representation of a (nested) dataclass."""
    if dataclasses.is_dataclass(obj):
        return {f.name: to_dict(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, (list, tuple)):
        return [to_dict(v) for v in obj]
    return obj
