from datetime import datetime, time, timedelta

from custom_components.thermoplan.engine import away, override
from custom_components.thermoplan.engine.cutoff import OutdoorCutoff
from custom_components.thermoplan.engine.schedule import (
    Block,
    Schedule,
    resolve,
    validate,
)

MON = datetime(2026, 10, 26)  # a Monday


def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    return MON.replace(hour=hour, minute=minute) + timedelta(days=day_offset)


def test_resolve_block_and_default():
    sched = Schedule("s", {0: (Block(420, 720, 20.0),)}, default_target=16.0)
    assert resolve(sched, at(0, 8)).target == 20.0
    assert resolve(sched, at(0, 8)).from_block
    assert resolve(sched, at(0, 12)).target == 16.0  # end is exclusive
    assert not resolve(sched, at(0, 12)).from_block
    assert resolve(sched, at(1, 8)).target == 16.0


def test_block_crossing_midnight():
    sched = Schedule("s", {0: (Block(1320, 1440 + 420, 18.0),)}, default_target=None)
    assert resolve(sched, at(0, 23)).target == 18.0
    assert resolve(sched, at(1, 6, 59)).target == 18.0
    assert resolve(sched, at(1, 7)).target is None


def test_sunday_spills_into_monday():
    sched = Schedule("s", {6: (Block(1380, 1440 + 120, 19.0),)}, default_target=10.0)
    assert resolve(sched, at(7, 1)).target == 19.0  # next Monday 01:00
    assert resolve(sched, at(7, 2)).target == 10.0


def test_off_block():
    sched = Schedule("s", {0: (Block(0, 1440, None),)}, default_target=20.0)
    assert resolve(sched, at(0, 12)).target is None
    assert resolve(sched, at(0, 12)).from_block


def test_validate_overlap_and_ranges():
    ok = Schedule("s", {0: (Block(0, 600, 20), Block(600, 1500, 18))})
    assert validate(ok) == []
    overlap = Schedule("s", {0: (Block(0, 600, 20), Block(500, 700, 18))})
    assert validate(overlap)
    spill = Schedule("s", {0: (Block(1300, 1500, 20),), 1: (Block(0, 100, 18),)})
    assert validate(spill)
    assert validate(Schedule("s", {0: (Block(600, 600, 20),)}))
    assert validate(Schedule("s", {0: (Block(0, 3000, 20),)}))
    wrap = Schedule("s", {6: (Block(1300, 1500, 20),), 0: (Block(0, 100, 18),)})
    assert validate(wrap)


def test_away_resume_time():
    now = datetime(2026, 10, 1, 10)
    resume = away.resume_at(now, 3, time(13))
    assert resume == datetime(2026, 10, 4, 13)
    assert away.is_away(datetime(2026, 10, 4, 12, 59), resume)
    assert not away.is_away(datetime(2026, 10, 4, 13), resume)
    assert away.remaining_days(now, resume) == 3
    assert away.remaining_days(datetime(2026, 10, 4, 9), resume) == 1
    assert away.remaining_days(datetime(2026, 10, 4, 13), resume) == 0
    assert away.resume_at(now, 0, time(13)) is None
    assert not away.is_away(now, None)


def test_cutoff_hysteresis():
    cut = OutdoorCutoff(off_after=timedelta(minutes=30), on_after=timedelta(minutes=10))
    assert cut.update(at(0, 12, 0), 20.0, 19.0)  # warm, timer starts
    assert cut.update(at(0, 12, 29), 20.0, 19.0)
    assert not cut.update(at(0, 12, 30), 20.0, 19.0)  # off after 30 min
    assert not cut.update(at(0, 12, 40), 18.0, 19.0)  # cold, timer starts
    assert cut.update(at(0, 12, 50), 18.0, 19.0)  # on again after 10 min


def test_cutoff_timer_resets_and_follows_target():
    cut = OutdoorCutoff(off_after=timedelta(minutes=30), on_after=timedelta(minutes=10))
    cut.update(at(0, 12, 0), 20.0, 19.0)
    cut.update(at(0, 12, 20), 18.0, 19.0)  # cooled down, timer resets
    assert cut.update(at(0, 12, 40), 20.0, 19.0)
    # Night target 18 makes 18.5 outdoor warm enough to cut off.
    night = OutdoorCutoff(off_after=timedelta(minutes=120), on_after=timedelta(minutes=10))
    night.update(at(0, 22, 0), 18.5, 18.0)
    assert not night.update(at(1, 0, 0), 18.5, 18.0)


def test_cutoff_ignores_missing_data():
    cut = OutdoorCutoff(off_after=timedelta(0), on_after=timedelta(0), offset=1.0)
    assert cut.update(at(0, 1), None, 19.0)
    assert cut.update(at(0, 1), 25.0, None)
    assert cut.update(at(0, 1), 19.5, 19.0)  # below target + offset
    assert not cut.update(at(0, 2), 20.0, 19.0)


def test_override():
    start = at(0, 10)
    ov = override.Override(start, 60)
    assert ov.active(at(0, 10, 59))
    assert not ov.active(at(0, 11))
    assert not override.Override(start, 0).active(start)
    assert override.is_manual_change(20.0, 21.0)
    assert override.is_manual_change(22.0, 21.5)  # one thermostat step is a manual change
    assert not override.is_manual_change(20.0, 20.2)  # rounding noise is not
    assert not override.is_manual_change(None, 20.0)


def test_cutoff_fixed_threshold():
    cut = OutdoorCutoff(
        off_after=timedelta(0), on_after=timedelta(0), threshold=15.0, offset=1.0
    )
    assert cut.update(at(0, 1), 15.5, 22.0)  # below 16 even though the target is higher
    assert not cut.update(at(0, 2), 16.0, 22.0)
    assert not cut.update(at(0, 3), 20.0, None)  # target is irrelevant with a threshold


def test_resolve_reports_the_matching_block():
    sched = Schedule("s", {0: (Block(420, 720, 20.0),)}, default_target=16.0)
    assert resolve(sched, at(0, 8)).block == (420, 720)
    assert resolve(sched, at(0, 13)).block is None


def test_adjust_offset_and_limits():
    from custom_components.thermoplan.engine.adjust import adjust

    assert adjust(21.0, offset=1.5) == (22.5, ["+1.5 °C adjustment"])
    assert adjust(21.0, offset=-2.0, minimum=20.0) == (20.0, ["-2 °C adjustment", "raised to the minimum of 20 °C"])
    assert adjust(24.0, maximum=22.5) == (22.5, ["limited to the maximum of 22.5 °C"])
    assert adjust(21.0) == (21.0, [])
    assert adjust(None, offset=3, minimum=10, maximum=20) == (None, [])  # off stays off


def test_occupancy_states():
    from custom_components.thermoplan.engine.occupancy import occupied

    assert occupied("on") is True and occupied("home") is True
    assert occupied("off") is False and occupied("not_home") is False
    assert occupied("unavailable") is None and occupied(None) is None


def test_calendar_matches_titles():
    from custom_components.thermoplan.engine.daytype import calendar_matches

    assert calendar_matches("Frei", "Frei") and calendar_matches("frei", "FREI, Urlaub")
    assert not calendar_matches("Arzt", "Frei, Urlaub")
    assert calendar_matches("anything", "") and calendar_matches(None, None)


def test_workday_sensor_holiday_detection():
    from custom_components.thermoplan.engine.daytype import workday_sensor_says_holiday as holiday

    work = ["mon", "tue", "wed", "thu", "fri"]
    assert holiday("off", work, 2)  # Wednesday off: holiday
    assert not holiday("on", work, 2)
    assert not holiday("off", work, 5)  # Saturday off is normal
    assert holiday("off", None, 0)  # no attribute: Monday to Friday assumed


def test_resolve_with_weekday_override():
    sched = Schedule("s", {0: (Block(420, 720, 20.0),), 6: (Block(540, 600, 22.0),)}, default_target=None)
    assert resolve(sched, at(0, 8)).target == 20.0
    assert resolve(sched, at(0, 9, 30), weekday=6).target == 22.0  # Monday treated like Sunday


def test_next_change_finds_the_next_block():
    from custom_components.thermoplan.engine.schedule import next_change

    sched = Schedule("s", {0: (Block(360, 420, 18.0), Block(420, 600, 21.0))}, default_target=None)
    assert next_change(sched, at(0, 6, 30)) == (30, 21.0)
    assert next_change(sched, at(0, 8)) is None  # then it goes off: ignored
    assert next_change(sched, at(0, 5)) is None  # off now


def _simulate(power, k, outdoor, setpoint_for, hours=36):
    """Simulate a room with known physics and feed the tracker once a minute."""
    from datetime import timedelta

    from custom_components.thermoplan.engine.learning import SegmentTracker, classify

    tracker, samples, temp = SegmentTracker(), [], 17.0
    now = at(0, 0)
    for _ in range(hours * 60):
        setpoint = setpoint_for(now)
        kind = classify("heat", round(temp, 1), setpoint)
        heating = setpoint is not None and setpoint >= temp + 0.5
        temp += (power if heating else 0.0) - k * (temp - outdoor)
        sample = tracker.update(now, kind, round(temp, 1), outdoor)
        if sample:
            samples.append(sample)
        now += timedelta(minutes=1)
    return samples


def test_learning_recovers_the_physics_of_a_simulated_room():
    from custom_components.thermoplan.engine.learning import fit, temp_after, time_to_reach

    power, k, outdoor = 0.06, 0.002, 5.0

    def setpoint_for(now):  # 21 °C in the evening, 17 °C otherwise
        return 21.0 if 17 <= now.hour < 22 else 15.0

    samples = _simulate(power, k, outdoor, setpoint_for)
    model = fit(samples)
    assert model.n_heat >= 1 and model.n_idle >= 1
    assert abs(model.k - k) < 0.0006
    assert abs(model.power - power) < 0.02
    # prediction against the real physics: 17 -> 21 °C
    import math
    t_eq = outdoor + power / k
    truth = math.log((t_eq - 17) / (t_eq - 21)) / k
    assert abs(time_to_reach(model, 17, 21, outdoor) - truth) < 0.25 * truth
    # cooling prediction: 21 °C after 3 hours without heating
    real = outdoor + (21 - outdoor) * math.exp(-k * 180)
    assert abs(temp_after(model, 21, 180, outdoor) - real) < 0.5


def test_learning_ignores_short_or_flat_segments():
    from custom_components.thermoplan.engine.learning import HEAT, SegmentTracker

    tracker = SegmentTracker()
    out = [tracker.update(at(0, 8, m), HEAT, 20.0 + m * 0.001, 5.0) for m in range(15)]
    assert not any(out)  # shorter than 20 minutes
    tracker = SegmentTracker()
    out = [tracker.update(at(0, 8, m), HEAT, 20.0, 5.0) for m in range(40)]
    out.append(tracker.update(at(0, 8, 45), None, 20.0, 5.0))
    assert not any(out)  # temperature did not move


def test_time_to_reach_edge_cases():
    from custom_components.thermoplan.engine.learning import Model, time_to_reach

    assert time_to_reach(Model(None, 0.05, 3, 0), 20, 19, 5) == 0.0
    assert time_to_reach(Model(None, None, 0, 0), 18, 21, 5) is None  # nothing learned yet
    assert time_to_reach(Model(0.01, 0.01, 3, 3), 18, 40, 5) is None  # cannot get there
    assert abs(time_to_reach(Model(None, 0.05, 3, 0), 18, 21, 5) - 60.0) < 1e-6


def test_presence_rule_round_trip_keeps_from_state_and_delay():
    from custom_components.thermoplan.model import PresenceRule, Settings, settings_from_dict, settings_to_dict

    settings = Settings()
    settings.presence_rules = [PresenceRule("home", "Home"), PresenceRule("not_home", "Warm", "work", 90)]
    back = settings_from_dict(settings_to_dict(settings))
    assert back.presence_rules[0].from_state is None and back.presence_rules[0].delay is None
    assert (back.presence_rules[1].from_state, back.presence_rules[1].delay) == ("work", 90)


def test_slow_heating_is_not_a_heat_up_and_old_slow_samples_are_ignored():
    from custom_components.thermoplan.engine.learning import HEAT, SegmentTracker, Sample, classify, fit

    assert classify("heat", 22.0, 22.5) is None  # only 0.5 above: just keeping warm
    assert classify("heat", 22.0, 22.5, "heating") == HEAT  # but the thermostat says it is heating
    tracker = SegmentTracker()
    now = at(0, 0)
    from datetime import timedelta
    sample = None
    for minute in range(0, 400, 5):  # +0.8 over 400 minutes: 0.12 per hour
        sample = tracker.update(now + timedelta(minutes=minute), HEAT, 21.0 + 0.8 * minute / 400, 5.0) or sample
    sample = tracker.update(now + timedelta(minutes=405), None, 21.8, 5.0) or sample
    assert sample is None
    slow = Sample(kind=HEAT, minutes=400, delta=0.8, t_avg=21.4, t_out=5.0, rate=0.8 / 400, at="2026-11-06T10:00:00")
    assert fit([slow, slow, slow]).n_heat == 0
