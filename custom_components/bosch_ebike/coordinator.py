"""DataUpdateCoordinator for Bosch eBike."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.exceptions import ConfigEntryAuthFailed

from .api import BoschEBikeAPI, AuthError
from .const import DOMAIN, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


class BoschEBikeCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to fetch Bosch eBike data."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, api: BoschEBikeAPI) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=DEFAULT_SCAN_INTERVAL),
        )
        self.api = api

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch bikes and latest activity from Bosch API."""
        try:
            _LOGGER.debug("Fetching bike data from Bosch API")
            bikes = await self.api.get_bikes()
            _LOGGER.debug("Got %d bikes", len(bikes))
            latest_activity = await self.api.get_latest_activity()
            _LOGGER.debug("Got latest activity: %s", "yes" if latest_activity else "no")
        except AuthError as err:
            _LOGGER.error("Authentication error: %s", err)
            raise ConfigEntryAuthFailed(str(err)) from err
        except Exception as err:
            _LOGGER.error("Error fetching data: %s", err)
            raise UpdateFailed(f"Error fetching data: {err}") from err

        # Persist updated tokens back to config entry
        self.hass.config_entries.async_update_entry(
            self.config_entry,
            data={
                **self.config_entry.data,
                "access_token": self.api.access_token,
                "refresh_token": self.api.refresh_token,
            },
        )

        return {
            "bikes": bikes,
            "latest_activity": latest_activity,
        }
