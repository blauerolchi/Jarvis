"""Column definitions of the recorded session tables.

All ``t_ns`` columns are nanoseconds relative to the session start (t0) on the
``time.perf_counter_ns`` clock (QueryPerformanceCounter on Windows). Angles are
degrees, yaw wrapped to [-180, 180).
"""

SCHEMA_VERSION = 1

TABLES: dict[str, dict[str, str]] = {
    # One row per mouse report as delivered by the input backend.
    "input_events": {
        "seq": "int64",
        "t_ns": "int64",
        "t_msg_ms": "int64",        # OS message time (ms), 0 if unavailable
        "frame": "int64",           # frame in which the event was consumed
        "dx": "int32",              # raw counts
        "dy": "int32",
        "button_flags": "int32",    # LMB_DOWN=0x1, LMB_UP=0x2, RMB_DOWN=0x4, ...
        "flags": "int32",           # 0x1 absolute coordinates, 0x2 RIM_INPUTSINK
        "device": "int64",
        "yaw_deg": "float64",       # crosshair direction after applying the event
        "pitch_deg": "float64",
        "paused": "bool",
    },
    # One row per rendered frame.
    "frames": {
        "frame": "int64",
        "t_ns": "int64",            # frame start (simulation time of this frame)
        "t_present_ns": "int64",    # after display flip returned
        "dt_ms": "float32",
        "yaw_deg": "float64",       # crosshair direction that was rendered
        "pitch_deg": "float64",
        "n_events": "int32",
        "sum_dx": "int32",
        "sum_dy": "int32",
        "lmb": "bool",
        "on_target": "int64",       # target id under the crosshair, -1 if none
        "paused": "bool",
    },
    # Per frame and alive target.
    "target_frames": {
        "frame": "int64",
        "target_id": "int64",
        "yaw_deg": "float64",
        "pitch_deg": "float64",
        "distance_m": "float32",
        "radius_m": "float32",
        "ang_radius_deg": "float32",
        "screen_x": "float32",
        "screen_y": "float32",
        "screen_r": "float32",
        "on_screen": "bool",
    },
    # One row per target (life cycle).
    "targets": {
        "target_id": "int64",
        "cond_id": "int32",
        "amplitude_nominal_deg": "float64",
        "is_home": "bool",
        "spawn_t_ns": "int64",
        "spawn_frame": "int64",
        "visible_t_ns": "int64",    # present time of the first frame showing it on screen
        "visible_frame": "int64",
        "end_t_ns": "int64",
        "end_frame": "int64",
        "outcome": "string",        # killed | expired | session_end
        "spawn_yaw_deg": "float64",
        "spawn_pitch_deg": "float64",
        "distance_m": "float32",
        "radius_m": "float32",
        "ang_radius_deg": "float32",
        "hp": "int32",
        "hits": "int32",
        "speed_mps": "float32",
    },
    # One row per left click.
    "shots": {
        "shot_id": "int64",
        "t_ns": "int64",
        "frame": "int64",
        "yaw_deg": "float64",
        "pitch_deg": "float64",
        "hit": "bool",
        "killed": "bool",
        "target_id": "int64",       # hit target, else nearest target, -1 if none alive
        "err_deg": "float64",       # angle crosshair -> target centre
        "err_x_deg": "float64",     # target - crosshair, tangent plane (+ = right)
        "err_y_deg": "float64",     # (+ = up)
        "ang_radius_deg": "float64",
    },
    # Discrete events: spawn, kill, expire, hit, reverse_x, reverse_y, pause, resume.
    "target_events": {
        "t_ns": "int64",
        "frame": "int64",
        "target_id": "int64",
        "kind": "string",
        "value": "float64",
    },
}
