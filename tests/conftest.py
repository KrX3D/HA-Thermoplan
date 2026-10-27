import importlib.util

import pytest

if importlib.util.find_spec("pytest_homeassistant_custom_component"):

    @pytest.fixture(autouse=True)
    def _auto_enable_custom_integrations(enable_custom_integrations):
        yield
