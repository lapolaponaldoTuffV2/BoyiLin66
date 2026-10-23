#!/bin/sh
# Package hook: apply (or drop) the BOYI 66 Pro udev rule without a replug.
udevadm control --reload-rules 2>/dev/null || true
udevadm trigger --subsystem-match=hidraw 2>/dev/null || true
exit 0
