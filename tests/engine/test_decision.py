from custom_components.thermoplan.engine.decision import Reason, decide

BASE = dict(
    window_open=False,
    override_active=False,
    season_active=True,
    away=False,
    heating_allowed=True,
    schedule_target=20.0,
    from_block=True,
)


def run(**changes):
    return decide(**{**BASE, **changes})


def test_schedule_and_default():
    assert run() == run(from_block=True)
    assert run().target == 20.0 and run().reason == Reason.SCHEDULE
    assert run(from_block=False).reason == Reason.DEFAULT


def test_off_reasons():
    assert run(season_active=False).reason == Reason.OUTSIDE_SEASON
    assert run(away=True).reason == Reason.AWAY
    assert run(heating_allowed=False).reason == Reason.OUTDOOR_CUTOFF
    assert run(schedule_target=None).reason == Reason.SCHEDULE_OFF
    assert run(away=True).target is None


def test_override_holds_but_window_wins():
    assert run(override_active=True, away=True).hold
    assert run(override_active=True, window_open=True).reason == Reason.WINDOW
    assert not run(override_active=True, window_open=True).hold


def test_priority_order():
    assert run(season_active=False, away=True, heating_allowed=False).reason == Reason.OUTSIDE_SEASON
    assert run(away=True, heating_allowed=False).reason == Reason.AWAY
